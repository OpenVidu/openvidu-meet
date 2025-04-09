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
import { errorParticipantUnauthorized, internalError } from '../models/error.model.js';
import { OpenViduComponentsAdapterHelper } from '../helpers/index.js';
import { uid } from 'uid/single';
import { MEET_NAME_ID, MEET_ROOM_GC_INTERVAL } from '../environment.js';
import ms from 'ms';
import { UtilsHelper } from '../helpers/utils.helper.js';

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
			scheduleOrDelay: MEET_ROOM_GC_INTERVAL,
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

		if (fields && fields.length > 0) {
			const fieldsArray = Array.isArray(fields) ? fields : fields.split(',').map((f) => f.trim());
			const filteredRooms = response.rooms.map((room) =>
				UtilsHelper.filterObjectFields(room as unknown as Record<string, unknown>, fieldsArray)
			);
			response.rooms = filteredRooms as MeetRoom[];
		}

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

		if (fields && fields.length > 0) {
			const fieldsArray = Array.isArray(fields) ? fields : fields.split(',').map((f) => f.trim());
			const filteredRoom = UtilsHelper.filterObjectFields(
				meetRoom as unknown as Record<string, unknown>,
				fieldsArray
			);
			return filteredRoom as MeetRoom;
		}

		return meetRoom;
	}

	/**
	 * Deletes a room by its ID.
	 *
	 * @param roomId - The unique identifier of the room to delete.
	 * @param forceDelete - Whether to force delete the room even if it has participants.
	 * @returns A promise that resolves to an object containing the deleted and marked rooms.
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
					// Mark room as deleted
					const room = await this.storageService.getMeetRoom(roomId);
					room.markedForDeletion = true;
					await this.storageService.saveMeetRoom(room);
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
			const ovExpiredRooms = await this.deleteExpiredMeetRooms();

			if (ovExpiredRooms.length === 0) return;

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
	 * Deletes expired Meet rooms by iterating through all paged results.
	 *
	 * @returns A promise that resolves with an array of room IDs that were successfully deleted.
	 */
	protected async deleteExpiredMeetRooms(): Promise<string[]> {
		const now = Date.now();
		this.logger.verbose(`Checking Meet expired rooms at ${new Date(now).toISOString()}`);
		let nextPageToken: string | undefined;
		const deletedRooms: string[] = [];

		do {
			const { rooms, nextPageToken: token } = await this.getAllMeetRooms({ maxItems: 100, nextPageToken });
			nextPageToken = token;

			const expiredRoomIds = rooms
				.filter((room) => room.autoDeletionDate && room.autoDeletionDate < now)
				.map((room) => room.roomId);

			if (expiredRoomIds.length > 0) {
				this.logger.verbose(
					`Deleting ${expiredRoomIds.length} expired Meet rooms: ${expiredRoomIds.join(', ')}`
				);
				// const deletedOnPage = await this.deleteMeetRooms(expiredRooms);
				await this.storageService.deleteMeetRooms(expiredRoomIds);
				deletedRooms.push(...expiredRoomIds);
			}
		} while (nextPageToken);

		return deletedRooms;
	}
}
