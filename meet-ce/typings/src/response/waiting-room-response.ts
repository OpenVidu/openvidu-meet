import { MeetWaitingRoomParticipantType } from '../database/room-member.entity.js';
import { MeetEventOrigin } from '../embedded/events.js';

/**
 * How a wait in the waiting room stands or ended. It is the status the `participantWaitingChanged` webhook
 * and embedded event carry, and the one the waiting screen shows.
 */
export enum MeetWaitingRoomStatus {
	/**
	 * The participant waits to be admitted. Both surfaces send it when an admitted participant returns to
	 * the line because the meeting was full; the embedded event also repeats it every time the position in
	 * line changes.
	 */
	WAITING = 'waiting',
	/**
	 * A moderator let the participant in, or the waiting room was turned off. It is not the join:
	 * `meetingJoined` confirms it, or `waiting` follows when the meeting is full by then.
	 */
	ADMITTED = 'admitted',
	/** A moderator rejected the participant */
	REJECTED = 'rejected',
	/** The participant left the waiting room, or asked again and so started a new wait */
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
 * `participantWaitingChanged` webhook and embedded event.
 */
export enum MeetWaitingRoomReason {
	/** `left`: the participant asked to join again, from another tab or device, which started a new wait */
	REPLACED = 'replaced',
	/** `expired`: the participant's page closed, reloaded or navigated away */
	PAGE_CLOSED = 'page_closed',
	/** `expired`: the participant's meeting was out of touch for a minute */
	CONNECTION_LOST = 'connection_lost',
	/** `expired`: the participant was admitted and did not join within a minute */
	ADMISSION_UNUSED = 'admission_unused',
	/** `admitted`: the room's waiting room was turned off, which lets everyone waiting in */
	WAITING_ROOM_DISABLED = 'waiting_room_disabled'
}

/**
 * Value of `error` in the body of a refused waiting room request, as a code to tell the refusals apart.
 */
export enum MeetWaitingRoomErrorCode {
	/** `404`: a participant named in the decision does not wait; the body names them in `participantIdentity` */
	PARTICIPANT_NOT_WAITING = 'participant_not_waiting',
	/** `409`: the participants named outnumber the free places of the meeting; the body tells how many are free in `availablePlaces` */
	NOT_ENOUGH_PLACES = 'not_enough_places',
	/** `409`: the waiting room already holds as many participants as it can */
	WAITING_ROOM_FULL = 'waiting_room_full',
	/** `409`: the wait of the ticket is over, or unknown; the body tells how it ended in `status` when known */
	WAIT_ENDED = 'wait_ended'
}

/**
 * A participant who waits to be admitted to a meeting.
 */
export interface MeetWaitingRoomParticipant {
	/** Identity the participant will have in the meeting, created when they asked to join */
	participantIdentity: string;
	/** Name the participant gave. It is made unique among the meeting's participants only when they join */
	participantName: string;
	/** How the participant asked, derived by the server. See {@link MeetWaitingRoomParticipantType} for details */
	type: MeetWaitingRoomParticipantType;
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
	/** Timestamp in milliseconds since epoch when the participant asked to join. A return to the line keeps it */
	knockDate: number;
}

/**
 * The waiting participants and the free places of the meeting, as `participantWaitingList` answers and the
 * `waitingRoomUpdated` embedded event carries.
 */
export interface MeetWaitingRoomList {
	/** The participants waiting, in arrival order */
	participants: MeetWaitingRoomParticipant[];
	/**
	 * Free places of the meeting: the participant limit minus the participants connected and the
	 * participants admitted until LiveKit reports them joined, a minute after their admission at most,
	 * never below 0. `null` when the room has no limit
	 */
	availablePlaces: number | null;
}

/**
 * Answer of `participantWaitingAdmit` and `participantWaitingReject`: the participants decided on.
 */
export interface MeetParticipantWaitingDecisionResponse {
	/** The participants admitted or rejected, in arrival order. Possibly none when the decision was on everyone waiting */
	participants: MeetWaitingRoomParticipant[];
}

/**
 * Answer of the internal token request when the participant has to wait.
 */
export interface MeetWaitingRoomTicketResponse {
	/** Opaque credential of the wait: it opens the WebSocket connection of the wait, the token request once admitted and the leave request */
	waitingRoomTicket: string;
	/** The participant who waits, with the identity they will have in the meeting. See {@link MeetWaitingRoomParticipant} for details */
	participant: MeetWaitingRoomParticipant;
}

/**
 * Data of the `waitingRoom.state` message the server sends to the waiting participant on its WebSocket
 * connection: on open, on every answered ping and on every change of the wait.
 */
export interface MeetWaitingRoomState {
	/** Status of the wait. A final one, any but `waiting` and `admitted`, ends the conversation */
	status: MeetWaitingRoomStatus;
	/** Who caused the change. Omitted while `status` is `waiting`. See {@link MeetEventOrigin} for details */
	origin?: MeetEventOrigin;
	/** Why the wait changed, where `status` and `origin` do not tell. See {@link MeetWaitingRoomReason} for details */
	reason?: MeetWaitingRoomReason;
	/** Position in line, from 1, while `status` is `waiting` */
	queuePosition?: number;
	/** Seconds waited since the participant asked, while `status` is `waiting` */
	waitedSeconds?: number;
	/** Whether the room has an active meeting. Omitted when the server could not read the room */
	meetingActive?: boolean;
	/** The room's waiting room message. Omitted when there is none or the server could not read the room */
	message?: string;
}

/**
 * Type of the WebSocket message that carries a {@link MeetWaitingRoomState}.
 */
export const MEET_WAITING_ROOM_STATE_MESSAGE = 'waitingRoom.state';
