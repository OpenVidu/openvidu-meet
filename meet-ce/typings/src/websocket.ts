/**
 * Close codes with which the server ends a WebSocket connection.
 */
export enum MeetWebSocketCloseCode {
	/** A newer connection of the same address took this one's place; the client does not reconnect */
	REPLACED = 1008,
	/** The credential could not be checked in time; the client reconnects */
	TRY_AGAIN_LATER = 1013,
	/** No feature knows the credential; the client does not reconnect */
	FORBIDDEN = 4403
}

/**
 * Message the server sends on a WebSocket connection.
 */
export interface MeetWebSocketMessage<T = unknown> {
	/** Type of the message, namespaced by the feature that sends it (`waitingRoom.state`), or {@link MEET_WEBSOCKET_HEARTBEAT} */
	type: string;
	/** Payload of the message; a heartbeat has none */
	data?: T;
}

/**
 * Type of the message the server sends to every WebSocket connection on each liveness cycle.
 */
export const MEET_WEBSOCKET_HEARTBEAT = 'heartbeat';
