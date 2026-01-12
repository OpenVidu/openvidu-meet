import {
	LiveKitPermissions,
	MeetRoomMember,
	MeetRoomMemberFilters,
	MeetRoomMemberOptions,
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberTokenOptions,
	MeetRoomStatus,
	MeetUserRole,
	TrackSource
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { ParticipantInfo } from 'livekit-server-sdk';
import { uid as secureUid } from 'uid/secure';
import { uid } from 'uid/single';
import { MEET_ENV } from '../environment.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { validateRoomMemberTokenMetadata } from '../middlewares/request-validators/room-member-validator.middleware.js';
import {
	errorInsufficientPermissions,
	errorInvalidRoomSecret,
	errorParticipantNotFound,
	errorRoomClosed,
	errorRoomMemberNotFound,
	errorUnauthorized,
	errorUserNotFound
} from '../models/error.model.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { FrontendEventService } from './frontend-event.service.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { ParticipantNameService } from './participant-name.service.js';
import { RequestSessionService } from './request-session.service.js';
import { RoomService } from './room.service.js';
import { TokenService } from './token.service.js';
import { UserService } from './user.service.js';

/**
 * Service for managing room members and meeting participants.
 */
@injectable()
export class RoomMemberService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(RoomMemberRepository) protected roomMemberRepository: RoomMemberRepository,
		@inject(RoomService) protected roomService: RoomService,
		@inject(UserService) protected userService: UserService,
		@inject(ParticipantNameService) protected participantNameService: ParticipantNameService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(TokenService) protected tokenService: TokenService,
		@inject(RequestSessionService) protected requestSessionService: RequestSessionService
	) {}

	/**
	 * Creates a new room member.
	 *
	 * @param roomId - The ID of the room
	 * @param memberOptions - The options for creating the room member
	 * @returns A promise that resolves to the created MeetRoomMember object
	 */
	async createRoomMember(roomId: string, memberOptions: MeetRoomMemberOptions): Promise<MeetRoomMember> {
		const { userId, name, baseRole, customPermissions } = memberOptions;

		// Generate memberId and member name
		let memberId: string;
		let memberName: string;
		let accessUrl = `/room/${roomId}`;

		if (userId) {
			// Registered user: memberId = userId, get name from user service
			const user = await this.userService.getUser(userId);

			if (!user) {
				throw errorUserNotFound(userId);
			}

			memberId = userId;
			memberName = user.name;
		} else if (name) {
			// External user: generate memberId, use provided name
			memberId = `ext-${secureUid(10)}`;
			memberName = name;
			accessUrl += `?secret=${memberId}`;
		} else {
			throw new Error('Either userId or name must be provided');
		}

		const roomMember = {
			memberId,
			roomId,
			name: memberName,
			membershipDate: Date.now(),
			accessUrl,
			baseRole,
			customPermissions
		};
		return this.roomMemberRepository.create(roomMember);
	}

	/**
	 * Checks if a user (registered or external) is a member of a room.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member
	 * @returns A promise that resolves to true if the user is a member, false otherwise
	 */
	async isRoomMember(roomId: string, memberId: string): Promise<boolean> {
		const member = await this.roomMemberRepository.findByRoomAndMemberId(roomId, memberId);
		return !!member;
	}

	/**
	 * Retrieves a specific room member by their ID.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member
	 * @returns A promise that resolves to the MeetRoomMember object or null if not found
	 */
	async getRoomMember(roomId: string, memberId: string): Promise<MeetRoomMember | null> {
		return this.roomMemberRepository.findByRoomAndMemberId(roomId, memberId);
	}

	/**
	 * Retrieves all members of a room with filtering and pagination.
	 *
	 * @param roomId - The ID of the room
	 * @param filters - Filters for the query
	 * @returns A promise that resolves to an object containing the members and pagination info
	 */
	async getAllRoomMembers(
		roomId: string,
		filters: MeetRoomMemberFilters
	): Promise<{
		members: MeetRoomMember[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		const response = await this.roomMemberRepository.findByRoomId(roomId, filters);
		return response;
	}

	/**
	 * Updates an existing room member.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member to update
	 * @param updates - The fields to update (baseRole and/or customPermissions)
	 * @returns A promise that resolves to the updated MeetRoomMember object
	 */
	async updateRoomMember(
		roomId: string,
		memberId: string,
		updates: { baseRole?: MeetRoomMemberRole; customPermissions?: Partial<MeetRoomMemberPermissions> }
	): Promise<MeetRoomMember> {
		const member = await this.getRoomMember(roomId, memberId);

		if (!member) {
			throw errorRoomMemberNotFound(roomId, memberId);
		}

		// Update baseRole if provided
		if (updates.baseRole) {
			member.baseRole = updates.baseRole;
		}

		// Update customPermissions if provided
		if (updates.customPermissions) {
			member.customPermissions = updates.customPermissions;
		}

		return this.roomMemberRepository.update(member);
	}

	/**
	 * Deletes a room member.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member to delete
	 */
	async deleteRoomMember(roomId: string, memberId: string): Promise<void> {
		const member = await this.getRoomMember(roomId, memberId);

		if (!member) {
			throw errorRoomMemberNotFound(roomId, memberId);
		}

		return this.roomMemberRepository.deleteByRoomAndMemberId(roomId, memberId);
	}

	/**
	 * Deletes multiple room members in bulk.
	 *
	 * @param roomId - The ID of the room
	 * @param memberIds - Array of member IDs to delete
	 * @returns A promise that resolves to an object with successful and failed deletions
	 */
	async bulkDeleteRoomMembers(
		roomId: string,
		memberIds: string[]
	): Promise<{
		deleted: string[];
		failed: { memberId: string; error: string }[];
	}> {
		const membersToDelete = await this.roomMemberRepository.findByRoomAndMemberIds(roomId, memberIds, 'memberId');
		const foundMemberIds = membersToDelete.map((m) => m.memberId);

		const failed = memberIds
			.filter((id) => !foundMemberIds.includes(id))
			.map((id) => ({ memberId: id, error: 'Room member not found' }));

		if (foundMemberIds.length > 0) {
			await this.roomMemberRepository.deleteByRoomIdAndMemberIds(roomId, foundMemberIds);
		}

		return {
			deleted: foundMemberIds,
			failed
		};
	}

	/**
	 * Generates or refreshes a room member token.
	 *
	 * @param roomId - The room identifier
	 * @param tokenOptions - Options for token generation
	 * @returns A promise that resolves to the generated token
	 */
	async generateOrRefreshRoomMemberToken(roomId: string, tokenOptions: MeetRoomMemberTokenOptions): Promise<string> {
		const { secret, joinMeeting = false, participantName, participantIdentity } = tokenOptions;

		let baseRole: MeetRoomMemberRole;
		let customPermissions: Partial<MeetRoomMemberPermissions> | undefined = undefined;
		let effectivePermissions: MeetRoomMemberPermissions;
		let memberId: string | undefined;

		if (secret) {
			// Case 1: Secret provided (Anonymous access or External Member)
			const isValidSecret = await this.roomService.isValidRoomSecret(roomId, secret);

			if (isValidSecret) {
				// If secret matches anonymous access URL secret, assign role and permissions based on it
				baseRole = await this.getRoomMemberRoleBySecret(roomId, secret);

				const room = await this.roomService.getMeetRoom(roomId);
				effectivePermissions = room.roles[baseRole].permissions;
			} else {
				// If secret is a memberId, fetch the member and assign their role and permissions
				const member = await this.getRoomMember(roomId, secret);

				if (member) {
					memberId = member.memberId;
					baseRole = member.baseRole;
					customPermissions = member.customPermissions;
					effectivePermissions = member.effectivePermissions;
				} else {
					throw errorInvalidRoomSecret(roomId, secret);
				}
			}
		} else {
			// Case 2: Authenticated user
			const user = this.requestSessionService.getAuthenticatedUser();

			if (!user) {
				throw errorUnauthorized();
			}

			// Check if user is admin or owner
			const isOwner = await this.roomService.isRoomOwner(roomId, user.userId);

			if (user.role === MeetUserRole.ADMIN || isOwner) {
				// Admins and owners have MODERATOR role with full permissions
				baseRole = MeetRoomMemberRole.MODERATOR;
				effectivePermissions = this.getAllPermissions();
			} else {
				// If user is a member, fetch their role and permissions
				const member = await this.getRoomMember(roomId, user.userId);

				if (member) {
					memberId = user.userId;
					baseRole = member.baseRole;
					customPermissions = member.customPermissions;
					effectivePermissions = member.effectivePermissions;
				} else {
					throw errorUnauthorized();
				}
			}
		}

		if (joinMeeting && participantName) {
			return this.generateTokenForJoiningMeeting(
				roomId,
				baseRole,
				effectivePermissions,
				participantName,
				participantIdentity,
				customPermissions,
				memberId
			);
		} else {
			return this.generateToken(roomId, baseRole, effectivePermissions, customPermissions, memberId);
		}
	}

	/**
	 * Generates a token for joining a meeting.
	 * Handles both new token generation and token refresh.
	 */
	protected async generateTokenForJoiningMeeting(
		roomId: string,
		baseRole: MeetRoomMemberRole,
		effectivePermissions: MeetRoomMemberPermissions,
		participantName: string,
		participantIdentity?: string,
		customPermissions?: Partial<MeetRoomMemberPermissions>,
		memberId?: string
	): Promise<string> {
		// Check that room is open
		const room = await this.roomService.getMeetRoom(roomId);

		if (room.status === MeetRoomStatus.CLOSED) {
			throw errorRoomClosed(roomId);
		}

		// Check that member has permission to join meeting
		if (!effectivePermissions.canJoinMeeting) {
			throw errorInsufficientPermissions();
		}

		const isRefresh = !!participantIdentity;

		if (!isRefresh) {
			// GENERATION MODE
			this.logger.verbose(
				`Generating room member token for joining a meeting for '${participantName}' in room '${roomId}'`
			);

			// Create the Livekit room if it doesn't exist
			await this.roomService.createLivekitRoom(roomId);

			try {
				// Reserve a unique name for the participant
				participantName = await this.participantNameService.reserveUniqueName(roomId, participantName);
				this.logger.verbose(`Reserved unique name '${participantName}' for room '${roomId}'`);
			} catch (error) {
				this.logger.error(`Failed to reserve unique name '${participantName}' for room '${roomId}':`, error);
				throw error;
			}

			// Create a unique participant identity based on the participant name
			const identityPrefix = this.createParticipantIdentityPrefixFromName(participantName) || 'participant';
			participantIdentity = `${identityPrefix}-${uid(15)}`;
		} else {
			// REFRESH MODE
			this.logger.verbose(
				`Refreshing room member token for participant '${participantIdentity}' in room '${roomId}'`
			);

			// Check if participant exists in the room
			const participantExists = await this.existsParticipantInMeeting(roomId, participantIdentity!);

			if (!participantExists) {
				this.logger.verbose(`Participant '${participantIdentity}' does not exist in room '${roomId}'`);
				throw errorParticipantNotFound(participantIdentity!, roomId);
			}
		}

		const livekitPermissions = await this.getLiveKitPermissions(roomId, effectivePermissions);
		const tokenMetadata: MeetRoomMemberTokenMetadata = {
			livekitUrl: MEET_ENV.LIVEKIT_URL,
			roomId,
			memberId,
			baseRole,
			customPermissions,
			effectivePermissions
		};

		// Generate token with participant name
		return this.tokenService.generateRoomMemberToken(
			tokenMetadata,
			livekitPermissions,
			participantName,
			participantIdentity
		);
	}

	/**
	 * Generates a token for accessing room resources but not joining a meeting.
	 */
	protected async generateToken(
		roomId: string,
		baseRole: MeetRoomMemberRole,
		effectivePermissions: MeetRoomMemberPermissions,
		customPermissions?: Partial<MeetRoomMemberPermissions>,
		memberId?: string
	): Promise<string> {
		this.logger.verbose(
			`Generating room member token for accessing room resources but not joining a meeting for room '${roomId}'`
		);

		const tokenMetadata: MeetRoomMemberTokenMetadata = {
			livekitUrl: MEET_ENV.LIVEKIT_URL,
			roomId,
			memberId,
			baseRole,
			customPermissions,
			effectivePermissions
		};

		// Generate token without LiveKit permissions and participant name
		return this.tokenService.generateRoomMemberToken(tokenMetadata);
	}

	/**
	 * Validates a secret against a room's moderator and speaker secrets and returns the corresponding role.
	 *
	 * @param roomId - The unique identifier of the room to check
	 * @param secret - The secret to validate against the room's moderator and speaker secrets
	 * @returns A promise that resolves to the room member role (MODERATOR or SPEAKER) if the secret is valid
	 * @throws Error if the moderator or speaker secrets cannot be extracted from their URLs
	 * @throws Error if the provided secret doesn't match any of the room's secrets (unauthorized)
	 */
	protected async getRoomMemberRoleBySecret(roomId: string, secret: string): Promise<MeetRoomMemberRole> {
		const room = await this.roomService.getMeetRoom(roomId);
		const { moderatorSecret, speakerSecret } = MeetRoomHelper.extractSecretsFromRoom(room);

		switch (secret) {
			case moderatorSecret:
				return MeetRoomMemberRole.MODERATOR;
			case speakerSecret:
				return MeetRoomMemberRole.SPEAKER;
			default:
				throw errorInvalidRoomSecret(room.roomId, secret);
		}
	}

	/**
	 * Gets all permissions set to true.
	 */
	getAllPermissions(): MeetRoomMemberPermissions {
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

	/**
	 * Gets all permissions set to false.
	 */
	getNoPermissions(): MeetRoomMemberPermissions {
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

	/**
	 * Gets the LiveKit permissions for a room member based on their Meet permissions.
	 *
	 * @param roomId - The ID of the room
	 * @returns The LiveKit permissions for the room member
	 */
	protected async getLiveKitPermissions(
		roomId: string,
		permissions: MeetRoomMemberPermissions
	): Promise<LiveKitPermissions> {
		const canPublishSources: TrackSource[] = [];

		if (permissions.canPublishAudio) {
			canPublishSources.push(TrackSource.MICROPHONE);
		}

		if (permissions.canPublishVideo) {
			canPublishSources.push(TrackSource.CAMERA);
		}

		if (permissions.canShareScreen) {
			canPublishSources.push(TrackSource.SCREEN_SHARE);
			canPublishSources.push(TrackSource.SCREEN_SHARE_AUDIO);
		}

		const livekitPermissions: LiveKitPermissions = {
			room: roomId,
			roomJoin: true,
			canPublish: permissions.canPublishAudio || permissions.canPublishVideo || permissions.canShareScreen,
			canPublishSources,
			canSubscribe: true,
			canPublishData: true,
			canUpdateOwnMetadata: true
		};
		return livekitPermissions;
	}

	/**
	 * Parses and validates room member token metadata.
	 */
	parseRoomMemberTokenMetadata(metadata: string): MeetRoomMemberTokenMetadata {
		try {
			const parsedMetadata = JSON.parse(metadata);
			return validateRoomMemberTokenMetadata(parsedMetadata);
		} catch (error) {
			this.logger.error('Failed to parse room member token metadata:', error);
			throw new Error('Invalid room member token metadata format');
		}
	}

	async kickParticipantFromMeeting(roomId: string, participantIdentity: string): Promise<void> {
		this.logger.verbose(`Kicking participant '${participantIdentity}' from room '${roomId}'`);
		return this.livekitService.deleteParticipant(roomId, participantIdentity);
	}

	async updateParticipantRole(
		roomId: string,
		participantIdentity: string,
		newRole: MeetRoomMemberRole
	): Promise<void> {
		try {
			const meetRoom = await this.roomService.getMeetRoom(roomId);

			const participant = await this.getParticipantFromMeeting(roomId, participantIdentity);
			const metadata: MeetRoomMemberTokenMetadata = this.parseRoomMemberTokenMetadata(participant.metadata);

			// Update role and permissions in metadata
			metadata.baseRole = newRole;
			metadata.customPermissions = undefined;
			metadata.effectivePermissions = meetRoom.roles[newRole].permissions;

			await this.livekitService.updateParticipantMetadata(roomId, participantIdentity, JSON.stringify(metadata));

			const { speakerSecret, moderatorSecret } = MeetRoomHelper.extractSecretsFromRoom(meetRoom);
			const secret = newRole === MeetRoomMemberRole.MODERATOR ? moderatorSecret : speakerSecret;
			await this.frontendEventService.sendParticipantRoleUpdatedSignal(
				roomId,
				participantIdentity,
				newRole,
				secret
			);
		} catch (error) {
			this.logger.error('Error updating participant role:', error);
			throw error;
		}
	}

	protected async existsParticipantInMeeting(roomId: string, participantIdentity: string): Promise<boolean> {
		this.logger.verbose(`Checking if participant '${participantIdentity}' exists in room '${roomId}'`);
		return this.livekitService.participantExists(roomId, participantIdentity);
	}

	protected async getParticipantFromMeeting(roomId: string, participantIdentity: string): Promise<ParticipantInfo> {
		this.logger.verbose(`Fetching participant '${participantIdentity}'`);
		return this.livekitService.getParticipant(roomId, participantIdentity);
	}

	/**
	 * Creates a sanitized participant identity prefix from the given participant name.
	 *
	 * This method normalizes the participant name by:
	 * - Decomposing combined characters (e.g., á -> a + ´)
	 * - Converting to lowercase
	 * - Replacing hyphens and spaces with underscores
	 * - Allowing only lowercase letters, numbers, and underscores
	 * - Replacing multiple consecutive underscores with a single underscore
	 * - Removing leading and trailing underscores
	 *
	 * @param participantName The original participant name.
	 * @returns A sanitized string suitable for use as a participant identity prefix.
	 */
	protected createParticipantIdentityPrefixFromName(participantName: string): string {
		return participantName
			.normalize('NFD') // Decompose combined characters (e.g., á -> a + ´)
			.toLowerCase() // Convert to lowercase
			.replace(/[-\s]/g, '_') // Replace hyphens and spaces with underscores
			.replace(/[^a-z0-9_]/g, '') // Allow only lowercase letters, numbers and underscores
			.replace(/_+/g, '_') // Replace multiple consecutive underscores with a single underscore
			.replace(/_+$/, '') // Remove trailing underscores
			.replace(/^_+/, ''); // Remove leading underscores
	}

	/**
	 * Releases a participant's reserved name when they disconnect from meeting.
	 * This should be called when a participant leaves the meeting to free up the name.
	 *
	 * @param roomId - The room identifier
	 * @param participantName - The participant name to release
	 */
	async releaseParticipantName(roomId: string, participantName: string): Promise<void> {
		try {
			await this.participantNameService.releaseName(roomId, participantName);
			this.logger.verbose(`Released participant name '${participantName}' for room '${roomId}'`);
		} catch (error) {
			this.logger.warn(`Error releasing participant name '${participantName}' for room '${roomId}':`, error);
		}
	}

	/**
	 * Cleans up expired participant name reservations for a meeting.
	 * This can be called during room cleanup or periodically.
	 *
	 * @param roomId - The room identifier
	 */
	async cleanupParticipantNames(roomId: string): Promise<void> {
		await this.participantNameService.cleanupExpiredReservations(roomId);
	}
}
