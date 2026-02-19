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
	MeetRoomField,
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
import merge from 'lodash.merge';
import ms from 'ms';
import { uid as secureUid } from 'uid/secure';
import { uid } from 'uid/single';
import { container } from '../config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import {
	errorDeletingRoom,
	errorInsufficientPermissions,
	errorRoomActiveMeeting,
	errorRoomNotFound,
	internalError,
	OpenViduMeetError
} from '../models/error.model.js';

import { MeetRoomDeletionOptions } from '../models/request-context.model.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { FrontendEventService } from './frontend-event.service.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { RecordingService } from './recording.service.js';
import { RequestSessionService } from './request-session.service.js';
import type { RoomMemberService } from './room-member.service.js';

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

	private async getRoomMemberService(): Promise<RoomMemberService> {
		const { RoomMemberService } = await import('./room-member.service.js');
		return container.get(RoomMemberService);
	}

	/**
	 * Creates an OpenVidu Meet room with the specified options.
	 *
	 * @param {MeetRoomOptions} roomOptions - The options for creating the OpenVidu room.
	 * @param {MeetRoomServerResponseOptions} responseOpts - Options for controlling the response format (fields, extraFields)
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

		const now = Date.now();
		const meetRoom: MeetRoom = {
			roomId,
			roomName: roomName!,
			owner: user.userId,
			creationDate: now,
			// maxParticipants,
			autoDeletionDate,
			autoDeletionPolicy: autoDeletionDate ? autoDeletionPolicy : undefined,
			config: config as MeetRoomConfig,
			roles: roomRoles,
			anonymous: anonymousConfig,
			accessUrl: `/room/${roomId}`,
			status: MeetRoomStatus.OPEN,
			rolesUpdatedAt: now,
			meetingEndAction: MeetingEndAction.NONE
		};
		return this.roomRepository.create(meetRoom);
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

		// Merge existing config with new config (partial update)
		room.config = merge({}, room.config, config);

		// Disable recording if E2EE is enabled
		if (room.config.e2ee.enabled && room.config.recording.enabled) {
			room.config.recording.enabled = false;
		}

		await this.roomRepository.update(room);
		// Send signal to frontend.
		// Note: Rooms updates are not allowed during active meetings, so we don't need to send an immediate update signal to participants,
		// as they will receive the updated config when they join the meeting or when the meeting is restarted.
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
	 * @param roles - Partial roles config with the fields to update
	 * @returns A Promise that resolves to the updated MeetRoom object
	 */
	async updateMeetRoomRoles(roomId: string, roles: MeetRoomRolesConfig): Promise<MeetRoom> {
		const room = await this.getMeetRoom(roomId);

		if (room.status === MeetRoomStatus.ACTIVE_MEETING) {
			throw errorRoomActiveMeeting(roomId);
		}

		// Merge existing roles with new roles (partial update)
		room.roles = merge({}, room.roles, roles);
		room.rolesUpdatedAt = Date.now();
		await this.roomRepository.update(room);

		// Update existing room members with new effective permissions
		const roomMemberService = await this.getRoomMemberService();
		await roomMemberService.updateAllRoomMemberPermissions(roomId, room.roles);

		return room;
	}

	/**
	 * Updates the anonymous access configuration of a specific meeting room.
	 *
	 * @param roomId - The unique identifier of the meeting room to update
	 * @param anonymous - Partial anonymous config with the fields to update
	 * @returns A Promise that resolves to the updated MeetRoom object
	 */
	async updateMeetRoomAnonymous(roomId: string, anonymous: MeetRoomAnonymousConfig): Promise<MeetRoom> {
		const room = await this.getMeetRoom(roomId);

		if (room.status === MeetRoomStatus.ACTIVE_MEETING) {
			throw errorRoomActiveMeeting(roomId);
		}

		// Merge existing anonymous config with new anonymous config (partial update)
		room.anonymous = merge({}, room.anonymous, anonymous);
		room.rolesUpdatedAt = Date.now();

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
	 * @param filters - Filtering, pagination and sorting options (fields used for DB query optimization)
	 * @returns A Promise that resolves to paginated room list (with DB-optimized fields, but no HTTP filtering)
	 * @throws If there was an error retrieving the rooms
	 */
	async getAllMeetRooms(filters: MeetRoomFilters): Promise<{
		rooms: MeetRoom[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		const queryOptions: MeetRoomFilters & { roomIds?: string[]; owner?: string } = { ...filters };
		const user = this.requestSessionService.getAuthenticatedUser();

		// TODO: This logic may move to a controller  because it is related to access control for HTTP requests,
		// TODO: while this service is also used in non-HTTP contexts (e.g., scheduler for auto-deletion, background jobs for recording management, etc).
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

		return this.roomRepository.find(queryOptions);
	}

	/**
	 * Gets the list of room IDs accessible by the authenticated user based on their role and permissions.
	 *
	 * - If the request is made with a room member token, only that room ID is returned (if permissions allow).
	 * - If the user is an ADMIN, null is returned indicating access to all rooms.
	 * - If the user is a USER, room IDs they own and are members of are returned.
	 * - If the user is a ROOM_MEMBER, only room IDs they are members of are returned.
	 *
	 * @param permission - Optional permission to filter rooms (e.g., 'canRetrieveRecordings')
	 * @returns A promise that resolves to an array of accessible room IDs, or null if user is ADMIN
	 */
	async getAccessibleRoomIds(permission?: keyof MeetRoomMemberPermissions): Promise<string[] | null> {
		const memberRoomId = this.requestSessionService.getRoomIdFromMember();

		// If request is made with room member token,
		// the only accessible room is the one associated with the token
		if (memberRoomId) {
			// Check permissions from token if specified
			if (permission) {
				const permissions = this.requestSessionService.getRoomMemberPermissions();

				if (!permissions || !permissions[permission]) {
					return [];
				}
			}

			return [memberRoomId];
		}

		const user = this.requestSessionService.getAuthenticatedUser();

		// Admin has access to all rooms
		if (!user || user.role === MeetUserRole.ADMIN) {
			return null;
		}

		// Get room IDs where user is member with the specified permission (if provided)
		const memberRoomIds = permission
			? await this.roomMemberRepository.getRoomIdsByMemberIdWithPermission(user.userId, permission)
			: await this.roomMemberRepository.getRoomIdsByMemberId(user.userId);

		let ownedRoomIds: string[] = [];

		// If USER role, also get owned room IDs
		if (user.role === MeetUserRole.USER) {
			const ownedRooms = await this.roomRepository.findByOwner(user.userId, ['roomId']);
			ownedRoomIds = ownedRooms.map((r) => r.roomId);
		}

		// Combine owned rooms and member rooms
		return [...new Set([...ownedRoomIds, ...memberRoomIds])];
	}

	/**
	 * Retrieves a specific meeting room by its unique identifier.
	 *
	 * @param roomId - The name of the room to retrieve.
	 * @param fields - Array of fields to retrieve from database (for query optimization)
	 * @returns A promise that resolves to an {@link MeetRoom} object if found, or rejects with an error if not found.
	 */
	async getMeetRoom(roomId: string, fields?: MeetRoomField[]): Promise<MeetRoom> {
		const room = await this.roomRepository.findByRoomId(roomId, fields);

		if (!room) {
			this.logger.error(`Meet room with ID ${roomId} not found.`);
			throw errorRoomNotFound(roomId);
		}

		return room;
	}

	/**
	 * Deletes a room based on the specified policies for handling active meetings and recordings.
	 *
	 * @param roomId - The unique identifier of the room to delete
	 * @param options - Deletion options including policies for handling active meetings and recordings
	 * @returns Promise with deletion result including status code, success code, message and room (if updated instead of deleted)
	 * @throws Error with specific error codes for conflict scenarios
	 */
	async deleteMeetRoom(
		roomId: string,
		options: MeetRoomDeletionOptions = {}
	): Promise<{
		successCode: MeetRoomDeletionSuccessCode;
		message: string;
		room?: MeetRoom;
	}> {
		const {
			withMeeting = MeetRoomDeletionPolicyWithMeeting.FAIL,
			withRecordings = MeetRoomDeletionPolicyWithRecordings.FAIL,
			fields
		} = options;

		try {
			this.logger.info(
				`Deleting room '${roomId}' with policies: withMeeting=${withMeeting}, withRecordings=${withRecordings}`
			);

			// Create a Set for adding required fields for deletion logic
			const requiredFields = new Set<MeetRoomField>(['roomId', 'status']);
			// requiredFields.add('autoDeletionPolicy');
			// requiredFields.add('meetingEndAction');

			// Merge and deduplicate fields for DB query
			const fieldsForQuery = Array.from(new Set([...(fields || []), ...requiredFields]));
			const room = await this.getMeetRoom(roomId, Array.from(fieldsForQuery));
			const hasActiveMeeting = room.status === MeetRoomStatus.ACTIVE_MEETING;
			const hasRecordings = await this.recordingService.hasRoomRecordings(roomId);

			this.logger.debug(
				`Room '${roomId}' status: hasActiveMeeting=${hasActiveMeeting}, hasRecordings=${hasRecordings}`
			);

			// Pass room object to avoid second DB fetch
			let updatedRoom = await this.executeDeletionStrategy(
				room,
				hasActiveMeeting,
				hasRecordings,
				withMeeting,
				withRecordings
			);

			// Remove required fields added for deletion logic from the response (they are not needed in the response)
			updatedRoom = updatedRoom ? MeetRoomHelper.applyFieldFilters(updatedRoom, fields) : undefined;

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
	 *
	 * @param room - The room object (already fetched from DB) to avoid duplicate queries
	 */
	protected async executeDeletionStrategy(
		room: MeetRoom,
		hasActiveMeeting: boolean,
		hasRecordings: boolean,
		withMeeting: MeetRoomDeletionPolicyWithMeeting,
		withRecordings: MeetRoomDeletionPolicyWithRecordings
	): Promise<MeetRoom | undefined> {
		const roomId = room.roomId;

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

		// Determine actions based on policies
		const shouldForceEndMeeting = hasActiveMeeting && withMeeting === MeetRoomDeletionPolicyWithMeeting.FORCE;
		const shouldCloseRoom = hasRecordings && withRecordings === MeetRoomDeletionPolicyWithRecordings.CLOSE;

		if (hasActiveMeeting) {
			// Set meeting end action (DELETE or CLOSE) depending on recording policy
			room.meetingEndAction = shouldCloseRoom ? MeetingEndAction.CLOSE : MeetingEndAction.DELETE;
			await this.roomRepository.updatePartial(room.roomId, { meetingEndAction: room.meetingEndAction });

			if (shouldForceEndMeeting) {
				// Force end meeting by deleting the LiveKit room
				await this.livekitService.deleteRoom(roomId);
			}

			return room;
		}

		if (shouldCloseRoom) {
			// Close room instead of deleting if recordings exist and policy is CLOSE
			room.status = MeetRoomStatus.CLOSED;
			await this.roomRepository.updatePartial(room.roomId, { status: room.status });
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
	 * @param roomsOrRoomIds - Array of room identifiers to be deleted.
	 * If an array of MeetRoom objects is provided, the roomId will be extracted from each object.
	 * @param options - Deletion options including policies for handling active meetings and recordings
	 * @param batchSize - Number of rooms to process in each batch (default: 10)
	 * @returns Promise with arrays of successful and failed deletions
	 */
	async bulkDeleteMeetRooms(
		roomsOrRoomIds: string[] | MeetRoom[],
		options: MeetRoomDeletionOptions = {},
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
		const {
			withMeeting = MeetRoomDeletionPolicyWithMeeting.FAIL,
			withRecordings = MeetRoomDeletionPolicyWithRecordings.FAIL,
			fields
		} = options;

		this.logger.info(
			`Starting bulk deletion of ${roomsOrRoomIds.length} rooms with policies: withMeeting=${withMeeting}, withRecordings=${withRecordings}`
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
		for (let i = 0; i < roomsOrRoomIds.length; i += batchSize) {
			const batch = roomsOrRoomIds.slice(i, i + batchSize);
			const batchNumber = Math.floor(i / batchSize) + 1;
			const totalBatches = Math.ceil(roomsOrRoomIds.length / batchSize);

			this.logger.debug(`Processing batch ${batchNumber}/${totalBatches} with ${batch.length} rooms`);

			// Process all rooms in the current batch concurrently
			const batchResults = await Promise.all(
				batch.map(async (room) => {
					const roomId = typeof room === 'string' ? room : room.roomId;

					try {
						const user = this.requestSessionService.getAuthenticatedUser();

						// !FIXME: This permission check is necessary for HTTP requests,
						// !but it is not ideal to have it here in the service layer,
						// !as this method can also be called from non-HTTP contexts (e.g., scheduled jobs for auto-deletion, background jobs for recording management, etc).
						// !This should be refactored and moved to a controller or a separate layer responsible for access control for HTTP requests.
						// Check permissions if user is authenticated and not an admin
						if (user && user.role !== MeetUserRole.ADMIN) {
							const isOwner = await this.isRoomOwner(roomId, user.userId);

							if (!isOwner) {
								throw errorInsufficientPermissions();
							}
						}

						let result;

						if (typeof room === 'string') {
							result = await this.deleteMeetRoom(roomId, { withMeeting, withRecordings, fields });
						} else {
							// Extract deletion policies from the room object
							result = await this.deleteMeetRoom(roomId, {
								withMeeting: room.autoDeletionPolicy?.withMeeting,
								withRecordings: room.autoDeletionPolicy?.withRecordings,
								fields
							});
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
			`Bulk deletion completed: ${successful.length}/${roomsOrRoomIds.length} successful, ${failed.length}/${roomsOrRoomIds.length} failed`
		);
		return { successful, failed };
	}

	/**
	 * Checks if a user is the owner of a room.
	 *
	 * @param roomId - The ID of the room
	 * @param userId - The ID of the user
	 * @returns A promise that resolves to true if the user is the owner, false otherwise
	 * @throws Error if room not found
	 */
	async isRoomOwner(roomId: string, userId: string): Promise<boolean> {
		const room = await this.getMeetRoom(roomId, ['owner']);
		return room.owner === userId;
	}

	/**
	 * Validates if the provided secret matches one of the room's secrets for anonymous access.
	 *
	 * @param roomId - The ID of the room
	 * @param secret - The secret to validate
	 * @returns A promise that resolves to true if the secret is valid, false otherwise
	 * @throws Error if room not found
	 */
	async isValidRoomSecret(roomId: string, secret: string): Promise<boolean> {
		const room = await this.getMeetRoom(roomId, ['anonymous']);
		const { moderatorSecret, speakerSecret } = MeetRoomHelper.extractSecretsFromRoom(room);
		return secret === moderatorSecret || secret === speakerSecret;
	}

	/**
	 * Retrieves the permissions of the authenticated room member.
	 *
	 * - If the user is authenticated via room member token, their permissions are obtained from the token metadata.
	 * - If the user is admin or the room owner, they have all permissions.
	 * - If the user is a registered room member, their permissions are obtained from their room member info.
	 * - If there's no authenticated user nor room member token, returns all permissions.
	 *   This is necessary for methods invoked by system processes (e.g., room auto-deletion).
	 *
	 * @param roomId The ID of the room.
	 * @returns A promise that resolves to the MeetRoomMemberPermissions object.
	 */
	async getAuthenticatedRoomMemberPermissions(roomId: string): Promise<MeetRoomMemberPermissions> {
		const roomMemberService = await this.getRoomMemberService();
		const user = this.requestSessionService.getAuthenticatedUser();
		const memberRoomId = this.requestSessionService.getRoomIdFromMember();

		// Room member token
		if (memberRoomId) {
			if (memberRoomId !== roomId) {
				return roomMemberService.getNoPermissions();
			}

			return this.requestSessionService.getRoomMemberPermissions()!;
		}

		// Registered user
		if (user) {
			const isAdmin = user.role === MeetUserRole.ADMIN;
			const isOwner = await this.isRoomOwner(roomId, user.userId);

			// Admins and owners have all permissions
			if (isAdmin || isOwner) {
				return roomMemberService.getAllPermissions();
			}

			const member = await roomMemberService.getRoomMember(roomId, user.userId);

			if (!member) {
				return roomMemberService.getNoPermissions();
			}

			return member.effectivePermissions;
		}

		// No authenticated user nor room member token - return all permissions for system processes
		return roomMemberService.getAllPermissions();
	}

	/**
	 * Checks if a registered user can access a specific room based on their role.
	 *
	 * @param roomId The ID of the room to check access for.
	 * @param user The user object containing user details and role.
	 * @returns A promise that resolves to true if the user can access the room, false otherwise.
	 * @throws Error if room not found
	 */
	async canUserAccessRoom(roomId: string, user: MeetUser): Promise<boolean> {
		// Verify room exists first (throws 404 if not found)
		const room = await this.getMeetRoom(roomId, ['owner']);

		if (user.role === MeetUserRole.ADMIN) {
			// Admins can access all rooms
			return true;
		}

		// Users can access rooms they own or are members of
		const isOwner = room.owner === user.userId;

		if (isOwner) {
			return true;
		}

		const roomMemberService = await this.getRoomMemberService();
		const isMember = await roomMemberService.isRoomMember(roomId, user.userId);
		return isMember;
	}
}
