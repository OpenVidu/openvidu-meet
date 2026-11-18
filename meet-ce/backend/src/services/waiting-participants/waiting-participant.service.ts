import type {
	MeetWaitingParticipantList,
	MeetWaitingParticipant,
	MeetWaitingParticipantState,
	MeetWaitingParticipantStatusChangedSignalPayload,
	MeetWaitingTicketResponse,
	MeetRoom,
	MeetRoomConfig
} from '@openvidu-meet/typings';
import {
	MEET_WAITING_PARTICIPANT_STATE_MESSAGE,
	MeetEventOrigin,
	MeetWaitingParticipantReason,
	MeetWaitingParticipantStatus,
	participantTypeOf
} from '@openvidu-meet/typings';
import { createHash, randomBytes } from 'crypto';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { MeetParticipantHelper } from '../../helpers/participant.helper.js';
import {
	errorWaitingListFull,
	errorNotEnoughPlaces,
	errorParticipantNotWaiting,
	errorRoomNotFound
} from '../../models/error.model.js';
import type {
	WaitingBulkRejectResult,
	WaitingDecision,
	WaitingDecisionResult,
	WaitingEndResult,
	WaitingEntry,
	WaitingKnockRequest,
	StoredWaitingParticipant,
	WaitingReturnResult,
	WaitingTicketChange,
	ParticipantWait
} from '../../models/waiting-participant.model.js';
import { RoomRepository } from '../../repositories/room.repository.js';
import { FrontendEventService } from '../frontend-event.service.js';
import { LiveKitService } from '../livekit.service.js';
import { LoggerService } from '../logger.service.js';
import { WebhookDispatcherService } from '../webhook-dispatcher.service.js';
import { WebSocketService } from '../websocket.service.js';
import { WaitingParticipantAdmissionPolicy } from './waiting-participant-admission.policy.js';
import { WaitingParticipantStateService } from './waiting-participant-state.service.js';

/** Why each wait in a list changed; none where its status and origin tell it all. */
type ReasonOf = (entry: WaitingEntry) => MeetWaitingParticipantReason | undefined;

const noReason: ReasonOf = () => undefined;

const toParticipant = ({
	participantIdentity,
	participantName,
	type,
	role,
	externalId,
	metadata,
	knockDate
}: StoredWaitingParticipant): MeetWaitingParticipant => ({
	participantIdentity,
	participantName,
	type,
	role,
	...(externalId !== undefined && { externalId }),
	...(metadata !== undefined && { metadata }),
	knockDate
});

const identitiesOf = (entries: WaitingEntry[]): string =>
	entries.map(({ participantIdentity }) => `'${participantIdentity}'`).join(', ');

/**
 * The use cases of the waiting participants of a locked room. Each one runs one atomic script and then tells
 * whom it concerns: the waiters (their `waitingParticipant.state` through the WebSocket channel), the participants
 * of the meeting (the `meet_waiting_participant_list_updated` signal) and the webhooks. Telling is best effort: a waiter gets their state again
 * at their next answered ping, and admitters fetch the list periodically.
 *
 * The ticket of a wait is never stored nor logged: the wait is known by `sha256(ticket)`.
 */
@injectable()
export class WaitingParticipantService {
	constructor(
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(WaitingParticipantStateService)
		protected waitingParticipantStateService: WaitingParticipantStateService,
		@inject(WaitingParticipantAdmissionPolicy)
		protected waitingParticipantAdmissionPolicy: WaitingParticipantAdmissionPolicy,
		@inject(WebSocketService) protected webSocketService: WebSocketService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(WebhookDispatcherService) protected webhookDispatcherService: WebhookDispatcherService,
		@inject(LoggerService) protected logger: LoggerService
	) {}

	/**
	 * Starts the wait of a participant who asks to join and answers their ticket. An earlier wait
	 * of the same identity ends as `left`. The participant's type and the principal the ticket is bound to
	 * come from the request's credential.
	 *
	 * @throws The `409` waiting list full error when the room already holds the most participants it may
	 */
	async knock(
		room: Pick<MeetRoom, 'roomId' | 'roomName'>,
		request: WaitingKnockRequest
	): Promise<MeetWaitingTicketResponse> {
		const { roomId, roomName } = room;
		const { participantIdentity, participantName, role, externalId, metadata } = request;
		const waitingTicket = randomBytes(16).toString('base64url');
		const knock = await this.waitingParticipantStateService.knock(
			roomId,
			this.waitIdOf(waitingTicket),
			{
				participantIdentity,
				participantName,
				type: participantTypeOf(request),
				role,
				...(externalId !== undefined && { externalId }),
				...(metadata !== undefined && { metadata }),
				roomName
			},
			this.waitingParticipantAdmissionPolicy.principalOf(request)
		);

		if (!knock) throw errorWaitingListFull(roomId);

		this.logger.verbose(`Participant '${participantIdentity}' asked to join room '${roomId}' and waits`);

		if (knock.replaced) {
			this.tell(
				roomId,
				[knock.replaced],
				MeetWaitingParticipantStatus.LEFT,
				MeetEventOrigin.PARTICIPANT,
				() => MeetWaitingParticipantReason.REPLACED
			);
		}

		this.webhookDispatcherService.sendWaitingParticipantKnockedWebhook({
			roomId,
			roomName,
			participant: toParticipant(knock.entry)
		});

		this.signalAdmitters(roomId);
		return this.ticketOf(waitingTicket, knock.entry);
	}

	/** The answer that hands a participant the ticket of their wait. */
	ticketOf(waitingTicket: string, participant: StoredWaitingParticipant): MeetWaitingTicketResponse {
		return { waitingTicket, participant: toParticipant(participant) };
	}

	/** The wait of a ticket, also for a while after it ended; null when unknown. */
	findWait(waitingTicket: string): Promise<ParticipantWait | null> {
		return this.waitingParticipantStateService.findWait(this.waitIdOf(waitingTicket));
	}

	/**
	 * Uses the admission of a wait, right before its join token is issued. The entry keeps counting as a
	 * taken place until the participant joins. Answers the entry, or the status of a wait no longer admitted.
	 */
	async consume(wait: ParticipantWait): Promise<WaitingTicketChange> {
		const change = await this.waitingParticipantStateService.consume(wait.waitId);

		if ('entry' in change) {
			this.logger.verbose(
				`Admission of participant '${change.entry.participantIdentity}' in room '${wait.roomId}' used to join`
			);
		}

		return change;
	}

	/**
	 * Makes an admitted participant who found the meeting full wait again, keeping their knock. Answers the
	 * entry, or the status of a wait no longer admitted.
	 */
	async returnToWaiting(wait: ParticipantWait): Promise<WaitingReturnResult> {
		const change = await this.waitingParticipantStateService.returnToWaiting(wait.waitId);

		if ('entry' in change) {
			const { entry, waitedSeconds } = change;
			this.logger.verbose(
				`Participant '${entry.participantIdentity}' found the meeting of room '${wait.roomId}' full and waits again`
			);
			this.tell(wait.roomId, [entry], MeetWaitingParticipantStatus.WAITING, MeetEventOrigin.SYSTEM);
			this.sendState(wait.roomId, entry.waitId, { status: MeetWaitingParticipantStatus.WAITING, waitedSeconds });
			this.signalAdmitters(wait.roomId);
		}

		return change;
	}

	/**
	 * Ends a wait at its participant's request: as `left`, or as `expired` when their page closed, reloaded or
	 * navigated away. A ticket of another room, unknown or ended, changes nothing.
	 */
	async leave(
		roomId: string,
		waitingTicket: string,
		reason?: MeetWaitingParticipantReason.PAGE_CLOSED
	): Promise<void> {
		const wait = await this.findWait(waitingTicket);

		if (wait?.roomId !== roomId || wait.ended) return;

		if (reason) {
			await this.endWaits(
				roomId,
				MeetWaitingParticipantStatus.EXPIRED,
				MeetEventOrigin.SYSTEM,
				[wait.waitId],
				reason
			);
		} else {
			await this.endWaits(roomId, MeetWaitingParticipantStatus.LEFT, MeetEventOrigin.PARTICIPANT, [wait.waitId]);
		}
	}

	/**
	 * The participants waiting in a room, in no promised order. In an unlocked room the list is empty.
	 *
	 * @throws The `404` room not found error
	 */
	async list(roomId: string): Promise<MeetWaitingParticipantList> {
		const room = await this.roomOf(roomId);
		const entries = room.access.lock.enabled ? await this.waitingParticipantStateService.entries(roomId) : [];
		return {
			participants: entries
				.filter(({ status }) => status === MeetWaitingParticipantStatus.WAITING)
				.map(toParticipant)
		};
	}

	/**
	 * A participant waiting in a room.
	 *
	 * @throws The `404` error when the participant does not wait, or the `404` room not found error
	 */
	async get(roomId: string, participantIdentity: string): Promise<MeetWaitingParticipant> {
		const room = await this.roomOf(roomId);
		const entry = room.access.lock.enabled
			? await this.waitingParticipantStateService.entry(roomId, participantIdentity)
			: null;

		if (entry?.status !== MeetWaitingParticipantStatus.WAITING) {
			throw errorParticipantNotWaiting(participantIdentity, roomId);
		}

		return toParticipant(entry);
	}

	/**
	 * Admits the named waiting participant or, with none named, everyone waiting, all of them or nobody.
	 *
	 * @throws The `404` error when the participant named does not wait, the `409` error when the participants
	 * to admit outnumber the free places, or the `404` room not found error
	 */
	admit(roomId: string, participantIdentity?: string): Promise<void> {
		return this.decide(roomId, 'admit', participantIdentity);
	}

	/**
	 * Rejects a waiting participant.
	 *
	 * @throws The `404` error when the participant does not wait, or the `404` room not found error
	 */
	reject(roomId: string, participantIdentity: string): Promise<void> {
		return this.decide(roomId, 'reject', participantIdentity);
	}

	/**
	 * Rejects each named participant on their own, so one who does not wait fails alone. Answers the
	 * participants rejected and those who failed.
	 *
	 * @throws The `404` room not found error
	 */
	async bulkReject(roomId: string, participantIdentities: string[]): Promise<WaitingBulkRejectResult> {
		const room = await this.roomOf(roomId);
		const result: WaitingBulkRejectResult = { rejected: [], failed: [] };

		for (const participantIdentity of participantIdentities) {
			const decision = room.access.lock.enabled
				? await this.runDecision(roomId, 'reject', participantIdentity, null)
				: { notWaiting: participantIdentity };

			if ('decided' in decision) {
				result.rejected.push(participantIdentity);
			} else {
				const { message } = errorParticipantNotWaiting(participantIdentity, roomId);
				result.failed.push({ participantIdentity, error: message });
			}
		}

		if (result.rejected.length > 0) this.signalAdmitters(roomId);

		return result;
	}

	/**
	 * Ends waits of a room with an outcome: the given ones, or every one, admissions already used included,
	 * when none are given. Answers the waits ended and told.
	 */
	async endWaits(
		roomId: string,
		outcome: MeetWaitingParticipantStatus,
		origin: MeetEventOrigin,
		waitIds?: string[],
		reason?: MeetWaitingParticipantReason
	): Promise<WaitingEntry[]> {
		const result = await this.waitingParticipantStateService.end(roomId, outcome, { waitIds });
		this.afterEnd(roomId, result, outcome, origin, () => reason);
		return result.ended;
	}

	/**
	 * Ends every wait of a room whose meeting was ended on purpose; a wait started afterwards goes on. Never
	 * fails: the waits left go on for the room's next meeting, as when a meeting empties.
	 */
	endMeeting(roomId: string, origin: MeetEventOrigin): Promise<void> {
		return this.endEveryWait(roomId, MeetWaitingParticipantStatus.MEETING_ENDED, origin);
	}

	/**
	 * Ends every wait of a room that was closed or deleted. Never fails: a waiter left is told at their next
	 * answered ping, which finds the room closed.
	 */
	closeRoom(roomId: string): Promise<void> {
		return this.endEveryWait(roomId, MeetWaitingParticipantStatus.ROOM_CLOSED, MeetEventOrigin.MODERATOR);
	}

	/**
	 * Lets everyone waiting in a room that was unlocked: each one joins as any participant.
	 * Never fails: a waiter left is let in at their next answered ping, which finds the room unlocked.
	 */
	letEveryoneIn(roomId: string): Promise<void> {
		return this.endEveryWait(
			roomId,
			MeetWaitingParticipantStatus.ADMITTED,
			MeetEventOrigin.MODERATOR,
			MeetWaitingParticipantReason.ROOM_UNLOCKED
		);
	}

	/**
	 * Ends as expired the given waits of a room still unseen for too long when the script runs: a waiting
	 * participant whose client is out of touch, or an admission not used by joining. A used admission is
	 * removed silently, since its participant holds a token.
	 */
	async expire(roomId: string, waitIds: string[]): Promise<void> {
		const result = await this.waitingParticipantStateService.end(roomId, MeetWaitingParticipantStatus.EXPIRED, {
			waitIds,
			includeUsed: true,
			unseenFor: ms(INTERNAL_CONFIG.WAITING_PARTICIPANT_UNSEEN_TIMEOUT)
		});
		this.afterEnd(roomId, result, MeetWaitingParticipantStatus.EXPIRED, MeetEventOrigin.SYSTEM, ({ status }) =>
			status === MeetWaitingParticipantStatus.ADMITTED
				? MeetWaitingParticipantReason.ADMISSION_UNUSED
				: MeetWaitingParticipantReason.CONNECTION_LOST
		);
	}

	/**
	 * Releases the place an admitted participant held, now that LiveKit reports them in the meeting. Never
	 * fails: an unreleased place is released by the sweep a minute after the admission.
	 */
	async joined(roomId: string, participantIdentity: string): Promise<void> {
		try {
			const entry = await this.waitingParticipantStateService.joined(roomId, participantIdentity);

			if (!entry) return;

			this.logger.verbose(`Admitted participant '${participantIdentity}' joined room '${roomId}'`);
			this.signalAdmitters(roomId);
		} catch (error) {
			this.logger.warn(
				`Could not release the place of admitted participant '${participantIdentity}' in room '${roomId}'`,
				error
			);
		}
	}

	protected async endEveryWait(
		roomId: string,
		outcome: MeetWaitingParticipantStatus,
		origin: MeetEventOrigin,
		reason?: MeetWaitingParticipantReason
	): Promise<void> {
		try {
			await this.endWaits(roomId, outcome, origin, undefined, reason);
		} catch (error) {
			this.logger.warn(`Could not end the waits of room '${roomId}' as ${outcome}`, error);
		}
	}

	protected waitIdOf(waitingTicket: string): string {
		return createHash('sha256').update(waitingTicket).digest('hex');
	}

	protected async decide(roomId: string, decision: WaitingDecision, participantIdentity?: string): Promise<void> {
		const room = await this.roomOf(roomId);

		if (!room.access.lock.enabled) {
			if (participantIdentity) throw errorParticipantNotWaiting(participantIdentity, roomId);

			return;
		}

		const capacity = decision === 'admit' ? await this.capacityOf(roomId, room.config) : null;
		const result = await this.runDecision(roomId, decision, participantIdentity, capacity);

		if ('notWaiting' in result) throw errorParticipantNotWaiting(result.notWaiting, roomId);

		if ('noPlaces' in result) throw errorNotEnoughPlaces(roomId);

		if (result.decided.length > 0) this.signalAdmitters(roomId);
	}

	/** Runs one decision and tells the participants decided on, but not the admitters. */
	protected async runDecision(
		roomId: string,
		decision: WaitingDecision,
		participantIdentity: string | undefined,
		capacity: number | null
	): Promise<WaitingDecisionResult> {
		const result = await this.waitingParticipantStateService.decide(
			roomId,
			decision,
			participantIdentity,
			capacity
		);

		if ('decided' in result && result.decided.length > 0) {
			const status =
				decision === 'admit' ? MeetWaitingParticipantStatus.ADMITTED : MeetWaitingParticipantStatus.REJECTED;
			this.logger.verbose(`Participants ${status} in room '${roomId}': ${identitiesOf(result.decided)}`);
			this.tell(roomId, result.decided, status, MeetEventOrigin.MODERATOR);
		}

		return result;
	}

	protected afterEnd(
		roomId: string,
		{ ended, silent }: WaitingEndResult,
		outcome: MeetWaitingParticipantStatus,
		origin: MeetEventOrigin,
		reasonOf: ReasonOf = noReason
	): void {
		if (ended.length + silent.length === 0) return;

		this.logger.verbose(
			`Waits ended as ${outcome} in room '${roomId}': ${identitiesOf([...ended, ...silent])}${silent.length > 0 ? ` (${silent.length} already joining)` : ''}`
		);
		this.tell(roomId, ended, outcome, origin, reasonOf);
		this.signalAdmitters(roomId);
	}

	/**
	 * Reports a new status of these waits to the webhooks, to the participants in the meeting who may admit and,
	 * unless it is `waiting`, to each waiter.
	 */
	protected tell(
		roomId: string,
		entries: WaitingEntry[],
		status: MeetWaitingParticipantStatus,
		origin: MeetEventOrigin,
		reasonOf: ReasonOf = noReason
	): void {
		const timestamp = Date.now();
		const changes = entries.map((entry) => {
			const reason = reasonOf(entry);

			if (status !== MeetWaitingParticipantStatus.WAITING) {
				this.sendState(roomId, entry.waitId, { status, origin, ...(reason && { reason }) });
			}

			const change = { roomId, participant: toParticipant(entry), status, origin, ...(reason && { reason }) };
			this.webhookDispatcherService.sendWaitingParticipantStatusChangedWebhook({
				...change,
				roomName: entry.roomName
			});
			return { ...change, timestamp };
		});

		void this.tellAdmitters(roomId, changes);
	}

	/** Tells the participants in the meeting who hold `waitingParticipantAdmin` how each of these waits changed. */
	protected async tellAdmitters(
		roomId: string,
		changes: MeetWaitingParticipantStatusChangedSignalPayload[]
	): Promise<void> {
		try {
			if (changes.length === 0 || !(await this.livekitService.roomExists(roomId))) return;

			const admitters = (await this.livekitService.listRoomParticipants(roomId))
				.filter(
					(participant) =>
						MeetParticipantHelper.parseMeetingMetadata(participant)?.permissions.waitingParticipantAdmin
				)
				.map(({ identity }) => identity);

			if (admitters.length === 0) return;

			for (const change of changes) {
				await this.frontendEventService.sendWaitingParticipantStatusChangedSignal(admitters, change);
			}
		} catch (error) {
			this.logger.warn(`Could not tell the admitters of room '${roomId}' how its waits changed`, error);
		}
	}

	protected sendState(roomId: string, waitId: string, state: MeetWaitingParticipantState): void {
		this.webSocketService
			.send(roomId, waitId, MEET_WAITING_PARTICIPANT_STATE_MESSAGE, state)
			.catch((error: unknown) =>
				this.logger.warn(`Could not send the state of a waiting participant in room '${roomId}'`, error)
			);
	}

	protected signalAdmitters(roomId: string): void {
		void this.frontendEventService.sendWaitingParticipantListUpdatedSignal(roomId);
	}

	protected async roomOf(roomId: string): Promise<Pick<MeetRoom, 'access' | 'config'>> {
		const room = await this.roomRepository.findByRoomId(roomId, ['access', 'config']);

		if (!room) throw errorRoomNotFound(roomId);

		return room;
	}

	/** The room's participant limit minus the participants connected to its meeting, null without a limit. */
	protected async capacityOf(roomId: string, { maxParticipants }: MeetRoomConfig): Promise<number | null> {
		if (!maxParticipants) return null;

		const participants = await this.livekitService.listRoomParticipants(roomId);
		return (
			maxParticipants -
			participants.filter((participant) => MeetParticipantHelper.isStandardParticipant(participant)).length
		);
	}
}
