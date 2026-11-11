import type { MeetLobbyParticipant, MeetLobbyStatus } from '@openvidu-meet/typings';

/** A participant as the waiting room keeps them, with the name of the room they asked to join. */
export interface LobbyParticipant extends MeetLobbyParticipant {
	roomName: string;
}

/** A wait still in the line of its room: waiting, or admitted and not joined yet. */
export interface LobbyEntry extends LobbyParticipant {
	waitId: string;
	status: MeetLobbyStatus.WAITING | MeetLobbyStatus.ADMITTED;
	/** Set once the admission was used to issue the join token. */
	used?: true;
}

/** A wait as its ticket finds it, also for 5 minutes after it ended. */
export interface LobbyWait {
	waitId: string;
	roomId: string;
	participant: LobbyParticipant;
	/** `memberId` or `userId` of the request that started the wait, absent for an anonymous link. */
	principal?: string;
	/** Current status: the entry's while in line, the outcome once ended. */
	status: MeetLobbyStatus;
	/** Whether the wait is over: it left the line, or its admission was used to issue the join token. */
	ended: boolean;
}

/** Who asks to join: the identity and correlation fields the wait keeps until the participant joins. */
export interface LobbyKnockRequest {
	participantIdentity: string;
	participantName: string;
	externalId?: string;
	metadata?: string;
	memberId?: string;
	userId?: string;
}

/**
 * The waiting participants whose place in line changed, from position `from` on (`from` is the
 * position of the first one, starting at 1), with `now` the Redis time of the change.
 */
export interface LobbyLine {
	now: number;
	from: number;
	waiting: [waitId: string, knockDate: number][];
}

export interface LobbyKnockResult {
	entry: LobbyEntry;
	/** The earlier wait of the same identity, ended as `left` by this knock. */
	replaced?: LobbyEntry;
	line: LobbyLine;
}

export type LobbyDecision = 'admit' | 'reject';

export type LobbyDecisionResult =
	{ decided: LobbyEntry[]; line: LobbyLine } | { notWaiting: string } | { noPlaces: true };

/** The entry a ticket change applied to, or the current status of a wait it did not apply to (none when unknown). */
export type LobbyTicketChange = { entry: LobbyEntry } | { status?: MeetLobbyStatus };

export type LobbyReturnResult = { entry: LobbyEntry; line: LobbyLine } | { status?: MeetLobbyStatus };

export interface LobbyEndResult {
	/** Waits ended with the outcome asked for, to be told. */
	ended: LobbyEntry[];
	/** Admissions already used, removed without telling anyone: their participant holds a token. */
	silent: LobbyEntry[];
	line: LobbyLine;
}

export interface LobbyEndOptions {
	/** The waits to end, by id; all the room's waits when omitted. */
	waitIds?: string[];
	/** Whether admissions already used are removed too. Always true when every wait of the room ends. */
	includeUsed?: boolean;
	/** Only the waits unseen for this many milliseconds, judged when the script runs. */
	unseenFor?: number;
}

/** What the presence of a wait answers, from the Redis time of the script. */
export interface LobbyPresence {
	roomId: string;
	status: MeetLobbyStatus;
	queuePosition?: number;
	waitedSeconds?: number;
}

/** A pass of the sweep: the Redis time, the previous pass and the last gap it saw, and the waits unseen for too long. */
export interface LobbySweepTick {
	now: number;
	lastRun?: number;
	gapAt?: number;
	due: { roomId: string; waitId: string }[];
}
