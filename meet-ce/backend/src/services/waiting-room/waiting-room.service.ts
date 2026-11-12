import type {
	MeetWaitingRoomList,
	MeetWaitingRoomParticipant,
	MeetWaitingRoomState,
	MeetWaitingRoomTicketResponse,
	MeetRoom,
	MeetRoomConfig
} from '@openvidu-meet/typings';
import {
	MEET_WAITING_ROOM_STATE_MESSAGE,
	MeetEventOrigin,
	MeetWaitingRoomReason,
	MeetWaitingRoomStatus
} from '@openvidu-meet/typings';
import { createHash, randomBytes } from 'crypto';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { MeetParticipantHelper } from '../../helpers/participant.helper.js';
import {
	errorWaitingRoomFull,
	errorWaitingRoomNoFreePlaces,
	errorWaitingRoomParticipantNotWaiting,
	errorRoomNotFound
} from '../../models/error.model.js';
import type {
	WaitingRoomDecision,
	WaitingRoomEndResult,
	WaitingRoomEntry,
	WaitingRoomKnockRequest,
	WaitingRoomLine,
	WaitingRoomParticipant,
	WaitingRoomReturnResult,
	WaitingRoomTicketChange,
	WaitingRoomWait
} from '../../models/waiting-room.model.js';
import { RoomRepository } from '../../repositories/room.repository.js';
import { FrontendEventService } from '../frontend-event.service.js';
import { LiveKitService } from '../livekit.service.js';
import { LoggerService } from '../logger.service.js';
import { WebhookDispatcherService } from '../webhook-dispatcher.service.js';
import { WebSocketService } from '../websocket.service.js';
import { WaitingRoomAdmissionPolicy } from './waiting-room-admission.policy.js';
import { WaitingRoomStateService } from './waiting-room-state.service.js';

/** Why each wait in a list changed; none where its status and origin tell it all. */
type ReasonOf = (entry: WaitingRoomEntry) => MeetWaitingRoomReason | undefined;

const noReason: ReasonOf = () => undefined;

const toParticipant = ({
	participantIdentity,
	participantName,
	type,
	externalId,
	metadata,
	knockDate
}: WaitingRoomParticipant): MeetWaitingRoomParticipant => ({
	participantIdentity,
	participantName,
	type,
	...(externalId !== undefined && { externalId }),
	...(metadata !== undefined && { metadata }),
	knockDate
});

const byArrival = (a: WaitingRoomEntry, b: WaitingRoomEntry): number =>
	a.knockDate - b.knockDate || (a.participantIdentity < b.participantIdentity ? -1 : 1);

const identitiesOf = (entries: WaitingRoomEntry[]): string =>
	entries.map(({ participantIdentity }) => `'${participantIdentity}'`).join(', ');

/**
 * The use cases of the waiting room. Each one runs one atomic script and then tells whom it concerns:
 * the waiters (their `waitingRoom.state` through the WebSocket channel), the participants of the meeting (the
 * `meet_waiting_room_updated` signal) and the webhooks. Telling is best effort: a waiter gets their state again
 * at their next answered ping, and admitters fetch the list periodically.
 *
 * The ticket of a wait is never stored nor logged: the wait is known by `sha256(ticket)`.
 */
@injectable()
export class WaitingRoomService {
	constructor(
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(WaitingRoomStateService) protected waitingRoomStateService: WaitingRoomStateService,
		@inject(WaitingRoomAdmissionPolicy) protected waitingRoomAdmissionPolicy: WaitingRoomAdmissionPolicy,
		@inject(WebSocketService) protected webSocketService: WebSocketService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(WebhookDispatcherService) protected webhookDispatcherService: WebhookDispatcherService,
		@inject(LoggerService) protected logger: LoggerService
	) {}

	/**
	 * Puts a participant who asks to join at the end of the line and answers their ticket. An earlier wait
	 * of the same identity ends as `left`. The participant's type and the principal the ticket is bound to
	 * come from the request's credential.
	 *
	 * @throws The `409` waiting room full error when the room already holds the most participants it may
	 */
	async knock(
		room: Pick<MeetRoom, 'roomId' | 'roomName'>,
		request: WaitingRoomKnockRequest
	): Promise<MeetWaitingRoomTicketResponse> {
		const { roomId, roomName } = room;
		const { participantIdentity, participantName, externalId, metadata } = request;
		const waitingRoomTicket = randomBytes(16).toString('base64url');
		const knock = await this.waitingRoomStateService.knock(
			roomId,
			this.waitIdOf(waitingRoomTicket),
			{
				participantIdentity,
				participantName,
				type: this.waitingRoomAdmissionPolicy.participantTypeOf(request),
				...(externalId !== undefined && { externalId }),
				...(metadata !== undefined && { metadata }),
				roomName
			},
			this.waitingRoomAdmissionPolicy.principalOf(request)
		);

		if (!knock) throw errorWaitingRoomFull(roomId);

		this.logger.verbose(`Participant '${participantIdentity}' asked to join room '${roomId}' and waits`);

		if (knock.replaced) {
			this.tell(
				roomId,
				[knock.replaced],
				MeetWaitingRoomStatus.LEFT,
				MeetEventOrigin.PARTICIPANT,
				() => MeetWaitingRoomReason.REPLACED
			);
		}

		this.webhookDispatcherService.sendParticipantKnockedWebhook({
			roomId,
			roomName,
			participant: toParticipant(knock.entry)
		});

		this.afterChange(roomId, knock.line);
		return this.ticketOf(waitingRoomTicket, knock.entry);
	}

	/** The answer that hands a participant the ticket of their wait. */
	ticketOf(waitingRoomTicket: string, participant: WaitingRoomParticipant): MeetWaitingRoomTicketResponse {
		return { waitingRoomTicket, participant: toParticipant(participant) };
	}

	/** The wait of a ticket, also for a while after it ended; null when unknown. */
	findWait(waitingRoomTicket: string): Promise<WaitingRoomWait | null> {
		return this.waitingRoomStateService.findWait(this.waitIdOf(waitingRoomTicket));
	}

	/**
	 * Uses the admission of a wait, right before its join token is issued. The entry keeps counting as a
	 * taken place until the participant joins. Answers the entry, or the status of a wait no longer admitted.
	 */
	async consume(wait: WaitingRoomWait): Promise<WaitingRoomTicketChange> {
		const change = await this.waitingRoomStateService.consume(wait.waitId);

		if ('entry' in change) {
			this.logger.verbose(
				`Admission of participant '${change.entry.participantIdentity}' in room '${wait.roomId}' used to join`
			);
		}

		return change;
	}

	/**
	 * Puts an admitted participant who found the meeting full back in their place in line. Answers the
	 * entry, or the status of a wait no longer admitted.
	 */
	async returnToLine(wait: WaitingRoomWait): Promise<WaitingRoomReturnResult> {
		const change = await this.waitingRoomStateService.returnToLine(wait.waitId);

		if ('entry' in change) {
			this.logger.verbose(
				`Participant '${change.entry.participantIdentity}' found the meeting of room '${wait.roomId}' full and is back in line`
			);
			this.tell(wait.roomId, [change.entry], MeetWaitingRoomStatus.WAITING, MeetEventOrigin.SYSTEM);
			this.afterChange(wait.roomId, change.line);
		}

		return change;
	}

	/**
	 * Ends a wait at its participant's request: as `left`, or as `expired` when their page closed, reloaded or
	 * navigated away. A ticket of another room, unknown or ended, changes nothing.
	 */
	async leave(roomId: string, waitingRoomTicket: string, reason?: MeetWaitingRoomReason.PAGE_CLOSED): Promise<void> {
		const wait = await this.findWait(waitingRoomTicket);

		if (wait?.roomId !== roomId || wait.ended) return;

		if (reason) {
			await this.endWaits(roomId, MeetWaitingRoomStatus.EXPIRED, MeetEventOrigin.SYSTEM, [wait.waitId], reason);
		} else {
			await this.endWaits(roomId, MeetWaitingRoomStatus.LEFT, MeetEventOrigin.PARTICIPANT, [wait.waitId]);
		}
	}

	/**
	 * The participants waiting in a room, in arrival order, and the free places of its meeting. With the
	 * waiting room off the list is empty.
	 *
	 * @throws The `404` room not found error
	 */
	async list(roomId: string): Promise<MeetWaitingRoomList> {
		const config = await this.configOf(roomId);
		const [entries, capacity] = await Promise.all([
			this.waitingRoomStateService.entries(roomId),
			this.capacityOf(roomId, config)
		]);
		const admitted = entries.filter(({ status }) => status === MeetWaitingRoomStatus.ADMITTED).length;
		const waiting = config.waitingRoom.enabled
			? entries.filter(({ status }) => status === MeetWaitingRoomStatus.WAITING).sort(byArrival)
			: [];
		return {
			participants: waiting.map(toParticipant),
			availablePlaces: capacity === null ? null : Math.max(capacity - admitted, 0)
		};
	}

	/**
	 * Admits the named waiting participants, all of them or none, or, with none named, the first waiting up
	 * to the free places. Answers the participants admitted.
	 *
	 * @throws The `404` error naming the first participant that no longer waits, the `409` error with the
	 * free places when the named participants outnumber them, or the `404` room not found error
	 */
	admit(roomId: string, participantIdentities?: string[]): Promise<MeetWaitingRoomParticipant[]> {
		return this.decide(roomId, 'admit', participantIdentities);
	}

	/**
	 * Rejects the named waiting participants, all of them or none, or, with none named, everyone waiting.
	 * Answers the participants rejected.
	 *
	 * @throws The `404` error naming the first participant that no longer waits, or the `404` room not found error
	 */
	reject(roomId: string, participantIdentities?: string[]): Promise<MeetWaitingRoomParticipant[]> {
		return this.decide(roomId, 'reject', participantIdentities);
	}

	/**
	 * Ends waits of a room with an outcome: the given ones, or every one, admissions already used included,
	 * when none are given. Answers the waits ended and told.
	 */
	async endWaits(
		roomId: string,
		outcome: MeetWaitingRoomStatus,
		origin: MeetEventOrigin,
		waitIds?: string[],
		reason?: MeetWaitingRoomReason
	): Promise<WaitingRoomEntry[]> {
		const result = await this.waitingRoomStateService.end(roomId, outcome, { waitIds });
		this.afterEnd(roomId, result, outcome, origin, () => reason);
		return result.ended;
	}

	/**
	 * Ends every wait of a room whose meeting was ended on purpose; a wait started afterwards goes on. Never
	 * fails: the waits left go on for the room's next meeting, as when a meeting empties.
	 */
	endMeeting(roomId: string, origin: MeetEventOrigin): Promise<void> {
		return this.endEveryWait(roomId, MeetWaitingRoomStatus.MEETING_ENDED, origin);
	}

	/**
	 * Ends every wait of a room that was closed or deleted. Never fails: a waiter left is told at their next
	 * answered ping, which finds the room closed.
	 */
	closeRoom(roomId: string): Promise<void> {
		return this.endEveryWait(roomId, MeetWaitingRoomStatus.ROOM_CLOSED, MeetEventOrigin.MODERATOR);
	}

	/**
	 * Lets everyone waiting in a room whose waiting room was turned off: each one joins as any participant.
	 * Never fails: a waiter left is let in at their next answered ping, which finds the waiting room off.
	 */
	letEveryoneIn(roomId: string): Promise<void> {
		return this.endEveryWait(
			roomId,
			MeetWaitingRoomStatus.ADMITTED,
			MeetEventOrigin.MODERATOR,
			MeetWaitingRoomReason.WAITING_ROOM_DISABLED
		);
	}

	/**
	 * Ends as expired the given waits of a room still unseen for too long when the script runs: a waiting
	 * participant whose client is out of touch, or an admission not used by joining. A used admission is
	 * removed silently, since its participant holds a token.
	 */
	async expire(roomId: string, waitIds: string[]): Promise<void> {
		const result = await this.waitingRoomStateService.end(roomId, MeetWaitingRoomStatus.EXPIRED, {
			waitIds,
			includeUsed: true,
			unseenFor: ms(INTERNAL_CONFIG.WAITING_ROOM_UNSEEN_TIMEOUT)
		});
		this.afterEnd(roomId, result, MeetWaitingRoomStatus.EXPIRED, MeetEventOrigin.SYSTEM, ({ status }) =>
			status === MeetWaitingRoomStatus.ADMITTED
				? MeetWaitingRoomReason.ADMISSION_UNUSED
				: MeetWaitingRoomReason.CONNECTION_LOST
		);
	}

	/**
	 * Releases the place an admitted participant held, now that LiveKit reports them in the meeting. Never
	 * fails: an unreleased place is released by the sweep a minute after the admission.
	 */
	async joined(roomId: string, participantIdentity: string): Promise<void> {
		try {
			const entry = await this.waitingRoomStateService.joined(roomId, participantIdentity);

			if (!entry) return;

			this.logger.verbose(`Admitted participant '${participantIdentity}' joined room '${roomId}'`);
			this.signalAdmitters(roomId);
		} catch (error) {
			this.logger.warn(
				`Could not release the waiting room place of participant '${participantIdentity}' in room '${roomId}'`,
				error
			);
		}
	}

	protected async endEveryWait(
		roomId: string,
		outcome: MeetWaitingRoomStatus,
		origin: MeetEventOrigin,
		reason?: MeetWaitingRoomReason
	): Promise<void> {
		try {
			await this.endWaits(roomId, outcome, origin, undefined, reason);
		} catch (error) {
			this.logger.warn(`Could not end the waits of room '${roomId}' as ${outcome}`, error);
		}
	}

	protected waitIdOf(waitingRoomTicket: string): string {
		return createHash('sha256').update(waitingRoomTicket).digest('hex');
	}

	protected async decide(
		roomId: string,
		decision: WaitingRoomDecision,
		participantIdentities?: string[]
	): Promise<MeetWaitingRoomParticipant[]> {
		const config = await this.configOf(roomId);

		if (!config.waitingRoom.enabled) {
			if (participantIdentities) throw errorWaitingRoomParticipantNotWaiting(participantIdentities[0], roomId);

			return [];
		}

		const capacity = decision === 'admit' ? await this.capacityOf(roomId, config) : null;
		const result = await this.waitingRoomStateService.decide(roomId, decision, participantIdentities, capacity);

		if ('notWaiting' in result) throw errorWaitingRoomParticipantNotWaiting(result.notWaiting, roomId);

		if ('noPlaces' in result) {
			throw errorWaitingRoomNoFreePlaces(roomId, participantIdentities?.length ?? 0, result.availablePlaces);
		}

		const status = decision === 'admit' ? MeetWaitingRoomStatus.ADMITTED : MeetWaitingRoomStatus.REJECTED;

		if (result.decided.length > 0) {
			this.logger.verbose(`Participants ${status} in room '${roomId}': ${identitiesOf(result.decided)}`);
			this.tell(roomId, result.decided, status, MeetEventOrigin.MODERATOR);
			this.afterChange(roomId, result.line);
		}

		return result.decided.map(toParticipant);
	}

	protected afterEnd(
		roomId: string,
		{ ended, silent, line }: WaitingRoomEndResult,
		outcome: MeetWaitingRoomStatus,
		origin: MeetEventOrigin,
		reasonOf: ReasonOf = noReason
	): void {
		if (ended.length + silent.length === 0) return;

		this.logger.verbose(
			`Waits ended as ${outcome} in room '${roomId}': ${identitiesOf([...ended, ...silent])}${silent.length > 0 ? ` (${silent.length} already joining)` : ''}`
		);
		this.tell(roomId, ended, outcome, origin, reasonOf);
		this.afterChange(roomId, line);
	}

	/** Reports a new status of these waits to the webhooks and, unless it is `waiting`, to each waiter. */
	protected tell(
		roomId: string,
		entries: WaitingRoomEntry[],
		status: MeetWaitingRoomStatus,
		origin: MeetEventOrigin,
		reasonOf: ReasonOf = noReason
	): void {
		for (const entry of entries) {
			const reason = reasonOf(entry);

			if (status !== MeetWaitingRoomStatus.WAITING) {
				this.sendState(roomId, entry.waitId, { status, origin, ...(reason && { reason }) });
			}

			this.webhookDispatcherService.sendParticipantWaitingChangedWebhook({
				roomId,
				roomName: entry.roomName,
				participant: toParticipant(entry),
				status,
				origin,
				...(reason && { reason })
			});
		}
	}

	/** Tells each waiter whose place changed their new place, and the meeting that the list changed. */
	protected afterChange(roomId: string, { now, from, waiting }: WaitingRoomLine): void {
		waiting.forEach(([waitId, knockDate], index) =>
			this.sendState(roomId, waitId, {
				status: MeetWaitingRoomStatus.WAITING,
				queuePosition: from + index,
				waitedSeconds: Math.floor((now - knockDate) / 1000)
			})
		);
		this.signalAdmitters(roomId);
	}

	protected sendState(roomId: string, waitId: string, state: MeetWaitingRoomState): void {
		this.webSocketService
			.send(roomId, waitId, MEET_WAITING_ROOM_STATE_MESSAGE, state)
			.catch((error: unknown) =>
				this.logger.warn(`Could not send a waiting room state in room '${roomId}'`, error)
			);
	}

	protected signalAdmitters(roomId: string): void {
		void this.frontendEventService.sendWaitingRoomUpdatedSignal(roomId);
	}

	protected async configOf(roomId: string): Promise<MeetRoomConfig> {
		const room = await this.roomRepository.findByRoomId(roomId, ['config']);

		if (!room) throw errorRoomNotFound(roomId);

		return room.config;
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
