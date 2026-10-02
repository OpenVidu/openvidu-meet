import type {
	MeetRecordingEncodingOptions,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout
} from './recording.entity.js';

/**
 * A live broadcast of a meeting: its composited audio and video streamed to one RTMP(S)
 * destination. A meeting streams to several destinations by running one broadcast per destination,
 * each with its own lifecycle, up to {@link MEET_BROADCAST_MAX_DESTINATIONS} at a time. A broadcast
 * is ephemeral: it exists while the meeting is streamed to its destination and leaves no stored
 * artifact, so it is served as a sub-resource of the meeting (`GET /meetings/{roomId}/broadcasts`).
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
	/** Display name of the destination streamed to */
	name: string;
	/**
	 * URL of the destination with its stream key redacted, exactly as the room's config serves it
	 * (see {@link MeetBroadcastDestination.url}). Never the full URL
	 */
	url: string;
	/**
	 * Identifier of the room destination streamed to, as it has in the room's config. Absent on a
	 * broadcast to a destination given for this meeting only
	 */
	destinationId?: string;
	/** Layout of the meeting as it is streamed, taken from the room's config when the meeting went live */
	layout: MeetRecordingLayout;
	/**
	 * Encoding of the stream, a preset or detailed options, taken from the room's config when the
	 * meeting went live. See {@link MeetRecordingEncodingPreset} and {@link MeetRecordingEncodingOptions}
	 */
	encoding: MeetRecordingEncodingPreset | MeetRecordingEncodingOptions;
	/**
	 * Timestamp in milliseconds since epoch when media started to reach the destination. Absent
	 * while the broadcast is starting, and on a broadcast that never streamed anything
	 */
	startDate?: number;
	/** Timestamp in milliseconds since epoch when the broadcast ended. Absent until it ends, and on a broadcast that never streamed anything */
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
	/** The media server is connecting to the destination; no media has reached it yet */
	STARTING = 'starting',
	/** The destination is receiving the stream */
	ACTIVE = 'active',
	/** The broadcast is being stopped */
	ENDING = 'ending',
	/** The broadcast ended normally: it was stopped, or its meeting ended */
	COMPLETE = 'complete',
	/** The broadcast failed: the destination rejected or lost the stream, or the media server failed. `error` says why */
	FAILED = 'failed',
	/** The broadcast ended before any media reached the destination: stopped, or its meeting ended, while it was still starting */
	ABORTED = 'aborted',
	/** The broadcast could not continue because the system limit was reached */
	LIMIT_REACHED = 'limit_reached'
}
