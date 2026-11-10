import type { MeetRealtimeMessage } from '@openvidu-meet/typings';
import { MEET_REALTIME_HEARTBEAT, MeetRealtimeCloseCode } from '@openvidu-meet/typings';
import type { IncomingMessage, Server } from 'http';
import { STATUS_CODES } from 'http';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import type { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import type {
	RealtimeAddress,
	RealtimeConnection,
	RealtimeFeature,
	RealtimeHandshakeGuard
} from '../models/realtime.model.js';
import { getBasePath } from '../utils/html-dynamic-base-path.utils.js';
import { LoggerService } from './logger.service.js';
import { RedisService } from './redis.service.js';
import { RequestSessionService } from './request-session.service.js';

interface PublishedMessage extends MeetRealtimeMessage {
	roomId: string;
	addresses: string[];
}

class Connection implements RealtimeConnection {
	lastSeenAt = Date.now();
	answeredPing = true;

	constructor(
		readonly roomId: string,
		readonly address: string,
		readonly feature: RealtimeFeature,
		readonly socket: WebSocket
	) {}

	send(type: string, data?: unknown): void {
		if (this.socket.readyState !== WebSocket.OPEN) return;

		const message: MeetRealtimeMessage = { type, data };
		this.socket.send(JSON.stringify(message));
	}
}

const UNRESOLVED = Symbol('credential unresolved');

/**
 * Messages published while a replica's subscription is down never reach its connections: features
 * send their state from their hooks, straight to the connection.
 */
@injectable()
export class RealtimeService {
	protected readonly features: RealtimeFeature[] = [];
	protected readonly connections = new Map<string, Connection[]>();
	protected readonly webSocketServer = new WebSocketServer({
		noServer: true,
		maxPayload: INTERNAL_CONFIG.REALTIME_MAX_PAYLOAD_BYTES
	});
	protected pendingHandshakes = 0;
	protected livenessTimer?: NodeJS.Timeout;

	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(RedisService) protected redisService: RedisService,
		@inject(RequestSessionService) protected requestSessionService: RequestSessionService
	) {}

	get path(): string {
		return `${getBasePath()}${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1.slice(1)}${INTERNAL_CONFIG.REALTIME_PATH}`;
	}

	/** Publish/subscribe ignores the database number, so the channel carries it. */
	get channel(): string {
		return `ov_meet:realtime:${this.redisService.database}`;
	}

	register(feature: RealtimeFeature): void {
		this.features.push(feature);
	}

	async attach(httpServer: Server, guard: RealtimeHandshakeGuard): Promise<void> {
		httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
			void this.requestSessionService.run(() =>
				this.handleUpgrade(req, socket, head, guard).catch((error: unknown) => {
					this.logger.error('Error handling a realtime handshake', error);
					socket.destroy();
				})
			);
		});
		this.livenessTimer = setInterval(() => this.checkLiveness(), ms(INTERNAL_CONFIG.REALTIME_PING_INTERVAL));

		try {
			await this.redisService.subscribe(this.channel, (message) => this.deliver(message));
		} catch (error) {
			this.logger.error(
				`Could not subscribe to the realtime channel '${this.channel}': realtime messages from other replicas will not arrive. A Redis user restricted by ACL needs the channel permission '&ov_meet:*'`,
				error
			);
		}
	}

	async send(roomId: string, address: string, type: string, data?: unknown): Promise<void> {
		await this.sendMany(roomId, [address], type, data);
	}

	async sendMany(roomId: string, addresses: string[], type: string, data?: unknown): Promise<void> {
		const message: PublishedMessage = { roomId, addresses, type, data };
		await this.redisService.publish(this.channel, JSON.stringify(message));
	}

	close(): void {
		clearInterval(this.livenessTimer);

		for (const connection of [...this.connections.values()].flat()) {
			connection.socket.terminate();
		}

		this.webSocketServer.close();
	}

	protected async handleUpgrade(
		req: IncomingMessage,
		socket: Duplex,
		head: Buffer,
		guard: RealtimeHandshakeGuard
	): Promise<void> {
		const destroySocket = () => socket.destroy();
		socket.on('error', destroySocket);

		const query = new URL(req.url ?? '/', 'http://localhost');
		const feature = this.features.find(({ credential }) => query.searchParams.has(credential));

		if (query.pathname !== this.path || !feature) {
			socket.destroy();
			return;
		}

		if (this.pendingHandshakes >= INTERNAL_CONFIG.REALTIME_MAX_PENDING_HANDSHAKES) {
			this.logger.warn('Realtime handshake refused: too many handshakes in flight');
			this.refuse(socket, 429);
			return;
		}

		this.pendingHandshakes++;

		try {
			const clientAddress = guard.clientAddress(req);

			if (!(await guard.admit(clientAddress))) {
				this.logger.warn(`Rate limit exceeded for a realtime handshake from IP ${clientAddress}`);
				this.refuse(socket, 429);
				return;
			}

			const webSocket = await this.upgrade(req, socket, head);
			socket.off('error', destroySocket);

			if (!webSocket) return;

			const address = await this.resolveCredential(feature, query.searchParams.get(feature.credential)!);

			if (webSocket.readyState !== WebSocket.OPEN) return;

			if (address === UNRESOLVED) {
				webSocket.close(MeetRealtimeCloseCode.TRY_AGAIN_LATER);
			} else if (!address) {
				webSocket.close(MeetRealtimeCloseCode.FORBIDDEN);
			} else {
				this.open(webSocket, feature, address);
			}
		} finally {
			this.pendingHandshakes--;
		}
	}

	/** Null when the handshake was refused, which ws answers and closes on its own. */
	protected upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<WebSocket | null> {
		return new Promise((resolve) => {
			socket.once('close', () => resolve(null));
			this.webSocketServer.handleUpgrade(req, socket, head, resolve);
		});
	}

	protected async resolveCredential(
		feature: RealtimeFeature,
		credential: string
	): Promise<RealtimeAddress | null | typeof UNRESOLVED> {
		let timer: NodeJS.Timeout | undefined;
		const timeout = new Promise<typeof UNRESOLVED>((resolve) => {
			timer = setTimeout(() => resolve(UNRESOLVED), ms(INTERNAL_CONFIG.REALTIME_CREDENTIAL_TIMEOUT));
		});

		try {
			return await Promise.race([feature.resolve(credential), timeout]);
		} catch (error) {
			this.logger.error('Error resolving a realtime credential', error);
			return UNRESOLVED;
		} finally {
			clearTimeout(timer);
		}
	}

	protected open(webSocket: WebSocket, feature: RealtimeFeature, { roomId, address }: RealtimeAddress): void {
		const connection = new Connection(roomId, address, feature, webSocket);
		const key = this.keyOf(roomId, address);
		const sameAddress = this.connections.get(key) ?? [];

		if (sameAddress.length >= INTERNAL_CONFIG.REALTIME_MAX_CONNECTIONS_PER_ADDRESS) {
			sameAddress.shift()!.socket.close(MeetRealtimeCloseCode.REPLACED);
		}

		this.connections.set(key, [...sameAddress, connection]);

		webSocket.on('pong', () => {
			connection.answeredPing = true;
			connection.lastSeenAt = Date.now();
			this.runHook(connection, 'onPong');
		});
		webSocket.on('close', () => {
			this.forget(connection);
			this.runHook(connection, 'onClose');
		});
		webSocket.on('error', (error) => this.logger.debug(`Realtime connection error in room '${roomId}'`, error));

		this.logger.debug(`Realtime connection opened in room '${roomId}'`);
		this.runHook(connection, 'onOpen');
	}

	protected checkLiveness(): void {
		for (const connection of [...this.connections.values()].flat()) {
			if (!connection.answeredPing) {
				connection.socket.terminate();
				continue;
			}

			connection.answeredPing = false;
			connection.socket.ping();
			connection.send(MEET_REALTIME_HEARTBEAT);
		}
	}

	protected deliver(rawMessage: string): void {
		let message: PublishedMessage;

		try {
			message = JSON.parse(rawMessage) as PublishedMessage;
		} catch (error) {
			this.logger.warn('Ignoring a realtime message that is not JSON', error);
			return;
		}

		for (const address of message.addresses) {
			for (const connection of this.connections.get(this.keyOf(message.roomId, address)) ?? []) {
				connection.send(message.type, message.data);
			}
		}
	}

	protected forget(connection: Connection): void {
		const key = this.keyOf(connection.roomId, connection.address);
		const remaining = (this.connections.get(key) ?? []).filter((other) => other !== connection);

		if (remaining.length > 0) {
			this.connections.set(key, remaining);
		} else {
			this.connections.delete(key);
		}
	}

	protected runHook(connection: Connection, hook: 'onOpen' | 'onPong' | 'onClose'): void {
		Promise.resolve()
			.then(() => connection.feature[hook]?.(connection))
			.catch((error: unknown) => this.logger.error(`Error in the realtime ${hook} hook`, error));
	}

	protected refuse(socket: Duplex, status: number): void {
		socket.once('finish', () => socket.destroy());
		socket.end(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
	}

	protected keyOf(roomId: string, address: string): string {
		return JSON.stringify([roomId, address]);
	}
}
