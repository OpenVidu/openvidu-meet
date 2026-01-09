import {
	MeetingEndAction,
	MeetRoom,
	MeetRoomAnonymous,
	MeetRoomAnonymousConfig,
	MeetRoomConfig,
	MeetRoomDeletionErrorCode,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomDeletionSuccessCode,
	MeetRoomFilters,
	MeetRoomMemberPermissions,
	MeetRoomOptions,
	MeetRoomRoles,
	MeetRoomRolesConfig,
	MeetRoomStatus,
	MeetUser,
	MeetUserRole
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { CreateOptions, Room } from 'livekit-server-sdk';
import ms from 'ms';
import { uid as secureUid } from 'uid/secure';
import { uid } from 'uid/single';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import {
	errorDeletingRoom,
	errorRoomActiveMeeting,
	errorRoomNotFound,
	internalError,
	OpenViduMeetError
} from '../models/error.model.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { FrontendEventService } from './frontend-event.service.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { RecordingService } from './recording.service.js';
import { RequestSessionService } from './request-session.service.js';

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
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(RoomMemberRepository) protected roomMemberRepository: RoomMemberRepository,
		@inject(RecordingService) protected recordingService: RecordingService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(RequestSessionService) protected requestSessionService: RequestSessionService
	) {}

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
		const { roomName, autoDeletionDate, autoDeletionPolicy, config, roles, anonymous } = roomOptions;

		// Generate a unique room ID based on the room name
		const roomIdPrefix = MeetRoomHelper.createRoomIdPrefixFromRoomName(roomName!) || 'room';
		const roomId = `${roomIdPrefix}-${uid(15)}`;

		const user = this.requestSessionService.getAuthenticatedUser();

		if (!user) {
			throw internalError('Cannot create room without an authenticated user');
		}

		const defaultModeratorPermissions: MeetRoomMemberPermissions = {
			canRecord: true,
			canRetrieveRecordings: true,
			canDeleteRecordings: true,
			canJoinMeeting: true,
			canShareAccessLinks: true,
			canMakeModerator: true,
			canKickParticipants: true,
			canEndMeeting: true,
			canPublishVideo: true,
			canPublishAudio: true,
			canShareScreen: true,
			canReadChat: true,
			canWriteChat: true,
			canChangeVirtualBackground: true
		};
		const defaultSpeakerPermissions: MeetRoomMemberPermissions = {
			canRecord: false,
			canRetrieveRecordings: true,
			canDeleteRecordings: false,
			canJoinMeeting: true,
			canShareAccessLinks: false,
			canMakeModerator: false,
			canKickParticipants: false,
			canEndMeeting: false,
			canPublishVideo: true,
			canPublishAudio: true,
			canShareScreen: true,
			canReadChat: true,
			canWriteChat: true,
			canChangeVirtualBackground: true
		};

		const roomRoles: MeetRoomRoles = {
			moderator: {
				permissions: { ...defaultModeratorPermissions, ...roles?.moderator?.permissions }
			},
			speaker: {
				permissions: { ...defaultSpeakerPermissions, ...roles?.speaker?.permissions }
			}
		};

		const anonymousConfig: MeetRoomAnonymous = {
			moderator: {
				enabled: anonymous?.moderator?.enabled ?? true,
				accessUrl: `/room/${roomId}?secret=${secureUid(10)}`
			},
			speaker: {
				enabled: anonymous?.speaker?.enabled ?? true,
				accessUrl: `/room/${roomId}?secret=${secureUid(10)}`
			}
		};

		const defaultConfig: MeetRoomConfig = {
			recording: { enabled: true },
			chat: { enabled: true },
			virtualBackground: { enabled: true },
			e2ee: { enabled: false }
		};
		const roomConfig = {
			...defaultConfig,
			...config
		};

		// Disable recording if E2EE is enabled
		if (roomConfig.e2ee.enabled && roomConfig.recording.enabled) {
			roomConfig.recording.enabled = false;
		}

		const meetRoom: MeetRoom = {
			roomId,
			roomName: roomName!,
			owner: user.userId,
			creationDate: Date.now(),
			// maxParticipants,
			autoDeletionDate,
			autoDeletionPolicy: autoDeletionDate ? autoDeletionPolicy : undefined,
			config: roomConfig,
			roles: roomRoles,
			anonymous: anonymousConfig,
			accessUrl: `/room/${roomId}`,
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
				createdBy: MEET_ENV.NAME_ID,
				roomOptions: MeetRoomHelper.toRoomOptions(meetRoom)
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
	 * Updates the configuration of a specific meeting room.
	 * Supports partial updates - only provided fields will be updated.
	 *
	 * @param roomId - The unique identifier of the meeting room to update
	 * @param config - Partial config with the fields to update
	 * @returns A Promise that resolves to the updated MeetRoom object
	 */
	async updateMeetRoomConfig(roomId: string, config: Partial<MeetRoomConfig>): Promise<MeetRoom> {
		const room = await this.getMeetRoom(roomId);

		if (room.status === MeetRoomStatus.ACTIVE_MEETING) {
			// Reject config updates during active meetings
			throw errorRoomActiveMeeting(roomId);
		}

		// Merge the partial config with the existing config
		room.config = {
			...room.config,
			...config
		};

		// Disable recording if E2EE is enabled
		if (room.config.e2ee.enabled && room.config.recording.enabled) {
			room.config.recording.enabled = false;
		}

		await this.roomRepository.update(room);
		// Send signal to frontend
		// await this.frontendEventService.sendRoomConfigUpdatedSignal(roomId, room);
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
	 * Updates the roles permissions of a specific meeting room.
	 *
	 * @param roomId - The unique identifier of the meeting room to update
	 * @param roles - The new roles permissions
	 * @returns A Promise that resolves to the updated MeetRoom object
	 */
	async updateMeetRoomRoles(roomId: string, roles: MeetRoomRolesConfig): Promise<MeetRoom> {
		const room = await this.getMeetRoom(roomId);

		if (room.status === MeetRoomStatus.ACTIVE_MEETING) {
			throw errorRoomActiveMeeting(roomId);
		}

		if (roles.moderator) {
			room.roles.moderator.permissions = {
				...room.roles.moderator.permissions,
				...roles.moderator.permissions
			};
		}

		if (roles.speaker) {
			room.roles.speaker.permissions = {
				...room.roles.speaker.permissions,
				...roles.speaker.permissions
			};
		}

		await this.roomRepository.update(room);
		return room;
	}

	/**
	 * Updates the anonymous access configuration of a specific meeting room.
	 *
	 * @param roomId - The unique identifier of the meeting room to update
	 * @param anonymous - The new anonymous access configuration
	 * @returns A Promise that resolves to the updated MeetRoom object
	 */
	async updateMeetRoomAnonymous(roomId: string, anonymous: MeetRoomAnonymousConfig): Promise<MeetRoom> {
		const room = await this.getMeetRoom(roomId);

		if (room.status === MeetRoomStatus.ACTIVE_MEETING) {
			throw errorRoomActiveMeeting(roomId);
		}

		if (anonymous.moderator) {
			room.anonymous.moderator.enabled = anonymous.moderator.enabled;
		}

		if (anonymous.speaker) {
			room.anonymous.speaker.enabled = anonymous.speaker.enabled;
		}

		await this.roomRepository.update(room);
		return room;
	}

	/**
	 * Checks if a meeting room with the specified ID exists
	 *
	 * @param roomId - The ID of the meeting room to check
	 * @returns A Promise that resolves to true if the room exists, false otherwise
	 */
	async meetRoomExists(roomId: string): Promise<boolean> {
		const meetRoom = await this.roomRepository.findByRoomId(roomId);
		return !!meetRoom;
	}

	/**
	 * Retrieves a list of rooms based on the provided filtering, pagination, and sorting options.
	 * 
	 * If the request is made by an authenticated user, access is determined by the user's role:
	 * - ADMIN: Can see all rooms
	 * - USER: Can see rooms they own or are members of
	 * - ROOM_MEMBER: Can see rooms they are members of
	 *
	 * @param filters - Filtering, pagination and sorting options
	 * @returns A Promise that resolves to paginated room list
	 * @throws If there was an error retrieving the rooms
	 */
	async getAllMeetRooms(filters: MeetRoomFilters): Promise<{
		rooms: MeetRoom[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		const user = this.requestSessionService.getAuthenticatedUser();
		const queryOptions: MeetRoomFilters & { roomIds?: string[]; owner?: string } = { ...filters };

		// Admin can see all rooms - no additional filters needed
		if (user && user.role !== MeetUserRole.ADMIN) {
			// For USER and ROOM_MEMBER roles, get the list of room IDs they are members of
			const memberRoomIds = await this.roomMemberRepository.getRoomIdsByMemberId(user.userId);
			queryOptions.roomIds = memberRoomIds;

			// If USER role, also filter by rooms they own
			if (user.role === MeetUserRole.USER) {
				queryOptions.owner = user.userId;
			}
		}

		return await this.roomRepository.find(queryOptions);
	}

	/**
	 * Retrieves an OpenVidu room by its name.
	 *
	 * @param roomId - The name of the room to retrieve.
	 * @returns A promise that resolves to an {@link MeetRoom} object.
	 */
	async getMeetRoom(roomId: string, fields?: string): Promise<MeetRoom> {
		const room = await this.roomRepository.findByRoomId(roomId, fields);

		if (!room) {
			this.logger.error(`Meet room with ID ${roomId} not found.`);
			throw errorRoomNotFound(roomId);
		}

		// Remove anonymous access info if the authenticated room member does not have permission to share access links
		const permissions = await this.getAuthenticatedRoomMemberPermissions(roomId);

		if (room.anonymous && !permissions.canShareAccessLinks) {
			delete (room as Partial<MeetRoom>).anonymous;
		}

		return room;
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
	 * - If no active meeting and no recordings, deletes the room directly (and its members).
	 * - If there is an active meeting, sets the meeting end action (DELETE or CLOSE) and optionally ends the meeting.
	 * - If there are recordings and policy is CLOSE, closes the room.
	 * - If force delete is requested, deletes the room and all recordings and members.
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
			await Promise.all([
				this.roomMemberRepository.deleteAllByRoomId(roomId),
				this.roomRepository.deleteByRoomId(roomId)
			]);
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

		// Force delete: delete room and all recordings and members
		await Promise.all([
			this.recordingService.deleteAllRoomRecordings(roomId),
			this.roomMemberRepository.deleteAllByRoomId(roomId),
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
	 * Checks if a user is the owner of a room.
	 *
	 * @param roomId - The ID of the room
	 * @param userId - The ID of the user
	 * @returns A promise that resolves to true if the user is the owner, false otherwise
	 */
	async isRoomOwner(roomId: string, userId: string): Promise<boolean> {
		const room = await this.roomRepository.findByRoomId(roomId);
		return room?.owner === userId;
	}

	/**
	 * Checks if a user is a member of a room.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member (userId)
	 * @returns A promise that resolves to true if the user is a member, false otherwise
	 */
	async isRoomMember(roomId: string, memberId: string): Promise<boolean> {
		const member = await this.roomMemberRepository.findByRoomAndMemberId(roomId, memberId);
		return !!member;
	}

	/**
	 * Validates if the provided secret matches one of the room's secrets for anonymous access.
	 *
	 * @param roomId - The ID of the room
	 * @param secret - The secret to validate
	 * @returns A promise that resolves to true if the secret is valid, false otherwise
	 */
	async isValidRoomSecret(roomId: string, secret: string): Promise<boolean> {
		const room = await this.roomRepository.findByRoomId(roomId);

		if (!room) return false;

		const { moderatorSecret, speakerSecret } = MeetRoomHelper.extractSecretsFromRoom(room);
		return secret === moderatorSecret || secret === speakerSecret;
	}

	/**
	 * Retrieves the permissions of the authenticated room member.
	 *
	 * - If there's no authenticated user nor room member token, returns all permissions.
	 *   This is necessary for methods invoked by system processes (e.g., room auto-deletion).
	 * - If the user is admin or the room owner, they have all permissions.
	 * - If the user is a registered room member, their permissions are obtained from their room member info.
	 * - If the user is authenticated via room member token, their permissions are obtained from the token metadata.
	 *
	 * @param roomId The ID of the room.
	 * @returns A promise that resolves to the MeetRoomMemberPermissions object.
	 */
	async getAuthenticatedRoomMemberPermissions(roomId: string): Promise<MeetRoomMemberPermissions> {
		const user = this.requestSessionService.getAuthenticatedUser();
		const memberRoomId = this.requestSessionService.getRoomIdFromMember();

		if (!user && !memberRoomId) {
			return this.getAllPermissions();
		}

		// Registered user
		if (user) {
			const isAdmin = user.role === MeetUserRole.ADMIN;
			const isOwner = await this.isRoomOwner(roomId, user.userId);

			// Admins and owners have all permissions
			if (isAdmin || isOwner) {
				return this.getAllPermissions();
			}

			const member = await this.roomMemberRepository.findByRoomAndMemberId(roomId, user.userId);

			if (member) {
				return member.effectivePermissions;
			}
		}

		// Room member token
		if (memberRoomId === roomId) {
			const permissions = this.requestSessionService.getRoomMemberPermissions();
			return permissions!;
		}

		return this.getNoPermissions();
	}

	/**
	 * Checks if a registered user can access a specific room based on their role.
	 *
	 * @param roomId The ID of the room to check access for.
	 * @param user The user object containing user details and role.
	 * @returns A promise that resolves to true if the user can access the room, false otherwise.
	 */
	async canUserAccessRoom(roomId: string, user: MeetUser): Promise<boolean> {
		if (user.role === MeetUserRole.ADMIN) {
			// Admins can access all rooms
			return true;
		}

		// Users can access rooms they own or are members of
		const isOwner = await this.isRoomOwner(roomId, user.userId);
		const isMember = await this.isRoomMember(roomId, user.userId);
		return isOwner || isMember;
	}

	private getAllPermissions(): MeetRoomMemberPermissions {
		return {
			canRecord: true,
			canRetrieveRecordings: true,
			canDeleteRecordings: true,
			canJoinMeeting: true,
			canShareAccessLinks: true,
			canMakeModerator: true,
			canKickParticipants: true,
			canEndMeeting: true,
			canPublishVideo: true,
			canPublishAudio: true,
			canShareScreen: true,
			canReadChat: true,
			canWriteChat: true,
			canChangeVirtualBackground: true
		};
	}

	private getNoPermissions(): MeetRoomMemberPermissions {
		return {
			canRecord: false,
			canRetrieveRecordings: false,
			canDeleteRecordings: false,
			canJoinMeeting: false,
			canShareAccessLinks: false,
			canMakeModerator: false,
			canKickParticipants: false,
			canEndMeeting: false,
			canPublishVideo: false,
			canPublishAudio: false,
			canShareScreen: false,
			canReadChat: false,
			canWriteChat: false,
			canChangeVirtualBackground: false
		};
	}
}
