import { MeetRoomMemberRole } from '../database/room-member.entity.js';
import { MeetEventOrigin } from '../event-origin.js';
import { MeetParticipantType } from './participant-response.js';

/**
 * Status of a wait to join a locked room, carried by the `waitingParticipantStatusChanged` webhook and embedded event.
 */
export enum MeetWaitingParticipantStatus {
	/** Waiting. Sent when an admitted participant finds the meeting full, and by the embedded event on the first state of the wait */
	WAITING = 'waiting',
	/** Admitted by a moderator or by unlocking the room. Not the join: `meetingJoined` / `participantJoined` confirm it */
	ADMITTED = 'admitted',
	/** A moderator rejected the participant */
	REJECTED = 'rejected',
	/** The participant stopped waiting, or asked again, which starts a new wait */
	LEFT = 'left',
	/** The participant lost their place: page closed, a minute out of touch, or an admission unused for a minute */
	EXPIRED = 'expired',
	/** The meeting was ended for everyone, or reached its duration limit */
	MEETING_ENDED = 'meeting_ended',
	/** The room was closed or deleted */
	ROOM_CLOSED = 'room_closed'
}

/**
 * Why a wait changed, where `status` and `origin` do not tell. Each value names the status it comes with.
 */
export enum MeetWaitingParticipantReason {
	/** `left`: the participant asked again from another tab or device */
	REPLACED = 'replaced',
	/** `expired`: the participant's page closed, reloaded or navigated away */
	PAGE_CLOSED = 'page_closed',
	/** `expired`: the participant was out of touch for a minute */
	CONNECTION_LOST = 'connection_lost',
	/** `expired`: the participant was admitted and did not join within a minute */
	ADMISSION_UNUSED = 'admission_unused',
	/** `admitted`: the room was unlocked */
	ROOM_UNLOCKED = 'room_unlocked'
}

/**
 * `error` code of a refused request about waiting participants.
 */
export enum MeetWaitingParticipantErrorCode {
	/** `404`: the participant does not wait; named in `participantIdentity` */
	PARTICIPANT_NOT_WAITING = 'participant_not_waiting',
	/** `409`: fewer free places than participants to admit */
	NOT_ENOUGH_PLACES = 'not_enough_places',
	/** `409`: the room already has 100 participants waiting */
	WAITING_LIST_FULL = 'waiting_list_full',
	/** `409`: the wait of the ticket is over or unknown; `status` tells how it ended, when known */
	WAIT_ENDED = 'wait_ended'
}

/**
 * A participant waiting to join a locked room.
 */
export interface MeetWaitingParticipant {
	/** Identity the participant will have in the meeting */
	participantIdentity: string;
	/** Name the participant gave, made unique only when they join */
	participantName: string;
	/** How the participant asked to join, derived by the server. See {@link MeetParticipantType} */
	type: MeetParticipantType;
	/**
	 * The role the participant's credential gave when they asked to join, kept while this wait lasts. Their join
	 * takes the role their credential gives then
	 */
	role: MeetRoomMemberRole;
	/**
	 * `participantExternalId` as sent by the participant's client. Not a proof of identity: trust `type` and the
	 * `participantIdentity` of a member or user instead.
	 */
	externalId?: string;
	/** `participantMetadata` as sent by the participant's client. Not a proof of identity */
	metadata?: string;
	/** When the participant asked to join, in milliseconds since epoch */
	knockDate: number;
}

/**
 * The participants waiting, as `waitingParticipantList` answers.
 */
export interface MeetWaitingParticipantList {
	/** The participants waiting, in no particular order */
	participants: MeetWaitingParticipant[];
}

/**
 * Answer of `waitingParticipantBulkReject`: `200` when all were rejected, `400` when any was not.
 */
export interface MeetWaitingParticipantBulkRejectResponse {
	/** Summary of the outcome */
	message: string;
	/** Identities of the participants rejected */
	deleted: string[];
	/** The participants not rejected because they were not waiting */
	failed: {
		/** Identity of the participant not rejected */
		participantIdentity: string;
		/** Why the participant was not rejected */
		error: string;
	}[];
}

/**
 * Answer of the internal token request when the participant has to wait.
 */
export interface MeetWaitingTicketResponse {
	/** Opaque credential of the wait, for its WebSocket connection, the token request once admitted and the leave request */
	waitingTicket: string;
	/** The participant who waits. See {@link MeetWaitingParticipant} */
	participant: MeetWaitingParticipant;
}

/**
 * Data of the `waitingParticipant.state` WebSocket message, sent to the waiting participant on open, on every
 * answered ping and on every change of the wait.
 */
export interface MeetWaitingParticipantState {
	/** Status of the wait. Any but `waiting` and `admitted` is final */
	status: MeetWaitingParticipantStatus;
	/** Who caused the change. Omitted while `status` is `waiting`. See {@link MeetEventOrigin} for details */
	origin?: MeetEventOrigin;
	/** Why the wait changed. See {@link MeetWaitingParticipantReason} */
	reason?: MeetWaitingParticipantReason;
	/** Seconds waited since the participant asked, while `status` is `waiting` */
	waitedSeconds?: number;
	/** Whether the room has an active meeting. Omitted when the server could not read the room */
	meetingActive?: boolean;
	/** The room's lock message. Omitted when there is none or the server could not read the room */
	message?: string;
}

/**
 * Type of the WebSocket message that carries a {@link MeetWaitingParticipantState}.
 */
export const MEET_WAITING_PARTICIPANT_STATE_MESSAGE = 'waitingParticipant.state';
