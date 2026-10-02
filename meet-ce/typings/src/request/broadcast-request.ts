/**
 * Body of `POST /meetings/{roomId}/broadcasts`, and payload of the `broadcastStart` embedded command:
 * the destinations to start streaming to, one broadcast each.
 */
export interface MeetBroadcastStartOptions {
	/**
	 * The destinations to stream to. Omitted, every destination saved in the room's config that the
	 * meeting is not streaming to yet. A meeting streams to each destination once, and to at most
	 * {@link MEET_BROADCAST_MAX_DESTINATIONS} at a time. See {@link MeetBroadcastStartDestination}
	 * for details.
	 */
	destinations?: MeetBroadcastStartDestination[];
}

/**
 * A destination to start streaming to, in one of two forms:
 *
 * - `destinationId` alone: one of the room's saved destinations, streamed to as saved. A room
 *   destination is never changed for a meeting.
 * - `name` and `url`, without `destinationId`: a destination for this meeting only. Requires the
 *   `broadcastAddDestinations` permission.
 */
export interface MeetBroadcastStartDestination {
	/** Identifier of one of the room's destinations. Sent alone */
	destinationId?: string;
	/** Display name of a destination for this meeting only. Sent with `url`, without `destinationId` */
	name?: string;
	/** Full `rtmp://` or `rtmps://` URL to stream to, stream key included. Sent with `name`, without `destinationId` */
	url?: string;
}

/**
 * Body of `POST /meetings/{roomId}/broadcasts/stop`, and payload of the `broadcastStop` embedded
 * command: the broadcasts to stop.
 */
export interface MeetBroadcastStopOptions {
	/** Identifiers of the broadcasts to stop. Omitted, every broadcast of the meeting still running */
	broadcastIds?: string[];
}
