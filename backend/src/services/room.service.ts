import { uid as secureUid } from 'uid/secure';
import { inject, injectable } from '../config/dependency-injector.config.js';
import { CreateOptions, Room, SendDataOptions } from 'livekit-server-sdk';
import { LoggerService } from './logger.service.js';
import { LiveKitService } from './livekit.service.js';
import { MeetStorageService } from './storage/storage.service.js';
import { MeetRoom, MeetRoomFilters, MeetRoomOptions, MeetRoomPreferences, ParticipantRole } from '@typings-ce';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { SystemEventService } from './system-event.service.js';
import { IScheduledTask, TaskSchedulerService } from './task-scheduler.service.js';
import { errorInvalidRoomSecret, internalError } from '../models/error.model.js';
import { OpenViduComponentsAdapterHelper } from '../helpers/index.js';
import { uid } from 'uid/single';
import { MEET_NAME_ID } from '../environment.js';
import { UtilsHelper } from '../helpers/utils.helper.js';
import INTERNAL_CONFIG from '../config/internal-config.js';

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
		@inject(MeetStorageService) protected storageService: MeetStorageService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(SystemEventService) protected systemEventService: SystemEventService,
		@inject(TaskSchedulerService) protected taskSchedulerService: TaskSchedulerService
	) {
		const roomGarbageCollectorTask: IScheduledTask = {
			name: 'roomGarbageCollector',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.ROOM_GC_INTERVAL,
			callback: this.deleteExpiredRooms.bind(this)
		};
		this.taskSchedulerService.registerTask(roomGarbageCollectorTask);
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
		const { preferences, autoDeletionDate, roomIdPrefix } = roomOptions;
		const roomId = roomIdPrefix ? `${roomIdPrefix}-${uid(15)}` : uid(15);

		const meetRoom: MeetRoom = {
			roomId,
			roomIdPrefix,
			creationDate: Date.now(),
			// maxParticipants,
			autoDeletionDate,
			preferences,
			moderatorRoomUrl: `${baseUrl}/room/${roomId}?secret=${secureUid(10)}`,
			publisherRoomUrl: `${baseUrl}/room/${roomId}?secret=${secureUid(10)}`
		};

		await this.storageService.saveMeetRoom(meetRoom);

		return meetRoom;
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
			})
			//TODO: Uncomment this when bug in LiveKit is fixed
			// When it is defined, the room will be closed although there are participants
			// emptyTimeout: ms('20s') / 1000,
			// !FIXME: When this is defined, the room will be closed although there are participants
			// departureTimeout: ms('20s') / 1000
			// maxParticipants: maxParticipants || undefined,
		};

		const room = await this.livekitService.createRoom(livekitRoomOptions);
		this.logger.verbose(`Room ${roomId} created in LiveKit.`);
		return room;
	}

	/**
	 * Updates the preferences of a specific meeting room.
	 *
	 * @param roomId - The unique identifier of the meeting room to update
	 * @param preferences - The new preferences to apply to the meeting room
	 * @returns A Promise that resolves to the updated MeetRoom object
	 */
	async updateMeetRoomPreferences(roomId: string, preferences: MeetRoomPreferences): Promise<MeetRoom> {
		const room = await this.getMeetRoom(roomId);
		room.preferences = preferences;

		return await this.storageService.saveMeetRoom(room);
	}

	/**
	 * Retrieves a list of rooms.
	 * @returns A Promise that resolves to an array of {@link MeetRoom} objects.
	 * @throws If there was an error retrieving the rooms.
	 */
	async getAllMeetRooms({ maxItems, nextPageToken, fields }: MeetRoomFilters): Promise<{
		rooms: MeetRoom[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		const response = await this.storageService.getMeetRooms(maxItems, nextPageToken);

		const filteredRooms = response.rooms.map((room) => UtilsHelper.filterObjectFields(room, fields));
		response.rooms = filteredRooms as MeetRoom[];

		return response;
	}

	/**
	 * Retrieves an OpenVidu room by its name.
	 *
	 * @param roomId - The name of the room to retrieve.
	 * @returns A promise that resolves to an {@link MeetRoom} object.
	 */
	async getMeetRoom(roomId: string, fields?: string): Promise<MeetRoom> {
		const meetRoom = await this.storageService.getMeetRoom(roomId);

		return UtilsHelper.filterObjectFields(meetRoom, fields) as MeetRoom;
	}

	/**
	 * Deletes multiple rooms in bulk, with the option to force delete or gracefully handle rooms with active participants.
	 * For rooms with participants, when `forceDelete` is false, the method performs a "graceful deletion"
	 * by marking the room as deleted without disrupting active sessions.
	 *
	 * @param roomIds - Array of room identifiers to be deleted
	 * @param forceDelete - If true, deletes rooms even if they have active participants.
	 *                      If false, rooms with participants will be marked for deletion instead of being deleted immediately.
	 */
	async bulkDeleteRooms(
		roomIds: string[],
		forceDelete: boolean
	): Promise<{ deleted: string[]; markedAsDeleted: string[] }> {
		try {
			const results = await Promise.allSettled(
				roomIds.map(async (roomId) => {
					const hasParticipants = await this.livekitService.roomHasParticipants(roomId);
					const shouldDelete = forceDelete || !hasParticipants;

					if (shouldDelete) {
						this.logger.verbose(`Deleting room ${roomId}.`);

						await Promise.all([
							this.storageService.deleteMeetRooms([roomId]),
							this.livekitService.deleteRoom(roomId)
						]);

						return { roomId, status: 'deleted' } as const;
					}

					this.logger.verbose(`Room ${roomId} has participants. Marking as deleted (graceful deletion).`);
					await this.markRoomAsDeleted(roomId);
					return { roomId, status: 'marked' } as const;
				})
			);

			const deleted: string[] = [];
			const markedAsDeleted: string[] = [];

			results.forEach((result) => {
				if (result.status === 'fulfilled') {
					if (result.value.status === 'deleted') {
						deleted.push(result.value.roomId);
					} else if (result.value.status === 'marked') {
						markedAsDeleted.push(result.value.roomId);
					}
				} else {
					this.logger.error(`Failed to process deletion for a room: ${result.reason}`);
				}
			});

			if (deleted.length === 0 && markedAsDeleted.length === 0) {
				this.logger.error('No rooms were deleted or marked as deleted.');
				throw internalError('No rooms were deleted or marked as deleted.');
			}

			return { deleted, markedAsDeleted };
		} catch (error) {
			this.logger.error('Error deleting rooms:', error);
			throw error;
		}
	}

	/**
	 * Marks a room as deleted in the storage system.
	 *
	 * @param roomId - The unique identifier of the room to mark for deletion
	 * @returns A promise that resolves when the room has been successfully marked as deleted
	 * @throws May throw an error if the room cannot be found or if saving fails
	 */
	protected async markRoomAsDeleted(roomId: string): Promise<void> {
		const room = await this.storageService.getMeetRoom(roomId);
		room.markedForDeletion = true;
		await this.storageService.saveMeetRoom(room);
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
	async getRoomRoleBySecret(roomId: string, secret: string): Promise<ParticipantRole> {
		const room = await this.getMeetRoom(roomId);
		const { moderatorSecret, publisherSecret } = MeetRoomHelper.extractSecretsFromRoom(room);

		switch (secret) {
			case moderatorSecret:
				return ParticipantRole.MODERATOR;
			case publisherSecret:
				return ParticipantRole.PUBLISHER;
			default:
				throw errorInvalidRoomSecret(roomId, secret);
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
	 * Gracefully deletes expired rooms.
	 *
	 * This method checks for rooms that have an auto-deletion date in the past and deletes them.
	 * It also marks rooms as deleted if they have participants.
	 */
	protected async deleteExpiredRooms(): Promise<void> {
		let nextPageToken: string | undefined;
		const deletedRooms: string[] = [];
		const markedAsDeletedRooms: string[] = [];
		this.logger.verbose(`Checking expired rooms at ${new Date(Date.now()).toISOString()}`);

		try {
			do {
				const now = Date.now();

				const { rooms, nextPageToken: token } = await this.getAllMeetRooms({ maxItems: 100, nextPageToken });
				nextPageToken = token;

				const expiredRoomIds = rooms
					.filter((room) => room.autoDeletionDate && room.autoDeletionDate < now)
					.map((room) => room.roomId);

				if (expiredRoomIds.length > 0) {
					this.logger.verbose(
						`Trying to delete ${expiredRoomIds.length} expired Meet rooms: ${expiredRoomIds.join(', ')}`
					);

					const { deleted, markedAsDeleted } = await this.bulkDeleteRooms(expiredRoomIds, false);

					deletedRooms.push(...deleted);
					markedAsDeletedRooms.push(...markedAsDeleted);
				}
			} while (nextPageToken);

			if (deletedRooms.length > 0) {
				this.logger.verbose(`Successfully deleted ${deletedRooms.length} expired rooms`);
			}

			if (markedAsDeletedRooms.length > 0) {
				this.logger.verbose(`Marked as deleted ${markedAsDeletedRooms.length} expired rooms`);
			}
		} catch (error) {
			this.logger.error('Error deleting expired rooms:', error);
		}
	}
}
