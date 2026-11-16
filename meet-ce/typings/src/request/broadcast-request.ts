/**
 * Payload of the `broadcastStart` embedded command, and body of `POST /broadcasts` next to the
 * `roomId` of the meeting to stream: the destinations to start streaming to, one broadcast each.
 * A meeting streams to each stream key once, whatever the server it is on.
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
	 * `broadcastEdit` permission.
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
 * Payload of the `broadcastStop` embedded command: the broadcast to stop.
 */
export interface MeetBroadcastStopOptions {
	/** Identifier of the broadcast to stop */
	broadcastId: string;
}
