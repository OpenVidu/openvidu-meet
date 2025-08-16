import {
	MeetRecordingAccess,
	MeetRoom,
	MeetRoomFilters,
	MeetRoomOptions,
	MeetRoomPreferences,
	ParticipantRole,
	RecordingPermissions
} from '@typings-ce';
import { inject, injectable } from 'inversify';
import { CreateOptions, Room } from 'livekit-server-sdk';
import ms from 'ms';
import { uid as secureUid } from 'uid/secure';
import { uid } from 'uid/single';
import INTERNAL_CONFIG from '../config/internal-config.js';
import { MEET_NAME_ID } from '../environment.js';
import { MeetRoomHelper, UtilsHelper } from '../helpers/index.js';
import {
	errorInvalidRoomSecret,
	errorRoomMetadataNotFound,
	errorRoomNotFound,
	internalError
} from '../models/error.model.js';
import {
	DistributedEventService,
	IScheduledTask,
	LiveKitService,
	LoggerService,
	MeetStorageService,
	TaskSchedulerService,
	TokenService,
	FrontendEventService
} from './index.js';
import { validateRecordingTokenMetadata } from '../middlewares/index.js';

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
		@inject(DistributedEventService) protected distributedEventService: DistributedEventService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(TaskSchedulerService) protected taskSchedulerService: TaskSchedulerService,
		@inject(TokenService) protected tokenService: TokenService
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
		const { roomName, autoDeletionDate, preferences } = roomOptions;
		const roomIdPrefix = roomName!.replace(/\s+/g, ''); // Remove all spaces
		const roomId = `${roomIdPrefix}-${uid(15)}`; // Generate a unique room ID based on the room name

		const meetRoom: MeetRoom = {
			roomId,
			roomName: roomName!,
			creationDate: Date.now(),
			// maxParticipants,
			autoDeletionDate,
			preferences,
			moderatorRoomUrl: `${baseUrl}/room/${roomId}?secret=${secureUid(10)}`,
			speakerRoomUrl: `${baseUrl}/room/${roomId}?secret=${secureUid(10)}`
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
		const { MEETING_DEPARTURE_TIMEOUT, MEETING_EMPTY_TIMEOUT } = INTERNAL_CONFIG;
		const livekitRoomOptions: CreateOptions = {
			name: roomId,
			metadata: JSON.stringify({
				createdBy: MEET_NAME_ID,
				roomOptions: MeetRoomHelper.toOpenViduOptions(meetRoom)
			}),
			emptyTimeout: MEETING_EMPTY_TIMEOUT ? ms(MEETING_EMPTY_TIMEOUT) / 1000 : undefined,
			departureTimeout: MEETING_DEPARTURE_TIMEOUT ? ms(MEETING_DEPARTURE_TIMEOUT) / 1000 : undefined
			// maxParticipants: maxParticipants || undefined,
		};

		const room = await this.livekitService.createRoom(livekitRoomOptions);
		this.logger.verbose(`Room ${roomId} created in LiveKit with options: ${JSON.stringify(livekitRoomOptions)}.`);
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

		await this.storageService.saveMeetRoom(room);
		// Update the archived room metadata if it exists
		await Promise.all([
			this.storageService.archiveRoomMetadata(roomId, true),
			this.frontendEventService.sendRoomPreferencesUpdatedSignal(roomId, room)
		]);
		return room;
	}

	/**
	 * Checks if a meeting room with the specified name exists
	 *
	 * @param roomName - The name of the meeting room to check
	 * @returns A Promise that resolves to true if the room exists, false otherwise
	 */
	async meetRoomExists(roomName: string): Promise<boolean> {
		try {
			const meetRoom = await this.getMeetRoom(roomName);

			if (meetRoom) return true;

			return false;
		} catch (err: unknown) {
			return false;
		}
	}

	/**
	 * Retrieves a list of rooms.
	 * @returns A Promise that resolves to an array of {@link MeetRoom} objects.
	 * @throws If there was an error retrieving the rooms.
	 */
	async getAllMeetRooms(filters: MeetRoomFilters): Promise<{
		rooms: MeetRoom[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		const { maxItems, nextPageToken, roomName, fields } = filters;
		const response = await this.storageService.getMeetRooms(roomName, maxItems, nextPageToken);

		if (fields) {
			const filteredRooms = response.rooms.map((room: MeetRoom) => UtilsHelper.filterObjectFields(room, fields));
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
	async getMeetRoom(roomId: string, fields?: string, participantRole?: ParticipantRole): Promise<MeetRoom> {
		const meetRoom = await this.storageService.getMeetRoom(roomId);

		if (!meetRoom) {
			this.logger.error(`Meet room with ID ${roomId} not found.`);
			throw errorRoomNotFound(roomId);
		}

		const filteredRoom = UtilsHelper.filterObjectFields(meetRoom, fields);

		// Remove moderatorRoomUrl if the participant is a speaker to prevent access to moderator links
		if (participantRole === ParticipantRole.SPEAKER) {
			delete filteredRoom.moderatorRoomUrl;
		}

		return filteredRoom as MeetRoom;
	}

	/**
	 * Deletes multiple rooms in bulk, with the option to force delete or gracefully handle rooms with active participants.
	 * For rooms with participants, when `forceDelete` is false, the method performs a "graceful deletion"
	 * by marking the room for deletion without disrupting active sessions.
	 * However, if `forceDelete` is true, it will also end the meetings by removing the rooms from LiveKit.
	 *
	 * @param roomIds - Array of room identifiers to be deleted
	 * @param forceDelete - If true, deletes rooms even if they have active participants.
	 *                      If false, rooms with participants will be marked for deletion instead of being deleted immediately.
	 */
	async bulkDeleteRooms(
		roomIds: string[],
		forceDelete: boolean
	): Promise<{ deleted: string[]; markedForDeletion: string[] }> {
		try {
			this.logger.info(`Starting bulk deletion of ${roomIds.length} rooms (forceDelete: ${forceDelete})`);

			// Classify rooms into those to delete and those to mark for deletion
			const { toDelete, toMark } = await this.classifyRoomsForDeletion(roomIds, forceDelete);

			// Process each group in parallel
			const [deletedRooms, markedRooms] = await Promise.all([
				this.batchDeleteRooms(toDelete),
				this.batchMarkRoomsForDeletion(toMark)
			]);

			this.logger.info(
				`Bulk deletion completed: ${deletedRooms.length} deleted, ${markedRooms.length} marked for deletion`
			);

			return {
				deleted: deletedRooms,
				markedForDeletion: markedRooms
			};
		} catch (error) {
			this.logger.error('Error deleting rooms:', error);
			throw error;
		}
	}

	/**
	 * Validates a secret against a room's moderator and speaker secrets and returns the corresponding role.
	 *
	 * @param roomId - The unique identifier of the room to check
	 * @param secret - The secret to validate against the room's moderator and speaker secrets
	 * @returns A promise that resolves to the participant role (MODERATOR or SPEAKER) if the secret is valid
	 * @throws Error if the moderator or speaker secrets cannot be extracted from their URLs
	 * @throws Error if the provided secret doesn't match any of the room's secrets (unauthorized)
	 */
	async getRoomRoleBySecret(roomId: string, secret: string): Promise<ParticipantRole> {
		const room = await this.getMeetRoom(roomId);
		return this.getRoomRoleBySecretFromRoom(room, secret);
	}

	getRoomRoleBySecretFromRoom(room: MeetRoom, secret: string): ParticipantRole {
		const { moderatorSecret, speakerSecret } = MeetRoomHelper.extractSecretsFromRoom(room);

		switch (secret) {
			case moderatorSecret:
				return ParticipantRole.MODERATOR;
			case speakerSecret:
				return ParticipantRole.SPEAKER;
			default:
				throw errorInvalidRoomSecret(room.roomId, secret);
		}
	}

	/**
	 * Generates a token with recording permissions for a specific room.
	 *
	 * @param roomId - The unique identifier of the room for which the recording token is being generated.
	 * @param secret - The secret associated with the room, used to determine the user's role.
	 * @returns A promise that resolves to the generated recording token as a string.
	 * @throws An error if the room with the given `roomId` is not found.
	 */
	async generateRecordingToken(roomId: string, secret: string): Promise<string> {
		const room = await this.storageService.getArchivedRoomMetadata(roomId);

		if (!room) {
			// If the room is not found, it means that there are no recordings for that room or the room doesn't exist
			throw errorRoomMetadataNotFound(roomId);
		}

		const role = this.getRoomRoleBySecretFromRoom(room as MeetRoom, secret);
		const permissions = this.getRecordingPermissions(room, role);
		return await this.tokenService.generateRecordingToken(roomId, role, permissions);
	}

	protected getRecordingPermissions(room: Partial<MeetRoom>, role: ParticipantRole): RecordingPermissions {
		const recordingAccess = room.preferences!.recordingPreferences.allowAccessTo;

		// A participant can delete recordings if they are a moderator and the recording access is not set to admin
		const canDeleteRecordings = role === ParticipantRole.MODERATOR && recordingAccess !== MeetRecordingAccess.ADMIN;

		/* A participant can retrieve recordings if
			- they can delete recordings
			- they are a speaker and the recording access includes speakers
		*/
		const canRetrieveRecordings =
			canDeleteRecordings ||
			(role === ParticipantRole.SPEAKER && recordingAccess === MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER);

		return {
			canRetrieveRecordings,
			canDeleteRecordings
		};
	}

	parseRecordingTokenMetadata(metadata: string) {
		try {
			const parsedMetadata = JSON.parse(metadata);
			return validateRecordingTokenMetadata(parsedMetadata);
		} catch (error) {
			this.logger.error('Failed to parse recording token metadata:', error);
			throw new Error('Invalid recording token metadata format');
		}
	}

	/**
	 * Classifies rooms into those that should be deleted immediately vs marked for deletion
	 */
	protected async classifyRoomsForDeletion(
		roomIds: string[],
		forceDelete: boolean
	): Promise<{ toDelete: string[]; toMark: string[] }> {
		this.logger.debug(`Classifying ${roomIds.length} rooms for deletion strategy`);

		// Check all rooms in parallel
		const classificationResults = await Promise.allSettled(
			roomIds.map(async (roomId) => {
				try {
					const activeMeeting = await this.livekitService.roomExists(roomId);
					const shouldDelete = forceDelete || !activeMeeting;

					return {
						roomId,
						action: shouldDelete ? 'delete' : 'mark'
					} as const;
				} catch (error) {
					this.logger.warn(`Failed to check participants for room ${roomId}: ${error}`);
					// Default to marking for deletion if we can't check participants
					return {
						roomId,
						action: 'mark'
					} as const;
				}
			})
		);

		// Group results
		const toDelete: string[] = [];
		const toMark: string[] = [];

		classificationResults.forEach((result, index) => {
			if (result.status === 'fulfilled') {
				if (result.value.action === 'delete') {
					toDelete.push(result.value.roomId);
				} else {
					toMark.push(result.value.roomId);
				}
			} else {
				this.logger.warn(`Failed to classify room ${roomIds[index]}: ${result.reason}`);
				// Default to marking for deletion
				toMark.push(roomIds[index]);
			}
		});

		this.logger.debug(`Classification complete: ${toDelete.length} to delete, ${toMark.length} to mark`);
		return { toDelete, toMark };
	}

	/**
	 * Performs batch deletion of rooms that can be deleted immediately
	 */
	protected async batchDeleteRooms(roomIds: string[]): Promise<string[]> {
		if (roomIds.length === 0) {
			return [];
		}

		this.logger.info(`Batch deleting ${roomIds.length} rooms`);

		try {
			// Check which rooms have an active LiveKit room (active meeting)
			const activeRoomChecks = await Promise.all(
				roomIds.map(async (roomId) => ({
					roomId,
					activeMeeting: await this.livekitService.roomExists(roomId)
				}))
			);

			const withActiveMeeting = activeRoomChecks.filter((r) => r.activeMeeting).map((r) => r.roomId);
			const withoutActiveMeeting = activeRoomChecks.filter((r) => !r.activeMeeting).map((r) => r.roomId);

			// Mark all rooms with active meetings for deletion (in batch)
			// This must be done before deleting the LiveKit rooms to ensure
			// the rooms are marked when 'room_finished' webhook is sent
			if (withActiveMeeting.length > 0) {
				await this.batchMarkRoomsForDeletion(withActiveMeeting);
			}

			// Delete all LiveKit rooms for rooms with active meetings (in batch)
			const livekitDeletePromise =
				withActiveMeeting.length > 0
					? this.livekitService.batchDeleteRooms(withActiveMeeting)
					: Promise.resolve();

			// Delete Meet rooms that do not have an active meeting (in batch)
			const meetRoomsDeletePromise =
				withoutActiveMeeting.length > 0
					? this.storageService.deleteMeetRooms(withoutActiveMeeting)
					: Promise.resolve();

			await Promise.all([livekitDeletePromise, meetRoomsDeletePromise]);
			return roomIds;
		} catch (error) {
			this.logger.error(`Batch deletion failed for rooms: ${roomIds.join(', ')}`, error);
			throw internalError('Failed to delete rooms');
		}
	}

	/**
	 * Marks multiple rooms for deletion in batch
	 */
	private async batchMarkRoomsForDeletion(roomIds: string[]): Promise<string[]> {
		if (roomIds.length === 0) {
			return [];
		}

		this.logger.info(`Batch marking ${roomIds.length} rooms for deletion`);

		try {
			// Get all rooms in parallel
			const roomResults = await Promise.allSettled(
				roomIds.map((roomId) => this.storageService.getMeetRoom(roomId))
			);

			// Prepare rooms for batch update
			const roomsToUpdate: { roomId: string; room: MeetRoom }[] = [];
			const successfulRoomIds: string[] = [];

			roomResults.forEach((result, index) => {
				const roomId = roomIds[index];

				if (result.status === 'fulfilled' && result.value) {
					const room = result.value;
					room.markedForDeletion = true;
					roomsToUpdate.push({ roomId, room });
					successfulRoomIds.push(roomId);
				} else {
					this.logger.warn(
						`Failed to get room ${roomId} for marking: ${result.status === 'rejected' ? result.reason : 'Room not found'}`
					);
				}
			});

			// Batch save all updated rooms
			if (roomsToUpdate.length > 0) {
				await Promise.allSettled(roomsToUpdate.map(({ room }) => this.storageService.saveMeetRoom(room)));
			}

			this.logger.info(`Successfully marked ${successfulRoomIds.length} rooms for deletion`);
			return successfulRoomIds;
		} catch (error) {
			this.logger.error(`Batch marking failed for rooms: ${roomIds.join(', ')}`, error);
			throw internalError('Failed to mark rooms for deletion');
		}
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
		const markedForDeletionRooms: string[] = [];
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

					const { deleted, markedForDeletion } = await this.bulkDeleteRooms(expiredRoomIds, false);

					deletedRooms.push(...deleted);
					markedForDeletionRooms.push(...markedForDeletion);
				}
			} while (nextPageToken);

			if (deletedRooms.length > 0) {
				this.logger.verbose(`Successfully deleted ${deletedRooms.length} expired rooms`);
			}

			if (markedForDeletionRooms.length > 0) {
				this.logger.verbose(`Marked for deletion ${markedForDeletionRooms.length} expired rooms`);
			}
		} catch (error) {
			this.logger.error('Error deleting expired rooms:', error);
		}
	}
}
