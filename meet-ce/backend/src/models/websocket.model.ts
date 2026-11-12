import type { IncomingMessage } from 'http';

export interface WebSocketAddress {
	roomId: string;
	address: string;
}

export interface WebSocketConnection extends WebSocketAddress {
	/** When its client last answered a ping, or opened it. */
	readonly lastSeenAt: number;
	/** Writes straight to this connection's socket, without going through the other replicas. */
	send(type: string, data?: unknown): void;
}

/**
 * A feature that opens WebSocket connections. The hooks run only for the connections its credential
 * opened; `onPong` runs each time the connection's client answers a ping.
 */
export interface WebSocketFeature {
	/** Query parameter of the handshake that carries the feature's credential. */
	credential: string;
	/** The room and address the credential opens, or null when the feature does not know it. */
	resolve(credential: string): Promise<WebSocketAddress | null>;
	onOpen?(connection: WebSocketConnection): void | Promise<void>;
	onPong?(connection: WebSocketConnection): void | Promise<void>;
	onClose?(connection: WebSocketConnection): void | Promise<void>;
}

export interface WebSocketHandshakeGuard {
	clientAddress(req: IncomingMessage): string;
	/** Counts the handshake against its client address's rate limit; false when it is over it. */
	admit(clientAddress: string): Promise<boolean>;
}
