/**
 * A live broadcast of a meeting: its composited audio and video streamed to one or more RTMP(S)
 * destinations at once. A broadcast is ephemeral: it exists while the meeting is being streamed and
 * leaves no stored artifact, so it is served as a sub-resource of the meeting
 * (`GET /meetings/{roomId}/broadcasts`). A meeting has at most one broadcast at a time.
 */
export interface MeetBroadcastInfo {
	/** Unique identifier for the broadcast */
	broadcastId: string;
	/** Identifier of the room being broadcast */
	roomId: string;
	/** Name of the room being broadcast */
	roomName: string;
	/** Current status of the broadcast. See {@link MeetBroadcastStatus} for details */
	status: MeetBroadcastStatus;
	/**
	 * Every destination of the broadcast with its own status: the room's saved destinations (the
	 * ones not chosen when the broadcast started are listed as `stopped`) plus the ones added for
	 * this meeting. See {@link MeetBroadcastDestinationInfo} for details
	 */
	destinations: MeetBroadcastDestinationInfo[];
	/**
	 * Timestamp in milliseconds since epoch when the broadcast started to stream media.
	 * Absent while the broadcast is starting, and on broadcasts that never streamed anything
	 */
	startDate?: number;
	/** Timestamp in milliseconds since epoch when the broadcast ended (if available) */
	endDate?: number;
	/** Duration in seconds of the broadcast (if available) */
	duration?: number;
	/** Error code if the broadcast failed (if available) */
	errorCode?: number;
	/** Error message if the broadcast failed (if available) */
	error?: string;
	/** Additional details about the broadcast status or errors (if available) */
	details?: string;
}

/**
 * Possible statuses for a broadcast. Same lifecycle as a recording, since both run on the same
 * media pipeline.
 */
export enum MeetBroadcastStatus {
	/** The broadcast is being prepared and will start streaming soon */
	STARTING = 'starting',
	/** The broadcast is streaming to at least one destination */
	ACTIVE = 'active',
	/** The broadcast is being stopped */
	ENDING = 'ending',
	/** The broadcast ended normally */
	COMPLETE = 'complete',
	/** The broadcast failed due to an error */
	FAILED = 'failed',
	/** The broadcast was aborted by the system */
	ABORTED = 'aborted',
	/** The broadcast could not continue because the system limit was reached */
	LIMIT_REACHED = 'limit_reached'
}

/**
 * One destination of a live broadcast.
 */
export interface MeetBroadcastDestinationInfo {
	/** Identifier of the destination. A room destination keeps the id it has in the room's config */
	id: string;
	/** Display name of the destination */
	name: string;
	/**
	 * URL of the destination with its stream key redacted, exactly as the room's config serves it
	 * (see {@link MeetBroadcastDestination.url}). Never the full URL
	 */
	url: string;
	/** Where the destination comes from. See {@link MeetBroadcastDestinationSource} for details */
	source: MeetBroadcastDestinationSource;
	/**
	 * `true` when a room destination streams to a different URL, or under a different name, than
	 * the room has saved, for this meeting only. Absent for destinations added in the meeting
	 */
	edited?: boolean;
	/** Current status of the destination. See {@link MeetBroadcastDestinationStatus} for details */
	status: MeetBroadcastDestinationStatus;
	/** Error message if the destination failed (if available) */
	error?: string;
	/** Timestamp in milliseconds since epoch when the destination started to receive media (if available) */
	startDate?: number;
	/** Timestamp in milliseconds since epoch when the destination stopped receiving media (if available) */
	endDate?: number;
	/** Duration in seconds the destination received media (if available) */
	duration?: number;
}

/**
 * Where a destination of a broadcast comes from.
 */
export enum MeetBroadcastDestinationSource {
	/** One of the destinations saved in the room's config */
	ROOM = 'room',
	/** Added for this meeting only; the room's config does not have it */
	MEETING = 'meeting'
}

/**
 * Possible statuses for one destination of a broadcast. A destination failing or stopping does not
 * affect the others; when no destination is left connecting or active, the broadcast ends.
 */
export enum MeetBroadcastDestinationStatus {
	/** The broadcast is connecting to the destination */
	CONNECTING = 'connecting',
	/** The destination is receiving the stream */
	ACTIVE = 'active',
	/** The destination is not being streamed to: it was stopped, or it was not chosen when the broadcast started */
	STOPPED = 'stopped',
	/** The destination rejected or lost the stream. `error` says why */
	FAILED = 'failed'
}
