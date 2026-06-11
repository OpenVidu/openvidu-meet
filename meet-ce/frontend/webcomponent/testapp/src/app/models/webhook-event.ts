/**
 * Shape of a webhook event broadcast by the local webhook bridge
 * (see `scripts/webhook-bridge.js`). Only the fields the testapp reads are
 * modelled explicitly; the index signature keeps the rest accessible.
 */
export interface WebhookEventPayload {
	event?: string;
	creationDate?: number | string;
	data?: { roomId?: string } & Record<string, unknown>;
	[key: string]: unknown;
}

/** Minimal surface of the Socket.IO client exposed on `window.io`. */
export type SocketLike = {
	on: (event: string, cb: (payload: any) => void) => void;
	disconnect: () => void;
};

/** Factory installed on `window.io` by the Socket.IO client script. */
export type IOFactory = (url?: string) => SocketLike;
