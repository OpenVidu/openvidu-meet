/**
 * Payload of the `broadcastStart` embedded command, and body of `POST /broadcasts` next to the
 * `roomId` of the meeting to stream: the destinations to start streaming to, one broadcast each.
 * A meeting streams to each stream key once, whatever the server it is on, and to at most
 * {@link MEET_BROADCAST_MAX_DESTINATIONS} destinations at a time.
 */
export interface MeetBroadcastStartOptions {
	/**
	 * Identifiers of the room's saved destinations to stream to, each streamed to as saved. Omitted,
	 * every room destination the meeting is not streaming to yet; empty, none of them, which then
	 * requires at least one entry in `destinations`. An identifier the room does not have is rejected.
	 */
	destinationIds?: string[];
	/**
	 * Destinations for this meeting only, never saved in the room. Requires the
	 * `broadcastAddDestinations` permission.
	 */
	destinations?: MeetBroadcastStartDestination[];
}

/**
 * A destination for this meeting only, given by its name and its full URL.
 */
export interface MeetBroadcastStartDestination {
	/** Display name of the destination */
	name: string;
	/** Full `rtmp://` or `rtmps://` URL to stream to, stream key included */
	url: string;
}

/**
 * Payload of the `broadcastStop` embedded command, and body of `POST /broadcasts/stop` next to the
 * `roomId` of the meeting: the broadcasts to stop, one or several.
 */
export interface MeetBroadcastStopOptions {
	/** Identifiers of the broadcasts to stop. Omitted, every broadcast of the meeting still running */
	broadcastIds?: string[];
}
