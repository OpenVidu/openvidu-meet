import type {
	MeetLobbyList,
	MeetLobbyParticipant,
	MeetLobbyState,
	MeetLobbyTicketResponse,
	MeetRoom,
	MeetRoomConfig
} from '@openvidu-meet/typings';
import { MEET_LOBBY_STATE_MESSAGE, MeetEventOrigin, MeetLobbyStatus } from '@openvidu-meet/typings';
import { createHash, randomBytes } from 'crypto';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { MeetParticipantHelper } from '../../helpers/participant.helper.js';
import {
	errorLobbyFull,
	errorLobbyNoFreePlaces,
	errorLobbyParticipantNotWaiting,
	errorRoomNotFound
} from '../../models/error.model.js';
import type {
	LobbyDecision,
	LobbyEndResult,
	LobbyEntry,
	LobbyKnockRequest,
	LobbyLine,
	LobbyParticipant,
	LobbyReturnResult,
	LobbyTicketChange,
	LobbyWait
} from '../../models/lobby.model.js';
import { RoomRepository } from '../../repositories/room.repository.js';
import { FrontendEventService } from '../frontend-event.service.js';
import { LiveKitService } from '../livekit.service.js';
import { LoggerService } from '../logger.service.js';
import { WebhookDispatcherService } from '../webhook-dispatcher.service.js';
import { WebSocketService } from '../websocket.service.js';
import { LobbyAdmissionPolicy } from './lobby-admission.policy.js';
import { LobbyStateService } from './lobby-state.service.js';

const toParticipant = ({
	participantIdentity,
	participantName,
	type,
	externalId,
	metadata,
	knockDate
}: LobbyParticipant): MeetLobbyParticipant => ({
	participantIdentity,
	participantName,
	type,
	...(externalId !== undefined && { externalId }),
	...(metadata !== undefined && { metadata }),
	knockDate
});

const byArrival = (a: LobbyEntry, b: LobbyEntry): number =>
	a.knockDate - b.knockDate || (a.participantIdentity < b.participantIdentity ? -1 : 1);

const identitiesOf = (entries: LobbyEntry[]): string =>
	entries.map(({ participantIdentity }) => `'${participantIdentity}'`).join(', ');

/**
 * The use cases of the waiting room. Each one runs one atomic script and then tells whom it concerns:
 * the waiters (their `lobby.state` through the WebSocket channel), the participants of the meeting (the
 * `meet_lobby_updated` signal) and the webhooks. Telling is best effort: a waiter gets their state again
 * at their next answered ping, and admitters fetch the list periodically.
 *
 * The ticket of a wait is never stored nor logged: the wait is known by `sha256(ticket)`.
 */
@injectable()
export class LobbyService {
	constructor(
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(LobbyStateService) protected lobbyStateService: LobbyStateService,
		@inject(LobbyAdmissionPolicy) protected lobbyAdmissionPolicy: LobbyAdmissionPolicy,
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
		request: LobbyKnockRequest
	): Promise<MeetLobbyTicketResponse> {
		const { roomId, roomName } = room;
		const { participantIdentity, participantName, externalId, metadata } = request;
		const lobbyTicket = randomBytes(16).toString('base64url');
		const knock = await this.lobbyStateService.knock(
			roomId,
			this.waitIdOf(lobbyTicket),
			{
				participantIdentity,
				participantName,
				type: this.lobbyAdmissionPolicy.participantTypeOf(request),
				...(externalId !== undefined && { externalId }),
				...(metadata !== undefined && { metadata }),
				roomName
			},
			this.lobbyAdmissionPolicy.principalOf(request)
		);

		if (!knock) throw errorLobbyFull(roomId);

		this.logger.verbose(`Participant '${participantIdentity}' asked to join room '${roomId}' and waits`);
		this.webhookDispatcherService.sendParticipantKnockedWebhook({
			roomId,
			roomName,
			participant: toParticipant(knock.entry)
		});

		if (knock.replaced) {
			this.tell(roomId, [knock.replaced], MeetLobbyStatus.LEFT, MeetEventOrigin.PARTICIPANT);
		}

		this.afterChange(roomId, knock.line);
		return { lobbyTicket, participantIdentity };
	}

	/** The wait of a ticket, also for a while after it ended; null when unknown. */
	findWait(lobbyTicket: string): Promise<LobbyWait | null> {
		return this.lobbyStateService.findWait(this.waitIdOf(lobbyTicket));
	}

	/**
	 * Uses the admission of a wait, right before its join token is issued. The entry keeps counting as a
	 * taken place until the participant joins. Answers the entry, or the status of a wait no longer admitted.
	 */
	async consume(wait: LobbyWait): Promise<LobbyTicketChange> {
		const change = await this.lobbyStateService.consume(wait.waitId);

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
	async returnToLine(wait: LobbyWait): Promise<LobbyReturnResult> {
		const change = await this.lobbyStateService.returnToLine(wait.waitId);

		if ('entry' in change) {
			this.logger.verbose(
				`Participant '${change.entry.participantIdentity}' found the meeting of room '${wait.roomId}' full and is back in line`
			);
			this.tell(wait.roomId, [change.entry], MeetLobbyStatus.WAITING, MeetEventOrigin.SYSTEM);
			this.afterChange(wait.roomId, change.line);
		}

		return change;
	}

	/** Ends a wait at its participant's request. A ticket of another room, unknown or ended, changes nothing. */
	async leave(roomId: string, lobbyTicket: string): Promise<void> {
		const wait = await this.findWait(lobbyTicket);

		if (wait?.roomId !== roomId || wait.ended) return;

		await this.endWaits(roomId, MeetLobbyStatus.LEFT, MeetEventOrigin.PARTICIPANT, [wait.waitId]);
	}

	/**
	 * The participants waiting in a room, in arrival order, and the free places of its meeting. With the
	 * waiting room off the list is empty.
	 *
	 * @throws The `404` room not found error
	 */
	async list(roomId: string): Promise<MeetLobbyList> {
		const config = await this.configOf(roomId);
		const [entries, capacity] = await Promise.all([
			this.lobbyStateService.entries(roomId),
			this.capacityOf(roomId, config)
		]);
		const admitted = entries.filter(({ status }) => status === MeetLobbyStatus.ADMITTED).length;
		const waiting = config.lobby.enabled
			? entries.filter(({ status }) => status === MeetLobbyStatus.WAITING).sort(byArrival)
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
	 * @throws The `404` error naming the first participant that no longer waits, the `409` error when the
	 * named participants outnumber the free places, or the `404` room not found error
	 */
	admit(roomId: string, participantIdentities?: string[]): Promise<MeetLobbyParticipant[]> {
		return this.decide(roomId, 'admit', participantIdentities);
	}

	/**
	 * Rejects the named waiting participants, all of them or none, or, with none named, everyone waiting.
	 * Answers the participants rejected.
	 *
	 * @throws The `404` error naming the first participant that no longer waits, or the `404` room not found error
	 */
	reject(roomId: string, participantIdentities?: string[]): Promise<MeetLobbyParticipant[]> {
		return this.decide(roomId, 'reject', participantIdentities);
	}

	/**
	 * Ends waits of a room with an outcome: the given ones, or every one, admissions already used included,
	 * when none are given. Answers the waits ended and told.
	 */
	async endWaits(
		roomId: string,
		outcome: MeetLobbyStatus,
		origin: MeetEventOrigin,
		waitIds?: string[]
	): Promise<LobbyEntry[]> {
		const result = await this.lobbyStateService.end(roomId, outcome, { waitIds });
		this.afterEnd(roomId, result, outcome, origin);
		return result.ended;
	}

	/** Ends every wait of a room whose meeting was ended on purpose; a wait started afterwards goes on. */
	async endMeeting(roomId: string, origin: MeetEventOrigin): Promise<void> {
		await this.endWaits(roomId, MeetLobbyStatus.MEETING_ENDED, origin);
	}

	/** Ends every wait of a room that was closed or deleted. */
	async closeRoom(roomId: string): Promise<void> {
		await this.endWaits(roomId, MeetLobbyStatus.ROOM_CLOSED, MeetEventOrigin.MODERATOR);
	}

	/** Lets everyone waiting in a room whose waiting room was turned off: each one joins as any participant. */
	async letEveryoneIn(roomId: string): Promise<void> {
		await this.endWaits(roomId, MeetLobbyStatus.ADMITTED, MeetEventOrigin.MODERATOR);
	}

	/**
	 * Ends as expired the given waits of a room still unseen for too long when the script runs: a waiting
	 * participant whose client is out of touch, or an admission not used by joining. A used admission is
	 * removed silently, since its participant holds a token.
	 */
	async expire(roomId: string, waitIds: string[]): Promise<void> {
		const result = await this.lobbyStateService.end(roomId, MeetLobbyStatus.EXPIRED, {
			waitIds,
			includeUsed: true,
			unseenFor: ms(INTERNAL_CONFIG.LOBBY_UNSEEN_TIMEOUT)
		});
		this.afterEnd(roomId, result, MeetLobbyStatus.EXPIRED, MeetEventOrigin.SYSTEM);
	}

	/**
	 * Releases the place an admitted participant held, now that LiveKit reports them in the meeting. Never
	 * fails: an unreleased place is released by the sweep a minute after the admission.
	 */
	async joined(roomId: string, participantIdentity: string): Promise<void> {
		try {
			const entry = await this.lobbyStateService.joined(roomId, participantIdentity);

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

	protected waitIdOf(lobbyTicket: string): string {
		return createHash('sha256').update(lobbyTicket).digest('hex');
	}

	protected async decide(
		roomId: string,
		decision: LobbyDecision,
		participantIdentities?: string[]
	): Promise<MeetLobbyParticipant[]> {
		const config = await this.configOf(roomId);

		if (!config.lobby.enabled) {
			if (participantIdentities) throw errorLobbyParticipantNotWaiting(participantIdentities[0], roomId);

			return [];
		}

		const capacity = decision === 'admit' ? await this.capacityOf(roomId, config) : null;
		const result = await this.lobbyStateService.decide(roomId, decision, participantIdentities, capacity);

		if ('notWaiting' in result) throw errorLobbyParticipantNotWaiting(result.notWaiting, roomId);

		if ('noPlaces' in result) throw errorLobbyNoFreePlaces(roomId, participantIdentities?.length ?? 0);

		const status = decision === 'admit' ? MeetLobbyStatus.ADMITTED : MeetLobbyStatus.REJECTED;

		if (result.decided.length > 0) {
			this.logger.verbose(`Participants ${status} in room '${roomId}': ${identitiesOf(result.decided)}`);
			this.tell(roomId, result.decided, status, MeetEventOrigin.MODERATOR);
			this.afterChange(roomId, result.line);
		}

		return result.decided.map(toParticipant);
	}

	protected afterEnd(
		roomId: string,
		{ ended, silent, line }: LobbyEndResult,
		outcome: MeetLobbyStatus,
		origin: MeetEventOrigin
	): void {
		if (ended.length + silent.length === 0) return;

		this.logger.verbose(
			`Waits ended as ${outcome} in room '${roomId}': ${identitiesOf([...ended, ...silent])}${silent.length > 0 ? ` (${silent.length} already joining)` : ''}`
		);
		this.tell(roomId, ended, outcome, origin);
		this.afterChange(roomId, line);
	}

	/** Reports a new status of these waits to the webhooks and, unless it is `waiting`, to each waiter. */
	protected tell(roomId: string, entries: LobbyEntry[], status: MeetLobbyStatus, origin: MeetEventOrigin): void {
		for (const entry of entries) {
			if (status !== MeetLobbyStatus.WAITING) {
				this.sendState(roomId, entry.waitId, { status });
			}

			this.webhookDispatcherService.sendLobbyStatusChangedWebhook({
				roomId,
				roomName: entry.roomName,
				participant: toParticipant(entry),
				status,
				origin
			});
		}
	}

	/** Tells each waiter whose place changed their new place, and the meeting that the list changed. */
	protected afterChange(roomId: string, { now, from, waiting }: LobbyLine): void {
		waiting.forEach(([waitId, knockDate], index) =>
			this.sendState(roomId, waitId, {
				status: MeetLobbyStatus.WAITING,
				queuePosition: from + index,
				waitedSeconds: Math.floor((now - knockDate) / 1000)
			})
		);
		this.signalAdmitters(roomId);
	}

	protected sendState(roomId: string, waitId: string, state: MeetLobbyState): void {
		this.webSocketService
			.send(roomId, waitId, MEET_LOBBY_STATE_MESSAGE, state)
			.catch((error: unknown) =>
				this.logger.warn(`Could not send a waiting room state in room '${roomId}'`, error)
			);
	}

	protected signalAdmitters(roomId: string): void {
		void this.frontendEventService.sendLobbyUpdatedSignal(roomId);
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
