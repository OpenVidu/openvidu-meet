import type { MeetBroadcastInfo } from '@openvidu-meet/typings';

/**
 * The live broadcast of a room as the server keeps it in Redis while it runs: the shape the API
 * serves ({@link MeetBroadcastInfo}) but with every destination's **real** URL, stream key included.
 * LiveKit only knows a destination by its URL, and reports it redacted, so the server has to hold
 * the real one to stop, restart or match the destination for the broadcast's lifetime. It never
 * leaves the server: `BroadcastHelper.toBroadcastInfo` redacts it at the boundary.
 */
export type BroadcastRecord = MeetBroadcastInfo;

/**
 * The real URL, stream key included, of each destination saved in a room's config, by destination
 * id. Persisted next to the room but outside its domain shape, whose destinations only ever carry
 * the redacted URL.
 */
export type BroadcastDestinationUrls = Record<string, string>;
