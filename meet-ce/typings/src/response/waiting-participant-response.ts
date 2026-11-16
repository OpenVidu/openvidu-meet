import { MeetWaitingParticipantType } from '../database/room-member.entity.js';
import { MeetEventOrigin } from '../embedded/events.js';

/**
 * How the wait of a participant to join a locked room stands or ended. It is the status the `waitingParticipantStatusChanged` webhook
 * and embedded event carry, and the one the waiting screen shows.
 */
export enum MeetWaitingParticipantStatus {
	/**
	 * The participant waits to be admitted. Both surfaces send it when an admitted participant waits again
	 * because the meeting was full; the embedded event also sends it with the first state of the wait.
	 */
	WAITING = 'waiting',
	/**
	 * A moderator let the participant in, or the room was unlocked. It is not the join:
	 * `meetingJoined` confirms it, or `waiting` follows when the meeting is full by then.
	 */
	ADMITTED = 'admitted',
	/** A moderator rejected the participant */
	REJECTED = 'rejected',
	/** The participant stopped waiting, or asked again and so started a new wait */
	LEFT = 'left',
	/**
	 * The participant lost their place: their page closed, their meeting stopped being in touch for a minute,
	 * or an admission was not used within a minute. The embedded event also reports it when the meeting gave
	 * up reconnecting, no longer knew the wait, or lost the answer after an admission.
	 */
	EXPIRED = 'expired',
	/** The meeting was ended explicitly, or reached its duration limit, while the participant waited */
	MEETING_ENDED = 'meeting_ended',
	/** The room was closed or deleted while the participant waited */
	ROOM_CLOSED = 'room_closed'
}

/**
 * Why a wait changed, where its status and origin alone do not tell. Carried as `reason` by the
 * `waitingParticipantStatusChanged` webhook and embedded event.
 */
export enum MeetWaitingParticipantReason {
	/** `left`: the participant asked to join again, from another tab or device, which started a new wait */
	REPLACED = 'replaced',
	/** `expired`: the participant's page closed, reloaded or navigated away */
	PAGE_CLOSED = 'page_closed',
	/** `expired`: the participant's meeting was out of touch for a minute */
	CONNECTION_LOST = 'connection_lost',
	/** `expired`: the participant was admitted and did not join within a minute */
	ADMISSION_UNUSED = 'admission_unused',
	/** `admitted`: the room was unlocked, which lets everyone waiting in */
	ROOM_UNLOCKED = 'room_unlocked'
}

/**
 * Value of `error` in the body of a refused request about waiting participants, as a code to tell the refusals apart.
 */
export enum MeetWaitingParticipantErrorCode {
	/** `404`: the participant named does not wait; the body names them in `participantIdentity` */
	PARTICIPANT_NOT_WAITING = 'participant_not_waiting',
	/** `409`: the meeting has fewer free places than participants to admit */
	NOT_ENOUGH_PLACES = 'not_enough_places',
	/** `409`: the room already holds as many waiting participants as it can */
	WAITING_LIST_FULL = 'waiting_list_full',
	/** `409`: the wait of the ticket is over, or unknown; the body tells how it ended in `status` when known */
	WAIT_ENDED = 'wait_ended'
}

/**
 * A participant who waits to be admitted to a meeting.
 */
export interface MeetWaitingParticipant {
	/** Identity the participant will have in the meeting, created when they asked to join */
	participantIdentity: string;
	/** Name the participant gave. It is made unique among the meeting's participants only when they join */
	participantName: string;
	/** How the participant asked, derived by the server. See {@link MeetWaitingParticipantType} for details */
	type: MeetWaitingParticipantType;
	/**
	 * Application-defined identifier as sent by the participant's client (`participantExternalId` of the
	 * token request). It is never a proof of identity: a backend that admits on its own identifies a
	 * waiter by `type` and by the `participantIdentity` of a member or user, which the server derives from
	 * their personal link or account.
	 */
	externalId?: string;
	/**
	 * Opaque application-defined payload as sent by the participant's client (`participantMetadata` of
	 * the token request). It is never a proof of identity, like `externalId`.
	 */
	metadata?: string;
	/** Timestamp in milliseconds since epoch when the participant asked to join. Waiting again after an admission keeps it */
	knockDate: number;
}

/**
 * The waiting participants, as `waitingParticipantList` answers and the `waitingParticipantListUpdated` embedded
 * event carries.
 */
export interface MeetWaitingParticipantList {
	/** The participants waiting, in no promised order */
	participants: MeetWaitingParticipant[];
}

/**
 * Answer of `bulkRejectWaitingParticipants`, with status `200` when every participant named was rejected
 * and `400` when any was not.
 */
export interface MeetWaitingParticipantBulkRejectResponse {
	/** Summary of the outcome */
	message: string;
	/** Identities of the participants rejected */
	deleted: string[];
	/** The participants named who were not rejected because they were not waiting. Empty with status `200` */
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
	/** Opaque credential of the wait: it opens the WebSocket connection of the wait, the token request once admitted and the leave request */
	waitingTicket: string;
	/** The participant who waits, with the identity they will have in the meeting. See {@link MeetWaitingParticipant} for details */
	participant: MeetWaitingParticipant;
}

/**
 * Data of the `waitingParticipant.state` message the server sends to the waiting participant on its WebSocket
 * connection: on open, on every answered ping and on every change of the wait.
 */
export interface MeetWaitingParticipantState {
	/** Status of the wait. A final one, any but `waiting` and `admitted`, ends the conversation */
	status: MeetWaitingParticipantStatus;
	/** Who caused the change. Omitted while `status` is `waiting`. See {@link MeetEventOrigin} for details */
	origin?: MeetEventOrigin;
	/** Why the wait changed, where `status` and `origin` do not tell. See {@link MeetWaitingParticipantReason} for details */
	reason?: MeetWaitingParticipantReason;
	/** Seconds waited since the participant asked, while `status` is `waiting` */
	waitedSeconds?: number;
	/** Whether the room has an active meeting. Omitted when the server could not read the room */
	meetingActive?: boolean;
	/** The room's locked room message. Omitted when there is none or the server could not read the room */
	message?: string;
}

/**
 * Type of the WebSocket message that carries a {@link MeetWaitingParticipantState}.
 */
export const MEET_WAITING_PARTICIPANT_STATE_MESSAGE = 'waitingParticipant.state';
