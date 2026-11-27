import { DisconnectReason } from '@livekit/protocol';
import type { Room, TextStreamReader } from '@livekit/rtc-node';
import { MEET_CHAT_SAVER_IDENTITY, MeetChatStreamAttribute, participantTypeOf } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { AccessToken, RoomConfiguration } from 'livekit-server-sdk';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import { MeetParticipantHelper } from '../helpers/participant.helper.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { ChatMessageRepository } from '../repositories/chat-message.repository.js';
import { FrontendEventService } from './frontend-event.service.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';

const CHAT_TOPIC = 'chat';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A meeting this replica saves the chat of: the connection and what every message it stores shares. */
interface SaverConnection {
	room: Room;
	roomId: string;
	meetingId: string;
	meetingStartDate: number;
}

interface BindingRoomInternals {
	onFfiEvent: (...args: unknown[]) => void;
	ffiHandle?: { dispose(): void };
}

interface BindingGlobal {
	_ffiClientInstance?: { removeListener(event: string, listener: (...args: unknown[]) => void): unknown };
}

/**
 * Stores the chat of the meetings that save it. For each one, one replica holds a hidden, subscribe-only
 * participant (the chat saver) that receives the chat text streams a browser sends it, stores each message
 * and confirms it to its sender.
 */
@injectable()
export class ChatSaverService {
	protected readonly connections = new Map<string, SaverConnection>();
	/** The rooms with an ensureSaver running, and whether another trigger arrived meanwhile. */
	protected readonly opening = new Map<string, boolean>();

	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(ChatMessageRepository) protected chatMessageRepository: ChatMessageRepository
	) {}

	/**
	 * Joins the meeting of a room as its chat saver when the meeting saves its chat and neither this
	 * replica nor another one has a saver in it. A trigger that arrives while one for the same room runs
	 * checks the room again once that one ends. A failure is logged, never thrown: the meeting goes on
	 * unsaved until the next trigger.
	 *
	 * @param roomId - The ID of the room, which is the name of its LiveKit room
	 * @param roomMetadata - The metadata of the LiveKit room when the caller already has it, read from LiveKit otherwise
	 */
	async ensureSaver(roomId: string, roomMetadata?: string): Promise<void> {
		if (this.opening.has(roomId)) {
			this.opening.set(roomId, true);
			return;
		}

		this.opening.set(roomId, false);

		try {
			await this.joinIfNeeded(roomId, roomMetadata);
		} catch (error) {
			this.logger.error(`The chat saver could not join the meeting of room '${roomId}'`, error);
		} finally {
			const triggeredAgain = this.opening.get(roomId);
			this.opening.delete(roomId);

			if (triggeredAgain) void this.ensureSaver(roomId);
		}
	}

	/**
	 * Leaves every meeting this replica saves, so that LiveKit reports each departure at once and another
	 * replica takes them over.
	 */
	async leaveAll(): Promise<void> {
		await Promise.all([...this.connections.keys()].map((roomId) => this.leave(roomId)));
	}

	/**
	 * Leaves the meeting of a room, if this replica saves it.
	 *
	 * @param roomId - The ID of the room
	 * @param meetingId - The meeting to leave; the one this replica saves, whichever it is, when omitted
	 */
	async leave(roomId: string, meetingId?: string): Promise<void> {
		const connection = this.connections.get(roomId);

		if (!connection || (meetingId && connection.meetingId !== meetingId)) return;

		this.connections.delete(roomId);

		try {
			await connection.room.disconnect();
		} catch (error) {
			this.logger.warn(`Error disconnecting the chat saver of room '${roomId}'`, error);
		}
	}

	/**
	 * The meeting saves its chat when its LiveKit room is Meet's and the config in its metadata, the one
	 * the meeting started with, says so.
	 */
	protected savesChat(roomMetadata?: string): boolean {
		return (
			MeetRoomHelper.checkIfMeetingBelogsToOpenViduMeet(roomMetadata) &&
			MeetRoomHelper.metadataSavesChat(roomMetadata)
		);
	}

	protected async joinIfNeeded(roomId: string, roomMetadata?: string): Promise<void> {
		const metadata = roomMetadata || (await this.livekitService.findRoom(roomId))?.metadata;

		if (!this.savesChat(metadata)) return;

		if (await this.livekitService.findParticipant(roomId, MEET_CHAT_SAVER_IDENTITY)) return;

		if (this.connections.has(roomId)) {
			this.logger.warn(`LiveKit no longer lists the chat saver of room '${roomId}'. Replacing its connection`);
			await this.leave(roomId);
		}

		await this.join(roomId);
	}

	protected async join(roomId: string): Promise<void> {
		const room = await this.createRoom();
		room.once('disconnected', () => this.releaseBindingRoom(room));

		try {
			await room.connect(MEET_ENV.LIVEKIT_URL_PRIVATE, await this.createToken(roomId), {
				autoSubscribe: false,
				dynacast: false,
				dataStream: { maxPayloadByteLength: INTERNAL_CONFIG.CHAT_SAVER_MAX_STREAM_BYTES }
			});
			const meetingId = await room.getSid();

			if (!this.savesChat(room.metadata)) {
				this.logger.info(`The chat saver found no meeting of Meet that saves its chat in room '${roomId}'`);
				await room.disconnect();
				return;
			}

			const connection: SaverConnection = {
				room,
				roomId,
				meetingId,
				meetingStartDate:
					MeetRoomHelper.extractMeetingStartDateFromMetadata(room.metadata) ?? room.creationTime.getTime()
			};
			this.connections.set(roomId, connection);
			room.registerTextStreamHandler(CHAT_TOPIC, (reader, { identity }) => {
				this.saveMessage(connection, reader, identity).catch((error: unknown) =>
					this.logger.error(`Error saving a chat message of room '${roomId}'`, error)
				);
			});
			room.on('roomSidChanged', (sid) => void this.leaveIfMeetingChanged(connection, sid));
			room.on('disconnected', (reason) => this.forget(connection, reason));
			this.logger.info(`The chat saver joined the meeting '${meetingId}' of room '${roomId}'`);
		} catch (error) {
			await room.disconnect().catch(() => this.releaseBindingRoom(room));
			throw error;
		}
	}

	/**
	 * The `Room` of the native binding, loaded when a meeting first needs it.
	 */
	protected async createRoom(): Promise<Room> {
		const { Room } = await import('@livekit/rtc-node');
		return new Room();
	}

	/**
	 * Hidden and subscribe-only, as an egress is, but of the `agent` kind, so the room is not reported as
	 * recording. Its room configuration only applies when its join creates the LiveKit room, which closes
	 * by itself a second later, and marks that room as not being a meeting of Meet.
	 */
	protected createToken(roomId: string): Promise<string> {
		const token = new AccessToken(MEET_ENV.LIVEKIT_API_KEY, MEET_ENV.LIVEKIT_API_SECRET, {
			identity: MEET_CHAT_SAVER_IDENTITY,
			attributes: { ...MeetParticipantHelper.CHAT_SAVER_ATTRIBUTES }
		});
		token.kind = 'agent';
		token.addGrant({
			roomJoin: true,
			room: roomId,
			hidden: true,
			agent: true,
			canSubscribe: true,
			canPublish: false,
			canPublishData: false
		});
		token.roomConfig = new RoomConfiguration({
			metadata: MeetRoomHelper.CHAT_SAVER_ROOM_METADATA,
			emptyTimeout: 1
		});
		return token.toJwt();
	}

	/**
	 * A reconnection that lands in the room of another meeting: the saver leaves it and the meetings
	 * that need one are checked again.
	 */
	protected async leaveIfMeetingChanged({ roomId, meetingId }: SaverConnection, sid: string): Promise<void> {
		if (!sid || sid === meetingId) return;

		this.logger.info(`The chat saver of room '${roomId}' reconnected to another meeting. Leaving it`);
		await this.leave(roomId, meetingId);
		await this.ensureSaver(roomId);
	}

	protected forget({ room, roomId }: SaverConnection, reason: number): void {
		if (this.connections.get(roomId)?.room === room) {
			this.connections.delete(roomId);
		}

		this.logger.debug(`The chat saver left room '${roomId}': ${DisconnectReason[reason]}`);
	}

	/**
	 * `@livekit/rtc-node` 1.2.3 releases a room only in `disconnect()`, which does nothing once the server
	 * has disconnected it: the room would stay subscribed to every event of the binding and keep its
	 * native handle for as long as the process lives.
	 */
	protected releaseBindingRoom(room: Room): void {
		const { onFfiEvent, ffiHandle } = room as unknown as BindingRoomInternals;
		(globalThis as BindingGlobal)._ffiClientInstance?.removeListener('ffi_event', onFfiEvent);
		room.removeAllListeners();
		ffiHandle?.dispose();
	}

	/**
	 * Stores the message a text stream carries and confirms it to its sender. A message is left
	 * unconfirmed, for its sender to send again, when its stream does not end in time or in error, it
	 * carries no valid message id, its sender is unknown or the write fails. One whose text is
	 * refused is confirmed without being stored, so it does not hold the sender's next ones back.
	 */
	protected async saveMessage(
		{ room, roomId, meetingId, meetingStartDate }: SaverConnection,
		reader: TextStreamReader,
		senderIdentity: string
	): Promise<void> {
		const text = await this.readText(reader);
		const messageId = reader.info.attributes?.[MeetChatStreamAttribute.MESSAGE_ID];

		if (text === undefined || !messageId || !UUID_PATTERN.test(messageId)) {
			this.logger.debug(`Dropped a chat stream of '${senderIdentity}' in room '${roomId}': unreadable or no id`);
			return;
		}

		if (!text.trim() || text.length > INTERNAL_CONFIG.CHAT_MESSAGE_MAX_LENGTH) {
			await this.frontendEventService.sendChatMessageSavedSignal(roomId, senderIdentity, messageId);
			return;
		}

		const sender = room.remoteParticipants.get(senderIdentity);
		const senderMetadata = sender && MeetParticipantHelper.parseMeetingMetadata(sender);

		if (!sender || !senderMetadata) {
			this.logger.debug(`Dropped a chat message of unknown sender '${senderIdentity}' in room '${roomId}'`);
			return;
		}

		try {
			await this.chatMessageRepository.save({
				roomId,
				meetingId,
				meetingStartDate,
				messageId,
				channel: 'all',
				text,
				participant: {
					identity: senderIdentity,
					...(sender.name && { name: sender.name }),
					type: participantTypeOf(senderMetadata)
				}
			});
		} catch {
			return;
		}

		await this.frontendEventService.sendChatMessageSavedSignal(roomId, senderIdentity, messageId);
	}

	/**
	 * Reads a text stream to its end.
	 *
	 * @returns The text, or undefined when the stream ended in error (a message over the size the saver
	 * reads, a disconnection) or had not ended in time
	 */
	protected async readText(reader: TextStreamReader): Promise<string | undefined> {
		const timeout = Promise.withResolvers<undefined>();
		const timer = setTimeout(timeout.resolve, ms(INTERNAL_CONFIG.CHAT_SAVER_STREAM_TIMEOUT));

		const text = await Promise.race([reader.readAll().catch(() => undefined), timeout.promise]);
		clearTimeout(timer);

		if (text === undefined) {
			await reader.close();
		}

		return text;
	}
}
