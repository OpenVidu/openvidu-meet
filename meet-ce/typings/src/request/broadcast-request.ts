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
 * A destination to stream to when a broadcast starts, in one of two forms:
 *
 * - `id` alone: one of the room's saved destinations, streamed to as saved. A room destination is
 *   never changed for a meeting.
 * - `name` and `url`, without `id`: a destination for this meeting only. Requires the
 *   `broadcastAddDestinations` permission.
 */
export interface MeetBroadcastStartDestination {
	/** Identifier of one of the room's destinations. Sent alone */
	id?: string;
	/** Display name of a destination for this meeting only. Sent with `url`, without `id` */
	name?: string;
	/** Full `rtmp://` or `rtmps://` URL to stream to, stream key included. Sent with `name`, without `id` */
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
