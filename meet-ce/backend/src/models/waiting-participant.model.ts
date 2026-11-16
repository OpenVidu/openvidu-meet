import type { MeetWaitingParticipant, MeetWaitingParticipantStatus } from '@openvidu-meet/typings';

/** A waiting participant as Redis keeps them, with the name of the room they asked to join. */
export interface StoredWaitingParticipant extends MeetWaitingParticipant {
	roomName: string;
}

/** A wait still in the entries of its room: waiting, or admitted and not joined yet. */
export interface WaitingEntry extends StoredWaitingParticipant {
	waitId: string;
	status: MeetWaitingParticipantStatus.WAITING | MeetWaitingParticipantStatus.ADMITTED;
	/** Set once the admission was used to issue the join token. */
	used?: true;
}

/** A wait as its ticket finds it, also for 5 minutes after it ended. */
export interface ParticipantWait {
	waitId: string;
	roomId: string;
	participant: StoredWaitingParticipant;
	/** `memberId` or `userId` of the request that started the wait, absent for an anonymous link. */
	principal?: string;
	/** Current status: the entry's while it lasts, the outcome once ended. */
	status: MeetWaitingParticipantStatus;
	/** Whether the wait is over: its entry was removed, or its admission was used to issue the join token. */
	ended: boolean;
}

/** Who asks to join: the identity and correlation fields the wait keeps until the participant joins. */
export interface WaitingKnockRequest {
	participantIdentity: string;
	participantName: string;
	externalId?: string;
	metadata?: string;
	memberId?: string;
	userId?: string;
}

export interface WaitingKnockResult {
	entry: WaitingEntry;
	/** The earlier wait of the same identity, ended as `left` by this knock. */
	replaced?: WaitingEntry;
}

export type WaitingDecision = 'admit' | 'reject';

export type WaitingDecisionResult = { decided: WaitingEntry[] } | { notWaiting: string } | { noPlaces: true };

export interface WaitingBulkRejectResult {
	rejected: string[];
	failed: { participantIdentity: string; error: string }[];
}

/** The entry a ticket change applied to, or the current status of a wait it did not apply to (none when unknown). */
export type WaitingTicketChange = { entry: WaitingEntry } | { status?: MeetWaitingParticipantStatus };

export type WaitingReturnResult =
	{ entry: WaitingEntry; waitedSeconds: number } | { status?: MeetWaitingParticipantStatus };

export interface WaitingEndResult {
	/** Waits ended with the outcome asked for, to be told. */
	ended: WaitingEntry[];
	/** Admissions already used, removed without telling anyone: their participant holds a token. */
	silent: WaitingEntry[];
}

export interface WaitingEndOptions {
	/** The waits to end, by id; all the room's waits when omitted. */
	waitIds?: string[];
	/** Whether admissions already used are removed too. Always true when every wait of the room ends. */
	includeUsed?: boolean;
	/** Only the waits unseen for this many milliseconds, judged when the script runs. */
	unseenFor?: number;
}

/** What the presence of a wait answers, from the Redis time of the script. */
export interface WaitingPresence {
	roomId: string;
	status: MeetWaitingParticipantStatus;
	waitedSeconds?: number;
}

/** A pass of the sweep: the Redis time, the previous pass and the last gap it saw, and the waits unseen for too long. */
export interface WaitingSweepTick {
	now: number;
	lastRun?: number;
	gapAt?: number;
	due: { roomId: string; waitId: string }[];
}
