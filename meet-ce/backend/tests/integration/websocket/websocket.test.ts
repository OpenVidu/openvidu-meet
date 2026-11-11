import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { MeetWebSocketCloseCode, type MeetWebSocketMessage } from '@openvidu-meet/typings';
import express from 'express';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { MEET_ENV } from '../../../src/environment.js';
import { webSocketHandshakeGuard } from '../../../src/middlewares/rate-limit.middleware.js';
import type { WebSocketFeature } from '../../../src/models/websocket.model.js';
import { LoggerService } from '../../../src/services/logger.service.js';
import { WebSocketService } from '../../../src/services/websocket.service.js';
import { RedisService } from '../../../src/services/redis.service.js';
import { RequestSessionService } from '../../../src/services/request-session.service.js';

const ROOM_ID = `websocket_room_${Date.now()}`;

/** A ticket names its address: `ticket-<address>`. Any other value is unknown. */
const testFeature: WebSocketFeature = {
	credential: 'testTicket',
	resolve: async (ticket) => (ticket.startsWith('ticket-') ? { roomId: ROOM_ID, address: ticket.slice(7) } : null),
	onOpen: (connection) => connection.send('test.opened', { address: connection.address }),
	onPong: (connection) => connection.send('test.pong')
};

class TestReplica extends WebSocketService {
	readonly httpServer: http.Server;
	readonly app = express();

	constructor(readonly redis: RedisService) {
		const logger = new LoggerService();
		super(logger, redis, new RequestSessionService(logger));
		this.httpServer = http.createServer(this.app);
		this.register(testFeature);
	}

	async start(): Promise<void> {
		await new Promise<void>((resolve) => this.httpServer.listen(0, '127.0.0.1', resolve));
		await this.attach(this.httpServer, webSocketHandshakeGuard(this.app));
	}

	url(query: string): string {
		const { port } = this.httpServer.address() as AddressInfo;
		return `ws://127.0.0.1:${port}${this.path}?${query}`;
	}

	runLivenessCycle(): void {
		this.checkLiveness();
	}

	async stop(): Promise<void> {
		this.close();
		await new Promise((resolve) => this.httpServer.close(resolve));
		this.redis.cleanup();
	}
}

interface TestClient {
	socket: WebSocket;
	/** Resolves with the next message, or the next one of the given type. */
	next(type?: string): Promise<MeetWebSocketMessage>;
	closed: Promise<number>;
}

const openClients: WebSocket[] = [];

const connect = (url: string, headers: Record<string, string> = {}): TestClient => {
	const socket = new WebSocket(url, { headers });
	openClients.push(socket);
	const queue: MeetWebSocketMessage[] = [];
	const waiters: (() => void)[] = [];

	socket.on('message', (frame) => {
		queue.push(JSON.parse(String(frame)) as MeetWebSocketMessage);
		waiters.splice(0).forEach((wake) => wake());
	});
	socket.on('error', () => {});

	const next = async (type?: string): Promise<MeetWebSocketMessage> => {
		for (;;) {
			const index = queue.findIndex(
				(message) => message.type !== 'heartbeat' && (!type || message.type === type)
			);

			if (index >= 0) {
				return queue.splice(0, index + 1).pop()!;
			}

			await new Promise<void>((wake) => waiters.push(wake));
		}
	};

	return { socket, next, closed: new Promise((resolve) => socket.on('close', resolve)) };
};

const connectAs = async (replica: TestReplica, address: string): Promise<TestClient> => {
	const client = connect(replica.url(`testTicket=ticket-${address}`));
	expect(await client.next()).toEqual({ type: 'test.opened', data: { address } });
	return client;
};

const answers = (url: string, headers: Record<string, string>): Promise<number | 'open'> =>
	new Promise((resolve) => {
		const socket = new WebSocket(url, { headers });
		socket.on('open', () => {
			resolve('open');
			socket.terminate();
		});
		socket.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
		socket.on('error', () => {});
	});

describe('WebSocket channel', () => {
	let replicaA: TestReplica;
	let replicaB: TestReplica;

	beforeAll(async () => {
		replicaA = new TestReplica(new RedisService(new LoggerService()));
		replicaB = new TestReplica(new RedisService(new LoggerService()));
		await Promise.all([replicaA.start(), replicaB.start()]);
	});

	afterEach(() => {
		openClients.splice(0).forEach((socket) => socket.terminate());
	});

	afterAll(async () => {
		await Promise.all([replicaA.stop(), replicaB.stop()]);
	});

	describe('Delivery', () => {
		it('reaches a connection held by another replica', async () => {
			const client = await connectAs(replicaA, 'alice');

			await replicaB.send(ROOM_ID, 'alice', 'test.state', { step: 1 });

			expect(await client.next()).toEqual({ type: 'test.state', data: { step: 1 } });
		});

		it('reaches every connection of the address, whichever replica holds it', async () => {
			const onA = await connectAs(replicaA, 'alice');
			const onB = await connectAs(replicaB, 'alice');

			await replicaA.send(ROOM_ID, 'alice', 'test.state');

			expect(await onA.next()).toEqual({ type: 'test.state' });
			expect(await onB.next()).toEqual({ type: 'test.state' });
		});

		it('reaches nobody else of the room', async () => {
			const alice = await connectAs(replicaA, 'alice');
			const bob = await connectAs(replicaB, 'bob');

			await replicaA.send(ROOM_ID, 'alice', 'test.for-alice');
			await replicaA.send(ROOM_ID, 'bob', 'test.for-bob');

			expect(await alice.next()).toEqual({ type: 'test.for-alice' });
			expect(await bob.next()).toEqual({ type: 'test.for-bob' });
		});

		it('ignores what a client sends', async () => {
			const client = await connectAs(replicaA, 'alice');

			client.socket.send(JSON.stringify({ type: 'test.from-client' }));
			await replicaB.send(ROOM_ID, 'alice', 'test.state');

			expect(await client.next()).toEqual({ type: 'test.state' });
			expect(client.socket.readyState).toBe(WebSocket.OPEN);
		});

		it('never reaches a deployment on another Redis database', async () => {
			const otherDatabase = jest.replaceProperty(MEET_ENV, 'REDIS_DB', String(Number(MEET_ENV.REDIS_DB) + 1));
			const otherDeployment = new TestReplica(new RedisService(new LoggerService()));
			otherDatabase.restore();
			await otherDeployment.start();

			try {
				expect(otherDeployment.channel).not.toBe(replicaA.channel);
				const ours = await connectAs(replicaA, 'alice');
				const theirs = await connectAs(otherDeployment, 'alice');

				await replicaA.send(ROOM_ID, 'alice', 'test.ours');
				await otherDeployment.send(ROOM_ID, 'alice', 'test.theirs');

				expect(await ours.next()).toEqual({ type: 'test.ours' });
				expect(await theirs.next()).toEqual({ type: 'test.theirs' });
			} finally {
				await otherDeployment.stop();
			}
		});
	});

	describe('Credentials', () => {
		it('refuses a handshake without a credential before the upgrade', async () => {
			const client = connect(replicaA.url('other=1'));

			expect(await client.closed).toBe(1006);
		});

		it('closes a connection with an unknown credential as forbidden', async () => {
			const client = connect(replicaA.url('testTicket=unknown'));

			expect(await client.closed).toBe(MeetWebSocketCloseCode.FORBIDDEN);
		});

		it('closes the oldest of six connections of one address with 1008', async () => {
			const oldest = await connectAs(replicaA, 'carol');

			for (let i = 0; i < 5; i++) {
				await connectAs(replicaA, 'carol');
			}

			expect(await oldest.closed).toBe(MeetWebSocketCloseCode.REPLACED);
		});
	});

	describe('Redis subscription lost and back', () => {
		it('keeps its connections, accepts new ones and sends them what features send on open and on pong', async () => {
			const subscriber = (
				replicaA.redis as unknown as { subscriber: { disconnect(): void; connect(): Promise<void> } }
			).subscriber;
			const before = await connectAs(replicaA, 'dave');

			subscriber.disconnect();
			const during = await connectAs(replicaA, 'erin');
			replicaA.runLivenessCycle();

			expect(await during.next()).toEqual({ type: 'test.pong' });
			expect(before.socket.readyState).toBe(WebSocket.OPEN);

			await subscriber.connect();
			await replicaB.send(ROOM_ID, 'dave', 'test.state');

			expect(await before.next('test.state')).toEqual({ type: 'test.state' });
		});
	});

	describe('Rate limit', () => {
		const previousNodeEnv = process.env.NODE_ENV;

		beforeAll(() => {
			process.env.NODE_ENV = 'production';
			replicaA.app.set('trust proxy', 'loopback');
		});

		afterAll(() => {
			process.env.NODE_ENV = previousNodeEnv;
		});

		it("counts each handshake against its client's bucket, not the proxy's", async () => {
			const url = replicaA.url('testTicket=unknown');
			const first = { 'X-Forwarded-For': '203.0.113.10' };
			const second = { 'X-Forwarded-For': '203.0.113.20' };

			for (let batch = 0; batch < 10; batch++) {
				const results = await Promise.all(Array.from({ length: 50 }, () => answers(url, first)));
				expect(results.every((result) => result === 'open')).toBe(true);
			}

			expect(await answers(url, first)).toBe(429);
			expect(await answers(url, second)).toBe('open');
		});
	});
});
