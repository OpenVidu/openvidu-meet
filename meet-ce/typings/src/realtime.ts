/**
 * Close codes with which the server ends a realtime connection.
 */
export enum MeetRealtimeCloseCode {
	/** A newer connection of the same address took this one's place; the client does not reconnect */
	REPLACED = 1008,
	/** The credential could not be checked in time; the client reconnects */
	TRY_AGAIN_LATER = 1013,
	/** No feature knows the credential; the client does not reconnect */
	FORBIDDEN = 4403
}

/**
 * Message the server sends on a realtime connection.
 */
export interface MeetRealtimeMessage<T = unknown> {
	/** Type of the message, namespaced by the feature that sends it (`lobby.state`), or {@link MEET_REALTIME_HEARTBEAT} */
	type: string;
	/** Payload of the message; a heartbeat has none */
	data?: T;
}

/**
 * Type of the message the server sends to every realtime connection on each liveness cycle.
 */
export const MEET_REALTIME_HEARTBEAT = 'heartbeat';
