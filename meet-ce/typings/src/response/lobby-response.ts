import { MeetLobbyParticipantType } from '../database/room-member.entity.js';

/**
 * How a wait in the waiting room stands or ended. It is the status the `lobbyStatusChanged` webhook
 * and embedded event carry, and the one the waiting screen shows.
 */
export enum MeetLobbyStatus {
	/**
	 * The participant waits to be admitted. The webhook sends it only when an admitted participant
	 * returns to the line because the meeting was full; the embedded event also repeats it every time
	 * the position in line changes.
	 */
	WAITING = 'waiting',
	/**
	 * A moderator let the participant in, or the waiting room was turned off. It is not the join:
	 * `meetingJoined` confirms it. A join that finds the meeting full after `admitted` raises no lobby
	 * event.
	 */
	ADMITTED = 'admitted',
	/** A moderator rejected the participant */
	REJECTED = 'rejected',
	/** The participant left the waiting room, or asked again and so started a new wait */
	LEFT = 'left',
	/**
	 * The participant lost their place: their meeting stopped being in touch for a minute, or an
	 * admission was not used within a minute. The embedded event also reports it when the meeting
	 * gave up reconnecting, no longer knew the wait, or lost the answer after an admission.
	 */
	EXPIRED = 'expired',
	/** The meeting was ended explicitly, or reached its duration limit, while the participant waited */
	MEETING_ENDED = 'meeting_ended',
	/** The room was closed or deleted while the participant waited */
	ROOM_CLOSED = 'room_closed'
}

/**
 * A participant who waits to be admitted to a meeting.
 */
export interface MeetLobbyParticipant {
	/** Identity the participant will have in the meeting, created when they asked to join */
	participantIdentity: string;
	/** Name the participant gave. It is made unique among the meeting's participants only when they join */
	participantName: string;
	/** How the participant asked, derived by the server. See {@link MeetLobbyParticipantType} for details */
	type: MeetLobbyParticipantType;
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
 * The waiting participants and the free places of the meeting, as `lobbyList` answers and the
 * `lobbyUpdated` embedded event carries.
 */
export interface MeetLobbyList {
	/** The participants waiting, in arrival order */
	participants: MeetLobbyParticipant[];
	/**
	 * Free places of the meeting: the participant limit minus the participants connected and the
	 * participants admitted until LiveKit reports them joined, a minute after their admission at most,
	 * never below 0. `null` when the room has no limit
	 */
	availablePlaces: number | null;
}

/**
 * Answer of `lobbyAdmit` and `lobbyReject`: the participants decided on.
 */
export interface MeetLobbyDecisionResponse {
	/** The participants admitted or rejected, in arrival order. Possibly none when the decision was on everyone waiting */
	participants: MeetLobbyParticipant[];
}

/**
 * Answer of the internal token request when the participant has to wait.
 */
export interface MeetLobbyTicketResponse {
	/** Opaque credential of the wait: it opens the WebSocket connection of the wait, the token request once admitted and the leave request */
	lobbyTicket: string;
	/** Identity the participant will have in the meeting */
	participantIdentity: string;
}

/**
 * Data of the `lobby.state` message the server sends to the waiting participant on its WebSocket
 * connection: on open, on every answered ping and on every change of the wait.
 */
export interface MeetLobbyState {
	/** Status of the wait. A final one, any but `waiting` and `admitted`, ends the conversation */
	status: MeetLobbyStatus;
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
 * Type of the WebSocket message that carries a {@link MeetLobbyState}.
 */
export const MEET_LOBBY_STATE_MESSAGE = 'lobby.state';
