/**
 * Live snapshot of the meeting currently running in a room, as served by `GET /meetings/{roomId}`.
 *
 * The endpoint only answers while a meeting is active (404 otherwise), so the shape carries no
 * lifecycle status field yet; a `status` (once more than one live state exists, e.g. a lobby hold)
 * and a per-module `features` object are planned as additive extensions.
 */
export interface MeetMeetingInfo {
	/** Identifier of the room hosting the meeting. */
	roomId: string;
	/** Name of the room hosting the meeting. */
	roomName: string;
	/** Timestamp when the meeting started (milliseconds since epoch). */
	startDate: number;
	/** Number of participants currently in the meeting (standard participants only). */
	participantCount: number;
	/** Whether a recording is currently in progress in the meeting. */
	recordingActive: boolean;
}
