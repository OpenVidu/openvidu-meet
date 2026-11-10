import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MeetRealtimeCloseCode } from '@openvidu-meet/typings';
import { EventEmitter } from 'events';
import type { Server } from 'http';
import ms from 'ms';
import type { WebSocket } from 'ws';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import type { RealtimeConnection, RealtimeFeature } from '../../../src/models/realtime.model.js';
import type { LoggerService } from '../../../src/services/logger.service.js';
import type { RedisService } from '../../../src/services/redis.service.js';
import { RealtimeService } from '../../../src/services/realtime.service.js';
import type { RequestSessionService } from '../../../src/services/request-session.service.js';

const logger = { info: () => {}, warn: () => {}, debug: () => {}, error: jest.fn(), verbose: () => {} };
const requestSession = { run: <T>(callback: () => T) => callback() };
const PING_INTERVAL = ms(INTERNAL_CONFIG.REALTIME_PING_INTERVAL);

class FakeRedisService {
	database = 0;
	private readonly subscribers: ((message: string) => void)[] = [];

	async subscribe(_channel: string, onMessage: (message: string) => void): Promise<void> {
		this.subscribers.push(onMessage);
	}

	async publish(_channel: string, message: string): Promise<void> {
		this.subscribers.forEach((onMessage) => onMessage(message));
	}
}

class FakeSocket extends EventEmitter {
	readyState = 1;
	readonly sent: unknown[] = [];
	readonly ping = jest.fn();
	readonly close = jest.fn((code: number) => {
		this.readyState = 3;
		this.emit('close', code);
	});
	readonly terminate = jest.fn(() => {
		this.readyState = 3;
		this.emit('close', 1006);
	});

	send(frame: string): void {
		this.sent.push(JSON.parse(frame));
	}
}

class TestableRealtimeService extends RealtimeService {
	connect(feature: RealtimeFeature, roomId: string, address: string): FakeSocket {
		const socket = new FakeSocket();
		this.open(socket as unknown as WebSocket, feature, { roomId, address });
		return socket;
	}

	resolve(feature: RealtimeFeature, credential: string) {
		return this.resolveCredential(feature, credential);
	}
}

const flush = () =>
	new Promise((resolve) => jest.requireActual<typeof import('timers')>('timers').setImmediate(resolve));

describe('RealtimeService', () => {
	let realtime: TestableRealtimeService;
	let feature: RealtimeFeature & {
		onOpen: jest.Mock<(connection: RealtimeConnection) => void>;
		onPong: jest.Mock<(connection: RealtimeConnection) => void>;
		onClose: jest.Mock<(connection: RealtimeConnection) => void>;
	};

	beforeEach(async () => {
		jest.useFakeTimers();
		realtime = new TestableRealtimeService(
			logger as unknown as LoggerService,
			new FakeRedisService() as unknown as RedisService,
			requestSession as unknown as RequestSessionService
		);
		feature = {
			credential: 'testTicket',
			resolve: async () => null,
			onOpen: jest.fn(),
			onPong: jest.fn(),
			onClose: jest.fn()
		};
		realtime.register(feature);
		await realtime.attach(new EventEmitter() as Server, { clientAddress: () => '', admit: async () => true });
	});

	afterEach(() => {
		realtime.close();
		jest.useRealTimers();
	});

	describe('delivery', () => {
		it('reaches every connection of the address, and nobody else', async () => {
			const first = realtime.connect(feature, 'room', 'alice');
			const second = realtime.connect(feature, 'room', 'alice');
			const otherAddress = realtime.connect(feature, 'room', 'bob');
			const otherRoom = realtime.connect(feature, 'other-room', 'alice');

			await realtime.send('room', 'alice', 'test.state', { step: 1 });

			expect(first.sent).toEqual([{ type: 'test.state', data: { step: 1 } }]);
			expect(second.sent).toEqual([{ type: 'test.state', data: { step: 1 } }]);
			expect(otherAddress.sent).toEqual([]);
			expect(otherRoom.sent).toEqual([]);
		});

		it('reaches each address a message names', async () => {
			const alice = realtime.connect(feature, 'room', 'alice');
			const bob = realtime.connect(feature, 'room', 'bob');

			await realtime.sendMany('room', ['alice', 'bob'], 'test.state');

			expect(alice.sent).toEqual([{ type: 'test.state' }]);
			expect(bob.sent).toEqual([{ type: 'test.state' }]);
		});

		it('stops at a closed connection', async () => {
			const socket = realtime.connect(feature, 'room', 'alice');
			socket.close(1000);

			await realtime.send('room', 'alice', 'test.state');

			expect(socket.sent).toEqual([]);
		});
	});

	describe('connections of one address', () => {
		it('closes the oldest with 1008 when a sixth one opens', () => {
			const sockets = Array.from({ length: INTERNAL_CONFIG.REALTIME_MAX_CONNECTIONS_PER_ADDRESS + 1 }, () =>
				realtime.connect(feature, 'room', 'alice')
			);

			expect(sockets[0].close).toHaveBeenCalledWith(MeetRealtimeCloseCode.REPLACED);
			expect(sockets.slice(1).every((socket) => socket.close.mock.calls.length === 0)).toBe(true);
		});
	});

	describe('hooks', () => {
		it('open the connection with its room and address, and let the feature write to it', async () => {
			feature.onOpen.mockImplementation((connection) => connection.send('test.state', { from: 'open' }));

			const socket = realtime.connect(feature, 'room', 'alice');
			await flush();

			expect(feature.onOpen).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'room', address: 'alice' }));
			expect(socket.sent).toEqual([{ type: 'test.state', data: { from: 'open' } }]);
		});

		it("run only for the connections of the feature's own credential", async () => {
			const otherFeature: RealtimeFeature = { credential: 'otherTicket', resolve: async () => null };
			realtime.connect(otherFeature, 'room', 'alice');
			await flush();

			expect(feature.onOpen).not.toHaveBeenCalled();
		});

		it('report a closed connection', async () => {
			realtime.connect(feature, 'room', 'alice').close(1000);
			await flush();

			expect(feature.onClose).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'room', address: 'alice' }));
		});
	});

	describe('liveness', () => {
		it('pings every connection and sends it a heartbeat each cycle', () => {
			const socket = realtime.connect(feature, 'room', 'alice');

			jest.advanceTimersByTime(PING_INTERVAL);

			expect(socket.ping).toHaveBeenCalledTimes(1);
			expect(socket.sent).toEqual([{ type: 'heartbeat' }]);
		});

		it('records an answered ping and tells the feature', async () => {
			const socket = realtime.connect(feature, 'room', 'alice');
			jest.advanceTimersByTime(PING_INTERVAL);

			socket.emit('pong');
			await flush();

			expect(feature.onPong).toHaveBeenCalledWith(expect.objectContaining({ lastSeenAt: Date.now() }));
		});

		it('keeps a connection that answers every ping', () => {
			const socket = realtime.connect(feature, 'room', 'alice');

			for (let cycle = 0; cycle < 3; cycle++) {
				jest.advanceTimersByTime(PING_INTERVAL);
				socket.emit('pong');
			}

			expect(socket.terminate).not.toHaveBeenCalled();
		});

		it('terminates a connection whose ping went unanswered by the next cycle', async () => {
			const socket = realtime.connect(feature, 'room', 'alice');

			jest.advanceTimersByTime(PING_INTERVAL);
			expect(socket.terminate).not.toHaveBeenCalled();

			jest.advanceTimersByTime(PING_INTERVAL);
			await flush();

			expect(socket.terminate).toHaveBeenCalled();
			expect(feature.onClose).toHaveBeenCalled();
		});
	});

	describe('subscription', () => {
		it('logs the channel permission a refused subscription needs', async () => {
			const refusing = {
				database: 0,
				subscribe: () =>
					Promise.reject(new Error("NOPERM No permissions to access the 'ov_meet:realtime:0' channel"))
			};
			const service = new RealtimeService(
				logger as unknown as LoggerService,
				refusing as unknown as RedisService,
				requestSession as unknown as RequestSessionService
			);

			await service.attach(new EventEmitter() as Server, { clientAddress: () => '', admit: async () => true });
			service.close();

			expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('&ov_meet:*'), expect.any(Error));
		});
	});

	describe('credential resolution', () => {
		it('gives up after the credential timeout', async () => {
			const pending = realtime.resolve({ ...feature, resolve: () => new Promise(() => {}) }, 'ticket');

			jest.advanceTimersByTime(ms(INTERNAL_CONFIG.REALTIME_CREDENTIAL_TIMEOUT));

			expect(typeof (await pending)).toBe('symbol');
		});

		it('gives up when the feature fails', async () => {
			const failing = { ...feature, resolve: () => Promise.reject(new Error('Redis down')) };

			expect(typeof (await realtime.resolve(failing, 'ticket'))).toBe('symbol');
		});

		it('returns what the feature resolves', async () => {
			const known = { ...feature, resolve: async () => ({ roomId: 'room', address: 'alice' }) };

			expect(await realtime.resolve(known, 'ticket')).toEqual({ roomId: 'room', address: 'alice' });
		});
	});
});
