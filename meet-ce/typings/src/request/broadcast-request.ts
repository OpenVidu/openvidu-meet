/**
 * Options for starting a broadcast (`POST /meetings/{roomId}/broadcasts`).
 */
export interface MeetBroadcastStartOptions {
	/**
	 * Where to stream. Omitted, the broadcast streams to every destination saved in the room's
	 * config. Otherwise each entry names one of the room's destinations, or gives one for this
	 * meeting only; the room destinations left out still belong to the broadcast as `stopped`, so
	 * they can be started later. At least one entry, and at most
	 * {@link MEET_BROADCAST_MAX_DESTINATIONS} destinations in total, room ones included.
	 * See {@link MeetBroadcastStartDestination} for details.
	 */
	destinations?: MeetBroadcastStartDestination[];
}

/**
 * A destination to stream to when a broadcast starts:
 *
 * - `id` alone: one of the room's saved destinations, streamed to as saved.
 * - `id` with `name` or `url`: that room destination with the given values for this meeting only;
 *   the room keeps what it has saved. Requires the `broadcastEditDestinations` permission.
 * - No `id`: a destination for this meeting only, so `name` and `url` are required. Requires the
 *   `broadcastAddDestinations` permission.
 */
export interface MeetBroadcastStartDestination {
	/** Identifier of one of the room's destinations */
	id?: string;
	/** Display name of the destination */
	name?: string;
	/** Full `rtmp://` or `rtmps://` URL to stream to, stream key included */
	url?: string;
}

/**
 * A destination to add to a running broadcast
 * (`POST /meetings/{roomId}/broadcasts/{broadcastId}/destinations`). The broadcast starts streaming
 * to it right away.
 */
export interface MeetBroadcastDestinationOptions {
	/** Display name of the destination */
	name: string;
	/** Full `rtmp://` or `rtmps://` URL to stream to, stream key included */
	url: string;
}

/**
 * Body of `PUT /meetings/{roomId}/broadcasts/{broadcastId}/destinations/{destinationId}`: turns the
 * stream to one destination off, or back on, without touching the others. Stopping the last
 * destination that is connecting or active ends the whole broadcast.
 */
export interface MeetBroadcastDestinationUpdateOptions {
	/** `true` to stream to the destination, `false` to stop streaming to it */
	active: boolean;
}
