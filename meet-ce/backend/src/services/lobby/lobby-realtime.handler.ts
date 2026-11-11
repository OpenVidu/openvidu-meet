import type { MeetLobbyState, MeetRoom } from '@openvidu-meet/typings';
import { MEET_LOBBY_STATE_MESSAGE, MeetEventOrigin, MeetLobbyStatus, MeetRoomStatus } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { WebSocketAddress, WebSocketConnection, WebSocketFeature } from '../../models/websocket.model.js';
import { RoomRepository } from '../../repositories/room.repository.js';
import { LoggerService } from '../logger.service.js';
import { WebSocketService } from '../websocket.service.js';
import { LobbyStateService } from './lobby-state.service.js';
import { LobbyService } from './lobby.service.js';

type LobbyRoom = Pick<MeetRoom, 'status' | 'config'>;
type LobbyRoomFields = Pick<MeetLobbyState, 'meetingActive' | 'message'>;

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
export class LobbyRealtimeHandler implements WebSocketFeature {
	readonly credential = 'lobbyTicket';
	protected readonly roomFieldsSent = new WeakMap<WebSocketConnection, LobbyRoomFields>();

	constructor(
		@inject(WebSocketService) webSocketService: WebSocketService,
		@inject(LobbyService) protected lobbyService: LobbyService,
		@inject(LobbyStateService) protected lobbyStateService: LobbyStateService,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(LoggerService) protected logger: LoggerService
	) {
		webSocketService.register(this);
	}

	async resolve(lobbyTicket: string): Promise<WebSocketAddress | null> {
		const wait = await this.lobbyService.findWait(lobbyTicket);
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
		const presence = await this.lobbyStateService.presence(waitId);

		if (!presence) return;

		const { status, queuePosition, waitedSeconds } = presence;
		let state: MeetLobbyState =
			status === MeetLobbyStatus.WAITING ? { status, queuePosition, waitedSeconds } : { status };
		const room = await this.readRoom(roomId);
		const outcome = room === undefined ? undefined : this.reconciliationOf(room);

		if (outcome && (status === MeetLobbyStatus.WAITING || status === MeetLobbyStatus.ADMITTED)) {
			const ended = await this.lobbyService.endWaits(roomId, outcome, MeetEventOrigin.SYSTEM, [waitId]);

			if (ended.length > 0) {
				this.logger.warn(
					`Room '${roomId}' was ${outcome === MeetLobbyStatus.ROOM_CLOSED ? 'closed or deleted' : 'switched to no waiting room'} without ending the wait of participant '${ended[0].participantIdentity}': ended it as ${outcome}`
				);
				state = { status: outcome };
			}
		}

		connection.send(MEET_LOBBY_STATE_MESSAGE, { ...state, ...this.roomFieldsOf(connection, room) });
	}

	/** The room, null when it was deleted, undefined when it could not be read. */
	protected async readRoom(roomId: string): Promise<LobbyRoom | null | undefined> {
		try {
			return await this.roomRepository.findByRoomId(roomId, ['status', 'config']);
		} catch (error) {
			this.logger.debug(`Could not read room '${roomId}' for the state of a waiting participant`, error);
			return undefined;
		}
	}

	protected reconciliationOf(room: LobbyRoom | null): MeetLobbyStatus | undefined {
		if (!room || room.status === MeetRoomStatus.CLOSED) return MeetLobbyStatus.ROOM_CLOSED;

		if (!room.config.lobby.enabled) return MeetLobbyStatus.ADMITTED;

		return undefined;
	}

	protected roomFieldsOf(connection: WebSocketConnection, room: LobbyRoom | null | undefined): LobbyRoomFields {
		if (room === undefined) return this.roomFieldsSent.get(connection) ?? {};

		const message = room?.config.lobby.message;
		const fields: LobbyRoomFields = {
			meetingActive: room?.status === MeetRoomStatus.ACTIVE_MEETING,
			...(message && { message })
		};
		this.roomFieldsSent.set(connection, fields);
		return fields;
	}
}
