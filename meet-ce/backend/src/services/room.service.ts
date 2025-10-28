import {
	MeetingEndAction,
	MeetRecordingAccess,
	MeetRoom,
	MeetRoomConfig,
	MeetRoomDeletionErrorCode,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomDeletionSuccessCode,
	MeetRoomFilters,
	MeetRoomOptions,
	MeetRoomStatus,
	ParticipantRole,
	RecordingPermissions
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { CreateOptions, Room } from 'livekit-server-sdk';
import ms from 'ms';
import { uid as secureUid } from 'uid/secure';
import { uid } from 'uid/single';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_NAME_ID } from '../environment.js';
import { MeetRoomHelper, UtilsHelper } from '../helpers/index.js';
import { validateRecordingTokenMetadata } from '../middlewares/index.js';
import {
	errorDeletingRoom,
	errorInvalidRoomSecret,
	errorRoomMetadataNotFound,
	errorRoomNotFound,
	internalError,
	OpenViduMeetError
} from '../models/error.model.js';
import { RoomRepository } from '../repositories/index.js';
import {
	DistributedEventService,
	FrontendEventService,
	IScheduledTask,
	LiveKitService,
	LoggerService,
	MeetStorageService,
	RecordingService,
	TaskSchedulerService,
	TokenService
} from './index.js';

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
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(RecordingService) protected recordingService: RecordingService,
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
	 * @param {MeetRoomOptions} options - The options for creating the OpenVidu room.
	 * @returns {Promise<MeetRoom>} A promise that resolves to the created OpenVidu room.
	 *
	 * @throws {Error} If the room creation fails.
	 *
	 */
	async createMeetRoom(roomOptions: MeetRoomOptions): Promise<MeetRoom> {
		const { roomName, autoDeletionDate, autoDeletionPolicy, config } = roomOptions;
		const roomIdPrefix = roomName!.replace(/\s+/g, ''); // Remove all spaces
		const roomId = `${roomIdPrefix}-${uid(15)}`; // Generate a unique room ID based on the room name

		const meetRoom: MeetRoom = {
			roomId,
			roomName: roomName!,
			creationDate: Date.now(),
			// maxParticipants,
			autoDeletionDate,
			autoDeletionPolicy,
			config: config!,
			moderatorUrl: `/room/${roomId}?secret=${secureUid(10)}`,
			speakerUrl: `/room/${roomId}?secret=${secureUid(10)}`,
			status: MeetRoomStatus.OPEN,
			meetingEndAction: MeetingEndAction.NONE
		};
		return await this.roomRepository.create(meetRoom);
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
	 * Updates the config of a specific meeting room.
	 *
	 * @param roomId - The unique identifier of the meeting room to update
	 * @param config - The new config to apply to the meeting room
	 * @returns A Promise that resolves to the updated MeetRoom object
	 */
	async updateMeetRoomConfig(roomId: string, config: MeetRoomConfig): Promise<MeetRoom> {
		const room = await this.getMeetRoom(roomId);
		room.config = config;

		await this.roomRepository.update(room);
		// Update the archived room metadata if it exists
		await Promise.all([
			this.storageService.archiveRoomMetadata(roomId, true),
			this.frontendEventService.sendRoomConfigUpdatedSignal(roomId, room)
		]);
		return room;
	}

	/**
	 * Updates the status of a specific meeting room.
	 *
	 * @param roomId - The unique identifier of the meeting room to update
	 * @param status - The new status to apply to the meeting room
	 * @returns A Promise that resolves to an object containing the updated room
	 * and a boolean indicating if the update was immediate or scheduled
	 */
	async updateMeetRoomStatus(roomId: string, status: MeetRoomStatus): Promise<{ room: MeetRoom; updated: boolean }> {
		const room = await this.getMeetRoom(roomId);
		let updated = true;

		// If closing the room while a meeting is active, mark it to be closed when the meeting ends
		if (status === MeetRoomStatus.CLOSED && room.status === MeetRoomStatus.ACTIVE_MEETING) {
			room.meetingEndAction = MeetingEndAction.CLOSE;
			updated = false;
		} else {
			room.status = status;
			room.meetingEndAction = MeetingEndAction.NONE;
		}

		await this.roomRepository.update(room);
		return { room, updated };
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
		const { fields, ...findOptions } = filters;
		const response = await this.roomRepository.find({
			...findOptions
		});

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
		const meetRoom = await this.roomRepository.findByRoomId(roomId);

		if (!meetRoom) {
			this.logger.error(`Meet room with ID ${roomId} not found.`);
			throw errorRoomNotFound(roomId);
		}

		const filteredRoom = UtilsHelper.filterObjectFields(meetRoom, fields);

		// Remove moderatorUrl if the participant is a speaker to prevent access to moderator links
		if (participantRole === ParticipantRole.SPEAKER) {
			delete filteredRoom.moderatorUrl;
		}

		return filteredRoom as MeetRoom;
	}

	/**
	 * Deletes a room based on the specified policies for handling active meetings and recordings.
	 *
	 * @param roomId - The unique identifier of the room to delete
	 * @param withMeeting - Policy for handling rooms with active meetings
	 * @param withRecordings - Policy for handling rooms with recordings
	 * @returns Promise with deletion result including status code, success code, message and room (if updated instead of deleted)
	 * @throws Error with specific error codes for conflict scenarios
	 */
	async deleteMeetRoom(
		roomId: string,
		withMeeting = MeetRoomDeletionPolicyWithMeeting.FAIL,
		withRecordings = MeetRoomDeletionPolicyWithRecordings.FAIL
	): Promise<{
		successCode: MeetRoomDeletionSuccessCode;
		message: string;
		room?: MeetRoom;
	}> {
		try {
			this.logger.info(
				`Deleting room '${roomId}' with policies: withMeeting=${withMeeting}, withRecordings=${withRecordings}`
			);

			// Check if there's an active meeting in the room and/or if it has recordings associated
			const room = await this.getMeetRoom(roomId);
			const hasActiveMeeting = room.status === MeetRoomStatus.ACTIVE_MEETING;
			const hasRecordings = await this.recordingService.hasRoomRecordings(roomId);

			this.logger.debug(
				`Room '${roomId}' status: hasActiveMeeting=${hasActiveMeeting}, hasRecordings=${hasRecordings}`
			);

			const updatedRoom = await this.executeDeletionStrategy(
				roomId,
				hasActiveMeeting,
				hasRecordings,
				withMeeting,
				withRecordings
			);
			return this.getDeletionResponse(
				roomId,
				hasActiveMeeting,
				hasRecordings,
				withMeeting,
				withRecordings,
				updatedRoom
			);
		} catch (error) {
			this.logger.error(`Error deleting room '${roomId}': ${error}`);
			throw error;
		}
	}

	/**
	 * Executes the deletion strategy for a room based on its state and the provided deletion policies.
	 * - Validates the deletion policies (throws if not allowed).
	 * - If no active meeting and no recordings, deletes the room directly.
	 * - If there is an active meeting, sets the meeting end action (DELETE or CLOSE) and optionally ends the meeting.
	 * - If there are recordings and policy is CLOSE, closes the room.
	 * - If force delete is requested, deletes all recordings and the room.
	 */
	protected async executeDeletionStrategy(
		roomId: string,
		hasActiveMeeting: boolean,
		hasRecordings: boolean,
		withMeeting: MeetRoomDeletionPolicyWithMeeting,
		withRecordings: MeetRoomDeletionPolicyWithRecordings
	): Promise<MeetRoom | undefined> {
		// Validate policies first (fail-fast)
		this.validateDeletionPolicies(roomId, hasActiveMeeting, hasRecordings, withMeeting, withRecordings);

		// No meeting, no recordings: simple deletion
		if (!hasActiveMeeting && !hasRecordings) {
			// await this.storageService.deleteMeetRooms([roomId]);
			await this.roomRepository.deleteByRoomId(roomId);
			return undefined;
		}

		const room = await this.getMeetRoom(roomId);

		// Determine actions based on policies
		const shouldForceEndMeeting = hasActiveMeeting && withMeeting === MeetRoomDeletionPolicyWithMeeting.FORCE;
		const shouldCloseRoom = hasRecordings && withRecordings === MeetRoomDeletionPolicyWithRecordings.CLOSE;

		if (hasActiveMeeting) {
			// Set meeting end action (DELETE or CLOSE) depending on recording policy
			room.meetingEndAction = shouldCloseRoom ? MeetingEndAction.CLOSE : MeetingEndAction.DELETE;
			await this.roomRepository.update(room);

			if (shouldForceEndMeeting) {
				// Force end meeting by deleting the LiveKit room
				await this.livekitService.deleteRoom(roomId);
			}

			return room;
		}

		if (shouldCloseRoom) {
			// Close room instead of deleting if recordings exist and policy is CLOSE
			room.status = MeetRoomStatus.CLOSED;
			await this.roomRepository.update(room);
			return room;
		}

		// Force delete: delete room and all recordings
		await Promise.all([
			this.recordingService.deleteAllRoomRecordings(roomId),
			this.roomRepository.deleteByRoomId(roomId)
		]);
		return undefined;
	}

	/**
	 * Validates deletion policies and throws appropriate errors for conflicts.
	 */
	protected validateDeletionPolicies(
		roomId: string,
		hasActiveMeeting: boolean,
		hasRecordings: boolean,
		withMeeting: MeetRoomDeletionPolicyWithMeeting,
		withRecordings: MeetRoomDeletionPolicyWithRecordings
	) {
		const baseMessage = `Room '${roomId}'`;

		// Meeting policy validation
		if (hasActiveMeeting && withMeeting === MeetRoomDeletionPolicyWithMeeting.FAIL) {
			if (hasRecordings) {
				throw errorDeletingRoom(
					MeetRoomDeletionErrorCode.ROOM_WITH_RECORDINGS_HAS_ACTIVE_MEETING,
					`${baseMessage} with recordings cannot be deleted because it has an active meeting.`
				);
			} else {
				throw errorDeletingRoom(
					MeetRoomDeletionErrorCode.ROOM_HAS_ACTIVE_MEETING,
					`${baseMessage} cannot be deleted because it has an active meeting.`
				);
			}
		}

		// Recording policy validation
		if (hasRecordings && withRecordings === MeetRoomDeletionPolicyWithRecordings.FAIL) {
			if (hasActiveMeeting) {
				if (withMeeting === MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS) {
					throw errorDeletingRoom(
						MeetRoomDeletionErrorCode.ROOM_WITH_ACTIVE_MEETING_HAS_RECORDINGS_CANNOT_SCHEDULE_DELETION,
						`${baseMessage} with active meeting cannot be scheduled to be deleted because it has recordings.`
					);
				} else {
					throw errorDeletingRoom(
						MeetRoomDeletionErrorCode.ROOM_WITH_ACTIVE_MEETING_HAS_RECORDINGS,
						`${baseMessage} with active meeting cannot be deleted because it has recordings.`
					);
				}
			} else {
				throw errorDeletingRoom(
					MeetRoomDeletionErrorCode.ROOM_HAS_RECORDINGS,
					`${baseMessage} cannot be deleted because it has recordings.`
				);
			}
		}
	}

	/**
	 * Gets the appropriate response information based on room state and policies.
	 */
	private getDeletionResponse(
		roomId: string,
		hasActiveMeeting: boolean,
		hasRecordings: boolean,
		withMeeting: MeetRoomDeletionPolicyWithMeeting,
		withRecordings: MeetRoomDeletionPolicyWithRecordings,
		room?: MeetRoom
	): {
		successCode: MeetRoomDeletionSuccessCode;
		message: string;
		room?: MeetRoom;
	} {
		const baseMessage = `Room '${roomId}'`;

		// No meeting, no recordings
		if (!hasActiveMeeting && !hasRecordings) {
			return {
				successCode: MeetRoomDeletionSuccessCode.ROOM_DELETED,
				message: `${baseMessage} deleted successfully`
			};
		}

		// Has active meeting, no recordings
		if (hasActiveMeeting && !hasRecordings) {
			switch (withMeeting) {
				case MeetRoomDeletionPolicyWithMeeting.FORCE:
					return {
						successCode: MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_DELETED,
						message: `${baseMessage} with active meeting deleted successfully`
					};
				case MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS:
					return {
						successCode: MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_SCHEDULED_TO_BE_DELETED,
						message: `${baseMessage} with active meeting scheduled to be deleted when the meeting ends`,
						room
					};
				default:
					throw internalError(`Unexpected meeting deletion policy: ${withMeeting}`);
			}
		}

		// No active meeting, has recordings
		if (!hasActiveMeeting && hasRecordings) {
			switch (withRecordings) {
				case MeetRoomDeletionPolicyWithRecordings.FORCE:
					return {
						successCode: MeetRoomDeletionSuccessCode.ROOM_AND_RECORDINGS_DELETED,
						message: `${baseMessage} and its recordings deleted successfully`
					};
				case MeetRoomDeletionPolicyWithRecordings.CLOSE:
					return {
						successCode: MeetRoomDeletionSuccessCode.ROOM_CLOSED,
						message: `${baseMessage} has been closed instead of deleted because it has recordings`,
						room
					};
				default:
					throw internalError(`Unexpected recording deletion policy: ${withRecordings}`);
			}
		}

		// Has active meeting, has recordings
		switch (withMeeting) {
			case MeetRoomDeletionPolicyWithMeeting.FORCE: {
				switch (withRecordings) {
					case MeetRoomDeletionPolicyWithRecordings.FORCE:
						return {
							successCode: MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_AND_RECORDINGS_DELETED,
							message: `${baseMessage} with active meeting and its recordings deleted successfully`
						};
					case MeetRoomDeletionPolicyWithRecordings.CLOSE:
						return {
							successCode: MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_CLOSED,
							message: `${baseMessage} with active meeting has been closed instead of deleted because it has recordings`,
							room
						};
					default:
						throw internalError(`Unexpected recording deletion policy: ${withRecordings}`);
				}
			}

			case MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS: {
				switch (withRecordings) {
					case MeetRoomDeletionPolicyWithRecordings.FORCE:
						return {
							successCode:
								MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_AND_RECORDINGS_SCHEDULED_TO_BE_DELETED,
							message: `${baseMessage} with active meeting and its recordings scheduled to be deleted when the meeting ends`,
							room
						};
					case MeetRoomDeletionPolicyWithRecordings.CLOSE:
						return {
							successCode: MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_SCHEDULED_TO_BE_CLOSED,
							message: `${baseMessage} with active meeting scheduled to be closed when the meeting ends because it has recordings`,
							room
						};
					default:
						throw internalError(`Unexpected recording deletion policy: ${withRecordings}`);
				}
			}

			default:
				throw internalError(`Unexpected meeting deletion policy: ${withMeeting}`);
		}
	}

	/**
	 * Deletes multiple rooms in bulk using the deleteMeetRoom method, processing them in batches.
	 *
	 * @param rooms - Array of room identifiers to be deleted.
	 * If an array of MeetRoom objects is provided, the roomId will be extracted from each object.
	 * @param withMeeting - Policy for handling rooms with active meetings
	 * @param withRecordings - Policy for handling rooms with recordings
	 * @param batchSize - Number of rooms to process in each batch (default: 10)
	 * @returns Promise with arrays of successful and failed deletions
	 */
	async bulkDeleteMeetRooms(
		rooms: string[] | MeetRoom[],
		withMeeting = MeetRoomDeletionPolicyWithMeeting.FAIL,
		withRecordings = MeetRoomDeletionPolicyWithRecordings.FAIL,
		batchSize = 10
	): Promise<{
		successful: {
			roomId: string;
			successCode: MeetRoomDeletionSuccessCode;
			message: string;
			room?: MeetRoom;
		}[];
		failed: {
			roomId: string;
			error: string;
			message: string;
		}[];
	}> {
		this.logger.info(
			`Starting bulk deletion of ${rooms.length} rooms with policies: withMeeting=${withMeeting}, withRecordings=${withRecordings}`
		);

		const successful: {
			roomId: string;
			successCode: MeetRoomDeletionSuccessCode;
			message: string;
			room?: MeetRoom;
		}[] = [];
		const failed: {
			roomId: string;
			error: string;
			message: string;
		}[] = [];

		// Process rooms in batches
		for (let i = 0; i < rooms.length; i += batchSize) {
			const batch = rooms.slice(i, i + batchSize);
			const batchNumber = Math.floor(i / batchSize) + 1;
			const totalBatches = Math.ceil(rooms.length / batchSize);

			this.logger.debug(`Processing batch ${batchNumber}/${totalBatches} with ${batch.length} rooms`);

			// Process all rooms in the current batch concurrently
			const batchResults = await Promise.all(
				batch.map(async (room) => {
					const roomId = typeof room === 'string' ? room : room.roomId;

					try {
						let result;

						if (typeof room === 'string') {
							result = await this.deleteMeetRoom(roomId, withMeeting, withRecordings);
						} else {
							// Extract deletion policies from the room object
							result = await this.deleteMeetRoom(
								roomId,
								room.autoDeletionPolicy?.withMeeting,
								room.autoDeletionPolicy?.withRecordings
							);
						}

						this.logger.info(result.message);
						return {
							roomId,
							success: true,
							result
						};
					} catch (error) {
						return {
							roomId,
							success: false,
							error
						};
					}
				})
			);

			// Process batch results
			batchResults.forEach((result) => {
				const { roomId, success, result: deletionResult, error } = result;

				if (success) {
					successful.push({
						roomId,
						successCode: deletionResult!.successCode,
						message: deletionResult!.message,
						room: deletionResult!.room
					});
				} else {
					let meetError: OpenViduMeetError;

					if (error instanceof OpenViduMeetError) {
						meetError = error;
					} else {
						meetError = internalError(`deleting room '${roomId}'`);
					}

					failed.push({
						roomId,
						error: meetError.name,
						message: meetError.message
					});
				}
			});

			this.logger.debug(`Batch ${batchNumber} completed`);
		}

		this.logger.info(
			`Bulk deletion completed: ${successful.length}/${rooms.length} successful, ${failed.length}/${rooms.length} failed`
		);
		return { successful, failed };
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
		const recordingAccess = room.config?.recording.allowAccessTo;

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
	 * This method checks for rooms that have an auto-deletion date in the past and
	 * tries to delete them based on their auto-deletion policy.
	 */
	protected async deleteExpiredRooms(): Promise<void> {
		this.logger.verbose(`Checking expired rooms at ${new Date(Date.now()).toISOString()}`);

		try {
			const expiredRooms = await this.roomRepository.findExpiredRooms();

			if (expiredRooms.length === 0) {
				this.logger.verbose(`No expired rooms found.`);
				return;
			}

			this.logger.verbose(
				`Trying to delete ${expiredRooms.length} expired Meet rooms: ${expiredRooms.map((room) => room.roomId).join(', ')}`
			);
			await this.bulkDeleteMeetRooms(expiredRooms);
		} catch (error) {
			this.logger.error('Error deleting expired rooms:', error);
		}
	}
}
