import { ExtraFieldKey } from './extra-field.js';
import { MeetParticipantInfo } from './participant-response.js';
import { MeetWaitingParticipant } from './waiting-participant-response.js';

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
	/**
	 * Timestamp at which the meeting is force-ended for reaching the room's duration limit
	 * (milliseconds since epoch), or `undefined` when the meeting runs under no limit. Stamped on the
	 * meeting when it started, from the room's `maxDurationMinutes`, so it does not change mid-meeting.
	 */
	endDate?: number;
	/** Number of participants currently in the meeting (standard participants only). */
	participantCount: number;
	/** Whether a recording is currently in progress in the meeting. */
	recordingActive: boolean;
	/** Whether a live broadcast is currently in progress in the meeting. */
	broadcastActive: boolean;
	/**
	 * Participant cap in force for this meeting, or `undefined` when it admits unlimited participants.
	 * Taken from the room's `maxParticipants` when the meeting started, so it does not change mid-meeting.
	 */
	maxParticipants?: number;
	/**
	 * Participants currently in the meeting, as `GET /meetings/{roomId}/participants` lists them.
	 * Present only when requested through `extraFields`.
	 */
	participants?: MeetParticipantInfo[];
	/**
	 * Participants waiting to join the meeting, as `GET /meetings/{roomId}/waiting-participants` lists them.
	 * Present only when requested through `extraFields` by a caller holding `waitingParticipantAdmin`.
	 * Empty in an unlocked room.
	 */
	waitingParticipants?: MeetWaitingParticipant[];
}

/**
 * Properties of a {@link MeetMeetingInfo} that are left out of the API response unless requested
 * through the `extraFields` parameter.
 */
export const MEET_MEETING_EXTRA_FIELDS = [
	'participants',
	'waitingParticipants'
] as const satisfies readonly ExtraFieldKey<Required<MeetMeetingInfo>>[];

/**
 * Properties of a meeting that can be requested as extra fields in the API response.
 */
export type MeetMeetingExtraField = (typeof MEET_MEETING_EXTRA_FIELDS)[number];
