import type { MeetBroadcastInfo } from '@openvidu-meet/typings';

/**
 * A live broadcast as the server keeps it in Redis while it runs: the shape the API serves
 * ({@link MeetBroadcastInfo}) but with the destination's **real** URL, stream key included, and
 * the egress that streams it. LiveKit only knows a destination by its URL, and reports it
 * redacted, so the server has to hold the real one to stop the stream. The real URL never leaves
 * the server: `BroadcastHelper.toBroadcastInfo` redacts it at the boundary.
 */
export interface BroadcastRecord extends MeetBroadcastInfo {
	/** The egress that streams the meeting, shared with the other broadcasts of the room */
	egressId: string;
}

/**
 * The real URL, stream key included, of each destination saved in a room's config, by destination
 * id. Persisted next to the room but outside its domain shape, whose destinations only ever carry
 * the redacted URL.
 */
export type BroadcastDestinationUrls = Record<string, string>;
