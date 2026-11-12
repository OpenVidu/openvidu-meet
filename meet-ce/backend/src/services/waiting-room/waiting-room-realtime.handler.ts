import type { MeetWaitingRoomState, MeetRoom } from '@openvidu-meet/typings';
import {
	MEET_WAITING_ROOM_STATE_MESSAGE,
	MeetEventOrigin,
	MeetWaitingRoomStatus,
	MeetRoomStatus
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { WebSocketAddress, WebSocketConnection, WebSocketFeature } from '../../models/websocket.model.js';
import { RoomRepository } from '../../repositories/room.repository.js';
import { LoggerService } from '../logger.service.js';
import { WebSocketService } from '../websocket.service.js';
import { WaitingRoomStateService } from './waiting-room-state.service.js';
import { WaitingRoomService } from './waiting-room.service.js';

type WaitingRoomRoom = Pick<MeetRoom, 'status' | 'config'>;
type WaitingRoomRoomFields = Pick<MeetWaitingRoomState, 'meetingActive' | 'message'>;

/**
 * The WebSocket connection of a waiting participant, opened with their ticket and addressed by their
 * wait. Each time it opens and each time its client answers a ping, the wait is marked as seen and its
 * state is sent straight to it, so a lost message is made good within one ping cycle.
 *
 * The room read that builds the state also ends a wait whose room was closed, deleted or had its waiting
 * room turned off without its waits being ended (a replica stopped between the write and the script).
 * When the room cannot be read, nothing is ended and the room fields last sent on the connection are
 * sent again.
 */
@injectable()
export class WaitingRoomRealtimeHandler implements WebSocketFeature {
	readonly credential = 'waitingRoomTicket';
	protected readonly roomFieldsSent = new WeakMap<WebSocketConnection, WaitingRoomRoomFields>();

	constructor(
		@inject(WebSocketService) webSocketService: WebSocketService,
		@inject(WaitingRoomService) protected waitingRoomService: WaitingRoomService,
		@inject(WaitingRoomStateService) protected waitingRoomStateService: WaitingRoomStateService,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(LoggerService) protected logger: LoggerService
	) {
		webSocketService.register(this);
	}

	async resolve(waitingRoomTicket: string): Promise<WebSocketAddress | null> {
		const wait = await this.waitingRoomService.findWait(waitingRoomTicket);
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
		const presence = await this.waitingRoomStateService.presence(waitId);

		if (!presence) return;

		const { status, queuePosition, waitedSeconds } = presence;
		let state: MeetWaitingRoomState =
			status === MeetWaitingRoomStatus.WAITING ? { status, queuePosition, waitedSeconds } : { status };
		const room = await this.readRoom(roomId);
		const outcome = room === undefined ? undefined : this.reconciliationOf(room);

		if (outcome && (status === MeetWaitingRoomStatus.WAITING || status === MeetWaitingRoomStatus.ADMITTED)) {
			const ended = await this.waitingRoomService.endWaits(roomId, outcome, MeetEventOrigin.SYSTEM, [waitId]);

			if (ended.length > 0) {
				this.logger.warn(
					`Room '${roomId}' was ${outcome === MeetWaitingRoomStatus.ROOM_CLOSED ? 'closed or deleted' : 'switched to no waiting room'} without ending the wait of participant '${ended[0].participantIdentity}': ended it as ${outcome}`
				);
				state = { status: outcome, origin: MeetEventOrigin.SYSTEM };
			}
		}

		connection.send(MEET_WAITING_ROOM_STATE_MESSAGE, { ...state, ...this.roomFieldsOf(connection, room) });
	}

	/** The room, null when it was deleted, undefined when it could not be read. */
	protected async readRoom(roomId: string): Promise<WaitingRoomRoom | null | undefined> {
		try {
			return await this.roomRepository.findByRoomId(roomId, ['status', 'config']);
		} catch (error) {
			this.logger.debug(`Could not read room '${roomId}' for the state of a waiting participant`, error);
			return undefined;
		}
	}

	protected reconciliationOf(room: WaitingRoomRoom | null): MeetWaitingRoomStatus | undefined {
		if (!room || room.status === MeetRoomStatus.CLOSED) return MeetWaitingRoomStatus.ROOM_CLOSED;

		if (!room.config.waitingRoom.enabled) return MeetWaitingRoomStatus.ADMITTED;

		return undefined;
	}

	protected roomFieldsOf(
		connection: WebSocketConnection,
		room: WaitingRoomRoom | null | undefined
	): WaitingRoomRoomFields {
		if (room === undefined) return this.roomFieldsSent.get(connection) ?? {};

		const message = room?.config.waitingRoom.message;
		const fields: WaitingRoomRoomFields = {
			meetingActive: room?.status === MeetRoomStatus.ACTIVE_MEETING,
			...(message && { message })
		};
		this.roomFieldsSent.set(connection, fields);
		return fields;
	}
}
