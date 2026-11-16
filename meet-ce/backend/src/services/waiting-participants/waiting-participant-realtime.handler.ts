import type { MeetWaitingParticipantState, MeetRoom } from '@openvidu-meet/typings';
import {
	MEET_WAITING_PARTICIPANT_STATE_MESSAGE,
	MeetEventOrigin,
	MeetWaitingParticipantReason,
	MeetWaitingParticipantStatus,
	MeetRoomStatus
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { WebSocketAddress, WebSocketConnection, WebSocketFeature } from '../../models/websocket.model.js';
import { RoomRepository } from '../../repositories/room.repository.js';
import { LoggerService } from '../logger.service.js';
import { WebSocketService } from '../websocket.service.js';
import { WaitingParticipantStateService } from './waiting-participant-state.service.js';
import { WaitingParticipantService } from './waiting-participant.service.js';

type LockedRoom = Pick<MeetRoom, 'status' | 'access'>;
type LockedRoomFields = Pick<MeetWaitingParticipantState, 'meetingActive' | 'message'>;

/**
 * The WebSocket connection of a waiting participant, opened with their ticket and addressed by their
 * wait. Each time it opens and each time its client answers a ping, the wait is marked as seen and its
 * state is sent straight to it, so a lost message is made good within one ping cycle.
 *
 * The room read that builds the state also ends a wait whose room was closed, deleted or unlocked without
 * its waits being ended (a replica stopped between the write and the script).
 * When the room cannot be read, nothing is ended and the room fields last sent on the connection are
 * sent again.
 */
@injectable()
export class WaitingParticipantRealtimeHandler implements WebSocketFeature {
	readonly credential = 'waitingTicket';
	protected readonly roomFieldsSent = new WeakMap<WebSocketConnection, LockedRoomFields>();

	constructor(
		@inject(WebSocketService) webSocketService: WebSocketService,
		@inject(WaitingParticipantService) protected waitingParticipantService: WaitingParticipantService,
		@inject(WaitingParticipantStateService)
		protected waitingParticipantStateService: WaitingParticipantStateService,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(LoggerService) protected logger: LoggerService
	) {
		webSocketService.register(this);
	}

	async resolve(waitingTicket: string): Promise<WebSocketAddress | null> {
		const wait = await this.waitingParticipantService.findWait(waitingTicket);
		return wait && { roomId: wait.roomId, address: wait.waitId };
	}

	onOpen(connection: WebSocketConnection): Promise<void> {
		return this.sendState(connection);
	}

	onPong(connection: WebSocketConnection): Promise<void> {
		return this.sendState(connection);
	}

	protected async sendState(connection: WebSocketConnection): Promise<void> {
		const { roomId, address: waitId } = connection;
		const presence = await this.waitingParticipantStateService.presence(waitId);

		if (!presence) return;

		const { status, waitedSeconds } = presence;
		let state: MeetWaitingParticipantState =
			status === MeetWaitingParticipantStatus.WAITING ? { status, waitedSeconds } : { status };
		const room = await this.readRoom(roomId);
		const outcome = room === undefined ? undefined : this.reconciliationOf(room);

		if (
			outcome &&
			(status === MeetWaitingParticipantStatus.WAITING || status === MeetWaitingParticipantStatus.ADMITTED)
		) {
			const ended = await this.waitingParticipantService.endWaits(
				roomId,
				outcome,
				MeetEventOrigin.SYSTEM,
				[waitId],
				outcome === MeetWaitingParticipantStatus.ADMITTED
					? MeetWaitingParticipantReason.ROOM_UNLOCKED
					: undefined
			);

			if (ended.length > 0) {
				this.logger.warn(
					`Room '${roomId}' was ${outcome === MeetWaitingParticipantStatus.ROOM_CLOSED ? 'closed or deleted' : 'unlocked'} without ending the wait of participant '${ended[0].participantIdentity}': ended it as ${outcome}`
				);
				state = { status: outcome, origin: MeetEventOrigin.SYSTEM };
			}
		}

		connection.send(MEET_WAITING_PARTICIPANT_STATE_MESSAGE, { ...state, ...this.roomFieldsOf(connection, room) });
	}

	/** The room, null when it was deleted, undefined when it could not be read. */
	protected async readRoom(roomId: string): Promise<LockedRoom | null | undefined> {
		try {
			return await this.roomRepository.findByRoomId(roomId, ['status', 'access']);
		} catch (error) {
			this.logger.debug(`Could not read room '${roomId}' for the state of a waiting participant`, error);
			return undefined;
		}
	}

	protected reconciliationOf(room: LockedRoom | null): MeetWaitingParticipantStatus | undefined {
		if (!room || room.status === MeetRoomStatus.CLOSED) return MeetWaitingParticipantStatus.ROOM_CLOSED;

		if (!room.access.lock.enabled) return MeetWaitingParticipantStatus.ADMITTED;

		return undefined;
	}

	protected roomFieldsOf(connection: WebSocketConnection, room: LockedRoom | null | undefined): LockedRoomFields {
		if (room === undefined) return this.roomFieldsSent.get(connection) ?? {};

		const message = room?.access.lock.message;
		const fields: LockedRoomFields = {
			meetingActive: room?.status === MeetRoomStatus.ACTIVE_MEETING,
			...(message && { message })
		};
		this.roomFieldsSent.set(connection, fields);
		return fields;
	}
}
