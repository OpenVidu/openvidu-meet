import { uid as secureUid } from 'uid/secure';
import { inject, injectable } from '../config/dependency-injector.config.js';
import { CreateOptions, Room, SendDataOptions } from 'livekit-server-sdk';
import { LoggerService } from './logger.service.js';
import { LiveKitService } from './livekit.service.js';
import { GlobalPreferencesService } from './preferences/global-preferences.service.js';
import { MeetRoom, MeetRoomOptions, ParticipantRole } from '@typings-ce';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { SystemEventService } from './system-event.service.js';
import { TaskSchedulerService } from './task-scheduler.service.js';
import { errorParticipantUnauthorized } from '../models/error.model.js';
import { OpenViduComponentsAdapterHelper } from '../helpers/index.js';
import { uid } from 'uid/single';
import { MEET_NAME_ID } from '../environment.js';
import ms from 'ms';

/**
 * Service for managing OpenVidu Meet rooms.
 *
 * This service provides methods to create, list, retrieve, delete, and send signals to OpenVidu rooms.
 * It uses the LiveKitService to interact with the underlying LiveKit rooms.
 */
@injectable()
export class RoomService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(GlobalPreferencesService) protected globalPrefService: GlobalPreferencesService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(SystemEventService) protected systemEventService: SystemEventService,
		@inject(TaskSchedulerService) protected taskSchedulerService: TaskSchedulerService
	) {}

	/**
	 * Initializes the room service.
	 *
	 * This method sets up the room garbage collector and event listeners.
	 */
	async initialize(): Promise<void> {
		this.systemEventService.onRedisReady(async () => {
			// try {
			// 	await this.deleteOpenViduExpiredRooms();
			// } catch (error) {
			// 	this.logger.error('Error deleting OpenVidu expired rooms:', error);
			// }
			// await Promise.all([
			// 	//TODO: Livekit rooms should not be created here. They should be created when a user joins a room.
			// 	this.restoreMissingLivekitRooms().catch((error) =>
			// 		this.logger.error('Error restoring missing rooms:', error)
			// 	),
			// 	this.taskSchedulerService.startRoomGarbageCollector(this.deleteExpiredRooms.bind(this))
			// ]);
		});
	}

	/**
	 * Creates an OpenVidu Meet room with the specified options.
	 *
	 * @param {string} baseUrl - The base URL for the room.
	 * @param {MeetRoomOptions} options - The options for creating the OpenVidu room.
	 * @returns {Promise<MeetRoom>} A promise that resolves to the created OpenVidu room.
	 *
	 * @throws {Error} If the room creation fails.
	 *
	 */
	async createMeetRoom(baseUrl: string, roomOptions: MeetRoomOptions): Promise<MeetRoom> {
		const { preferences, expirationDate, roomIdPrefix } = roomOptions;
		const roomId = roomIdPrefix ? `${roomIdPrefix}-${uid(15)}` : uid(15);

		const openviduRoom: MeetRoom = {
			roomId,
			roomIdPrefix,
			creationDate: Date.now(),
			// maxParticipants,
			expirationDate,
			preferences,
			moderatorRoomUrl: `${baseUrl}/room/${roomId}?secret=${secureUid(10)}`,
			publisherRoomUrl: `${baseUrl}/room/${roomId}?secret=${secureUid(10)}`
		};

		await this.globalPrefService.saveOpenViduRoom(openviduRoom);

		return openviduRoom;
	}

	/**
	 * Creates a LiveKit room for the specified Meet Room.
	 *
	 * This method creates a LiveKit room with the specified room name and metadata.
	 * The metadata includes the room options from the Meet Room.
	 **/
	async createLivekitRoom(roomId: string): Promise<Room> {
		const roomExists = await this.livekitService.roomExists(roomId);

		if (roomExists) {
			this.logger.verbose(`Room ${roomId} already exists in LiveKit.`);
			return this.livekitService.getRoom(roomId);
		}

		const meetRoom: MeetRoom = await this.getMeetRoom(roomId);
		const livekitRoomOptions: CreateOptions = {
			name: roomId,
			metadata: JSON.stringify({
				createdBy: MEET_NAME_ID,
				roomOptions: MeetRoomHelper.toOpenViduOptions(meetRoom)
			}),
			emptyTimeout: ms('20s'),
			departureTimeout: ms('20s')
			// maxParticipants: maxParticipants || undefined,
		};

		const room = await this.livekitService.createRoom(livekitRoomOptions);
		this.logger.verbose(`Room ${roomId} created in LiveKit.`);
		return room;
	}

	/**
	 * Retrieves a list of rooms.
	 * @returns A Promise that resolves to an array of {@link MeetRoom} objects.
	 * @throws If there was an error retrieving the rooms.
	 */
	async listOpenViduRooms(): Promise<MeetRoom[]> {
		return await this.globalPrefService.getOpenViduRooms();
	}

	/**
	 * Retrieves an OpenVidu room by its name.
	 *
	 * @param roomId - The name of the room to retrieve.
	 * @returns A promise that resolves to an {@link MeetRoom} object.
	 */
	async getMeetRoom(roomId: string): Promise<MeetRoom> {
		return await this.globalPrefService.getOpenViduRoom(roomId);
	}

	/**
	 * Deletes OpenVidu and LiveKit rooms.
	 *
	 * This method deletes rooms from both LiveKit and OpenVidu services.
	 *
	 * @param roomIds - An array of room names to be deleted.
	 * @returns A promise that resolves with an array of successfully deleted room names.
	 */
	async deleteRooms(roomIds: string[]): Promise<string[]> {
		const [openViduResults, livekitResults] = await Promise.all([
			this.deleteOpenViduRooms(roomIds),
			Promise.allSettled(roomIds.map((roomId) => this.livekitService.deleteRoom(roomId)))
		]);

		// Log errors from LiveKit deletions
		livekitResults.forEach((result, index) => {
			if (result.status === 'rejected') {
				this.logger.error(`Failed to delete LiveKit room "${roomIds[index]}": ${result.reason}`);
			}
		});

		// Combine successful deletions
		const successfullyDeleted = new Set(openViduResults);

		livekitResults.forEach((result, index) => {
			if (result.status === 'fulfilled') {
				successfullyDeleted.add(roomIds[index]);
			}
		});

		return Array.from(successfullyDeleted);
	}

	/**
	 * Deletes OpenVidu rooms.
	 *
	 * @param roomIds - List of room names to delete.
	 * @returns A promise that resolves with an array of successfully deleted room names.
	 */
	async deleteOpenViduRooms(roomIds: string[]): Promise<string[]> {
		const results = await Promise.allSettled(
			roomIds.map((roomId) => this.globalPrefService.deleteOpenViduRoom(roomId))
		);

		const successfulRooms: string[] = [];

		results.forEach((result, index) => {
			if (result.status === 'fulfilled') {
				successfulRooms.push(roomIds[index]);
			} else {
				this.logger.error(`Failed to delete OpenVidu room "${roomIds[index]}": ${result.reason}`);
			}
		});

		if (successfulRooms.length === roomIds.length) {
			this.logger.verbose('All OpenVidu rooms have been deleted.');
		}

		return successfulRooms;
	}

	/**
	 * Validates a secret against a room's moderator and publisher secrets and returns the corresponding role.
	 *
	 * @param roomId - The unique identifier of the room to check
	 * @param secret - The secret to validate against the room's moderator and publisher secrets
	 * @returns A promise that resolves to the participant role (MODERATOR or PUBLISHER) if the secret is valid
	 * @throws Error if the moderator or publisher secrets cannot be extracted from their URLs
	 * @throws Error if the provided secret doesn't match any of the room's secrets (unauthorized)
	 */
	async getRoomSecretRole(roomId: string, secret: string): Promise<ParticipantRole> {
		const room = await this.getMeetRoom(roomId);
		const { moderatorRoomUrl, publisherRoomUrl } = room;

		const extractSecret = (urlString: string, type: string): string => {
			const url = new URL(urlString);
			const secret = url.searchParams.get('secret');

			if (!secret) throw new Error(`${type} secret not found`);

			return secret;
		};

		const publisherSecret = extractSecret(publisherRoomUrl, 'Publisher');
		const moderatorSecret = extractSecret(moderatorRoomUrl, 'Moderator');

		switch (secret) {
			case moderatorSecret:
				return ParticipantRole.MODERATOR;
			case publisherSecret:
				return ParticipantRole.PUBLISHER;
			default:
				throw errorParticipantUnauthorized(roomId);
		}
	}

	async sendRoomStatusSignalToOpenViduComponents(roomId: string, participantSid: string) {
		// Check if recording is started in the room
		const activeEgressArray = await this.livekitService.getActiveEgress(roomId);
		const isRecordingStarted = activeEgressArray.length > 0;

		// Skip if recording is not started
		if (!isRecordingStarted) {
			return;
		}

		// Construct the payload and signal options
		const { payload, options } = OpenViduComponentsAdapterHelper.generateRoomStatusSignal(
			isRecordingStarted,
			participantSid
		);

		await this.sendSignal(roomId, payload, options);
	}

	/**
	 * Sends a signal to participants in a specified room.
	 *
	 * @param roomId - The name of the room where the signal will be sent.
	 * @param rawData - The raw data to be sent as the signal.
	 * @param options - Options for sending the data, including the topic and destination identities.
	 * @returns A promise that resolves when the signal has been sent.
	 */
	async sendSignal(roomId: string, rawData: Record<string, unknown>, options: SendDataOptions): Promise<void> {
		this.logger.verbose(`Notifying participants in room ${roomId}: "${options.topic}".`);
		this.livekitService.sendData(roomId, rawData, options);
	}

	/**
	 * Deletes OpenVidu expired rooms and consequently LiveKit rooms.
	 *
	 * This method delete the rooms that have an expiration date earlier than the current time.
	 *
	 * @returns {Promise<void>} A promise that resolves when the deletion process is complete.
	 **/
	protected async deleteExpiredRooms(): Promise<void> {
		try {
			const ovExpiredRooms = await this.deleteOpenViduExpiredRooms();

			if (ovExpiredRooms.length === 0) {
				this.logger.verbose('No expired rooms found to delete.');
				return;
			}

			const livekitResults = await Promise.allSettled(
				ovExpiredRooms.map((roomId) => this.livekitService.deleteRoom(roomId))
			);

			const successfulRooms: string[] = [];

			livekitResults.forEach((result, index) => {
				if (result.status === 'fulfilled') {
					successfulRooms.push(ovExpiredRooms[index]);
				} else {
					this.logger.error(`Failed to delete OpenVidu room "${ovExpiredRooms[index]}": ${result.reason}`);
				}
			});

			this.logger.verbose(
				`Successfully deleted ${successfulRooms.length} expired rooms: ${successfulRooms.join(', ')}`
			);
		} catch (error) {
			this.logger.error('Error deleting expired rooms:', error);
		}
	}

	/**
	 * Deletes expired OpenVidu rooms.
	 *
	 * This method checks for rooms that have an expiration date earlier than the current time
	 * and attempts to delete them.
	 *
	 * @returns {Promise<void>} A promise that resolves when the operation is complete.
	 */
	protected async deleteOpenViduExpiredRooms(): Promise<string[]> {
		const now = Date.now();
		this.logger.verbose(`Checking OpenVidu expired rooms at ${new Date(now).toISOString()}`);
		const rooms = await this.listOpenViduRooms();
		const expiredRooms = rooms
			.filter((room) => room.expirationDate && room.expirationDate < now)
			.map((room) => room.roomId);

		if (expiredRooms.length === 0) {
			this.logger.verbose('No OpenVidu expired rooms to delete.');
			return [];
		}

		this.logger.info(`Deleting ${expiredRooms.length} OpenVidu expired rooms: ${expiredRooms.join(', ')}`);

		return await this.deleteOpenViduRooms(expiredRooms);
	}

	/**
	 * Restores missing Livekit rooms by comparing the list of rooms from Livekit and OpenVidu.
	 * If any rooms are missing in Livekit, they will be created.
	 *
	 * @returns {Promise<void>} A promise that resolves when the restoration process is complete.
	 *
	 * @protected
	 */
	protected async restoreMissingLivekitRooms(): Promise<void> {
		this.logger.verbose(`Checking missing Livekit rooms ...`);

		const [lkResult, ovResult] = await Promise.allSettled([
			this.livekitService.listRooms(),
			this.listOpenViduRooms()
		]);

		let lkRooms: Room[] = [];
		let ovRooms: MeetRoom[] = [];

		if (lkResult.status === 'fulfilled') {
			lkRooms = lkResult.value;
		} else {
			this.logger.error('Failed to list Livekit rooms:', lkResult.reason);
		}

		if (ovResult.status === 'fulfilled') {
			ovRooms = ovResult.value;
		} else {
			this.logger.error('Failed to list OpenVidu rooms:', ovResult.reason);
		}

		const missingRooms: MeetRoom[] = ovRooms.filter(
			(ovRoom) => !lkRooms.some((room) => room.name === ovRoom.roomId)
		);

		if (missingRooms.length === 0) {
			this.logger.verbose('All OpenVidu rooms are present in Livekit. No missing rooms to restore. ');
			return;
		}

		this.logger.info(`Restoring ${missingRooms.length} missing rooms`);

		const creationResults = await Promise.allSettled(
			missingRooms.map(({ roomId }: MeetRoom) => {
				this.logger.debug(`Restoring room: ${roomId}`);
				this.createLivekitRoom(roomId);
			})
		);

		creationResults.forEach((result, index) => {
			if (result.status === 'rejected') {
				this.logger.error(`Failed to restore room "${missingRooms[index].roomId}": ${result.reason}`);
			} else {
				this.logger.info(`Restored room "${missingRooms[index].roomId}"`);
			}
		});
	}
}
