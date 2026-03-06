import {
	LiveKitPermissions,
	MeetParticipantModerationAction,
	MeetRoomMember,
	MeetRoomMemberField,
	MeetRoomMemberFilters,
	MeetRoomMemberOptions,
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberTokenOptions,
	MeetRoomMemberUIBadge,
	MeetRoomRoles,
	MeetRoomStatus,
	MeetUserRole,
	TrackSource
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { ParticipantInfo } from 'livekit-server-sdk';
import merge from 'lodash.merge';
import { uid as secureUid } from 'uid/secure';
import { uid } from 'uid/single';
import { MEET_ENV } from '../environment.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import {
	errorAnonymousAccessDisabled,
	errorInsufficientPermissions,
	errorInvalidRoomSecret,
	errorParticipantNotFound,
	errorRoomClosed,
	errorRoomMemberAlreadyExists,
	errorRoomMemberCannotBeOwnerOrAdmin,
	errorRoomMemberNotFound,
	errorUnauthorized,
	errorUserNotFound,
	OpenViduMeetError
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

interface ResolvedPermissionSource {
	memberId?: string;
	userId?: string;
	permissions: MeetRoomMemberPermissions;
	badge?: MeetRoomMemberUIBadge;
}

interface ParticipantMeetingMetadata extends MeetRoomMemberTokenMetadata {
	originalPermissions?: MeetRoomMemberPermissions;
}

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

		let memberId: string;
		let memberName: string;
		let accessUrl = `/room/${roomId}`;

		if (userId) {
			// Registered user
			const user = await this.userService.getUser(userId, ['userId', 'name', 'role']);

			if (!user) {
				throw errorUserNotFound(userId);
			}

			// Check if user is already a member of the room
			const memberExists = await this.isRoomMember(roomId, userId);

			if (memberExists) {
				throw errorRoomMemberAlreadyExists(roomId, userId);
			}

			// Check that user is not admin or the owner of the room
			const isOwner = await this.roomService.isRoomOwner(roomId, userId);

			if (user.role === MeetUserRole.ADMIN || isOwner) {
				throw errorRoomMemberCannotBeOwnerOrAdmin(roomId, userId);
			}

			// Use userId as memberId and user's name
			memberId = userId;
			memberName = user.name;
		} else if (name) {
			// External user
			// Generate memberId and use provided name
			memberId = `ext-${secureUid(10)}`;
			memberName = name;
			accessUrl += `?secret=${memberId}`;
		} else {
			throw new Error('Either userId or name must be provided');
		}

		// Compute effective permissions
		const { roles } = await this.roomService.getMeetRoom(roomId, ['roles']);
		const effectivePermissions = this.computeEffectivePermissions(roles, baseRole, customPermissions);

		const now = Date.now();
		const roomMember = {
			memberId,
			roomId,
			name: memberName,
			membershipDate: now,
			accessUrl,
			baseRole,
			customPermissions,
			effectivePermissions,
			permissionsUpdatedAt: now
		};
		return this.roomMemberRepository.create(roomMember);
	}

	/**
	 * Computes effective permissions by merging base role permissions with custom permissions.
	 *
	 * @param roomRoles - The room roles configuration
	 * @param baseRole - The base role of the member
	 * @param customPermissions - Optional custom permissions that override the base role
	 * @returns The effective permissions object
	 */
	protected computeEffectivePermissions(
		roomRoles: MeetRoomRoles,
		baseRole: MeetRoomMemberRole,
		customPermissions?: Partial<MeetRoomMemberPermissions>
	): MeetRoomMemberPermissions {
		const basePermissions = roomRoles[baseRole].permissions;
		return merge({}, basePermissions, customPermissions);
	}

	/**
	 * Checks if a user (registered or external) is a member of a room.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member
	 * @returns A promise that resolves to true if the user is a member, false otherwise
	 * @throws Error if room not found
	 */
	async isRoomMember(roomId: string, memberId: string): Promise<boolean> {
		// Verify room exists first
		await this.roomService.getMeetRoom(roomId, ['roomId']);
		const member = await this.roomMemberRepository.findByRoomAndMemberId(roomId, memberId, ['memberId']);
		return !!member;
	}

	/**
	 * Retrieves a specific room member by their ID.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member
	 * @param fields - Array of field names to include in the result
	 * @returns A promise that resolves to the MeetRoomMember object or null if not found
	 */
	async getRoomMember(
		roomId: string,
		memberId: string,
		fields?: MeetRoomMemberField[]
	): Promise<MeetRoomMember | null> {
		return this.roomMemberRepository.findByRoomAndMemberId(roomId, memberId, fields);
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
		const member = await this.getRoomMember(roomId, memberId, ['baseRole', 'customPermissions']);

		if (!member) {
			throw errorRoomMemberNotFound(roomId, memberId);
		}

		const nextBaseRole = updates.baseRole ?? member.baseRole;
		const nextCustomPermissions = updates.customPermissions ?? member.customPermissions;

		// Recompute effective permissions
		const { roles } = await this.roomService.getMeetRoom(roomId, ['roles']);
		const effectivePermissions = this.computeEffectivePermissions(roles, nextBaseRole, nextCustomPermissions);

		const updatedMember = await this.roomMemberRepository.updatePartial(roomId, memberId, {
			baseRole: nextBaseRole,
			customPermissions: nextCustomPermissions,
			effectivePermissions,
			permissionsUpdatedAt: Date.now()
		});

		// If member lost permission to join meeting, kick them out
		if (!effectivePermissions.canJoinMeeting) {
			await this.kickMembersFromMeetingInBatches(roomId, [memberId]);
		} else {
			// TODO: Notify participant of role/permission changes if currently in a meeting
		}

		return updatedMember;
	}

	/**
	 * Updates effective permissions for all members of a room based on the new room roles permissions.
	 * This method should be called when room roles are updated to ensure all members
	 * have their effective permissions recalculated.
	 *
	 * @param roomId - The ID of the room
	 * @param roomRoles - The updated room roles configuration
	 * @returns A promise that resolves when all members have been updated
	 */
	async updateAllRoomMemberPermissions(roomId: string, roomRoles: MeetRoomRoles): Promise<void> {
		this.logger.verbose(`Updating effective permissions for all members in room '${roomId}'`);

		const BATCH_SIZE = 20; // Process members in smaller batches
		let batchNumber = 0;
		let nextPageToken: string | undefined;
		let totalUpdated = 0;
		const membersToKick: string[] = [];

		do {
			batchNumber++;

			// Get a batch of members
			const {
				members,
				isTruncated,
				nextPageToken: token
			} = await this.getAllRoomMembers(roomId, {
				maxItems: BATCH_SIZE,
				nextPageToken,
				fields: ['memberId', 'baseRole', 'customPermissions']
			});

			if (members.length === 0) {
				break;
			}

			this.logger.verbose(`Processing batch ${batchNumber} with ${members.length} members in room '${roomId}'`);

			// Update each member's effective permissions in this batch
			const updatePromises = members.map(async (member) => {
				try {
					// Recalculate effective permissions based on new room roles
					const effectivePermissions = this.computeEffectivePermissions(
						roomRoles,
						member.baseRole,
						member.customPermissions
					);

					// Update the member with new effective permissions
					if (!effectivePermissions.canJoinMeeting) {
						membersToKick.push(member.memberId);
					}

					await this.roomMemberRepository.updatePartial(roomId, member.memberId, {
						effectivePermissions,
						permissionsUpdatedAt: Date.now()
					});

					this.logger.verbose(
						`Updated effective permissions for member '${member.memberId}' in room '${roomId}'`
					);
				} catch (error) {
					this.logger.error(
						`Failed to update effective permissions for member '${member.memberId}' in room '${roomId}':`,
						error
					);
					// Continue with other members even if one fails
				}
			});

			// Wait for all updates in this batch to complete before moving to the next batch
			await Promise.all(updatePromises);

			totalUpdated += members.length;
			nextPageToken = isTruncated ? token : undefined;

			this.logger.verbose(`Completed batch ${batchNumber}, total updated: ${totalUpdated} members`);
		} while (nextPageToken);

		if (totalUpdated === 0) {
			this.logger.verbose(`No members found in room '${roomId}' to update`);
			return;
		}

		// Kick members who lost canJoinMeeting permission
		if (membersToKick.length > 0) {
			await this.kickMembersFromMeetingInBatches(roomId, membersToKick);
		}

		this.logger.info(`Successfully updated effective permissions for ${totalUpdated} members in room '${roomId}'`);
	}

	/**
	 * Deletes a room member.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member to delete
	 */
	async deleteRoomMember(roomId: string, memberId: string): Promise<void> {
		const memberExists = await this.isRoomMember(roomId, memberId);

		if (!memberExists) {
			throw errorRoomMemberNotFound(roomId, memberId);
		}

		// If member is currently in a meeting, kick them out first
		await this.kickMembersFromMeetingInBatches(roomId, [memberId]);

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
		const membersToDelete = await this.roomMemberRepository.findByRoomAndMemberIds(roomId, memberIds, ['memberId']);
		const foundMemberIds = membersToDelete.map((m) => m.memberId);

		const failed = memberIds
			.filter((id) => !foundMemberIds.includes(id))
			.map((id) => ({ memberId: id, error: 'Room member not found' }));

		if (foundMemberIds.length > 0) {
			// Kick participants that are currently in a meeting before deletion
			await this.kickMembersFromMeetingInBatches(roomId, foundMemberIds);

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
		const {
			secret,
			joinMeeting = false,
			participantName,
			participantIdentity,
			useParticipantMetadata = false
		} = tokenOptions;

		if (joinMeeting && participantName && useParticipantMetadata) {
			if (!participantIdentity) {
				// TODO: Consider throwing a more specific error indicating that participant identity is required for token refresh when using participant metadata
				throw errorUnauthorized();
			}

			const tokenMetadata = await this.resolveTokenMetadataFromParticipant(roomId, participantIdentity);
			return this.generateTokenForJoiningMeeting(roomId, tokenMetadata, participantName, participantIdentity);
		}

		const [secretSource, authenticatedSource, room] = await Promise.all([
			secret ? this.resolvePermissionSourceFromSecret(roomId, secret) : Promise.resolve(undefined),
			this.resolvePermissionSourceFromAuthenticatedUser(roomId),
			this.roomService.getMeetRoom(roomId, ['roles'])
		]);

		if (!secretSource && !authenticatedSource) {
			throw errorUnauthorized();
		}

		const mergedPermissions = this.mergePermissions(secretSource?.permissions, authenticatedSource?.permissions);
		let badge = authenticatedSource?.badge;

		if (!badge) {
			badge = this.resolveBadgeFromPermissions(mergedPermissions, room.roles.moderator.permissions);
		}

		const tokenMetadata: MeetRoomMemberTokenMetadata = {
			iat: Date.now(),
			roomId,
			memberId: secretSource?.memberId || authenticatedSource?.memberId,
			userId: authenticatedSource?.userId,
			permissions: mergedPermissions,
			badge
		};

		if (joinMeeting && participantName) {
			tokenMetadata.livekitUrl = MEET_ENV.LIVEKIT_URL;
			return this.generateTokenForJoiningMeeting(roomId, tokenMetadata, participantName, participantIdentity);
		}

		this.logger.verbose(
			`Generating room member token for accessing room resources but not joining a meeting for room '${roomId}'`
		);
		return this.tokenService.generateRoomMemberToken({ tokenMetadata });
	}

	/**
	 * Generates a token for joining a meeting.
	 * Handles both new token generation and token refresh.
	 */
	protected async generateTokenForJoiningMeeting(
		roomId: string,
		tokenMetadata: MeetRoomMemberTokenMetadata,
		participantName: string,
		participantIdentity?: string
	): Promise<string> {
		// Check that room is open
		const { status } = await this.roomService.getMeetRoom(roomId, ['status']);

		if (status === MeetRoomStatus.CLOSED) {
			throw errorRoomClosed(roomId);
		}

		// Check that member has permission to join meeting
		if (!tokenMetadata.permissions.canJoinMeeting) {
			throw errorInsufficientPermissions();
		}

		const isRefresh = !!participantIdentity;

		if (!isRefresh) {
			// GENERATION MODE
			this.logger.verbose(
				`Generating room member token for joining a meeting for '${participantName}' in room '${roomId}'`
			);

			try {
				// Reserve a unique name for the participant
				participantName = await this.participantNameService.reserveUniqueName(roomId, participantName);
				this.logger.verbose(`Reserved unique name '${participantName}' for room '${roomId}'`);
			} catch (error) {
				this.logger.error(`Failed to reserve unique name '${participantName}' for room '${roomId}':`, error);
				throw error;
			}

			// Create the Livekit room if it doesn't exist
			await this.roomService.createLivekitRoom(roomId);

			if (tokenMetadata.memberId || tokenMetadata.userId) {
				// Use memberId as participant identity for identified members
				// (registered users or external members with a record in the database)
				// Use userId as participant identity for registered users without a member record
				participantIdentity = tokenMetadata.memberId || tokenMetadata.userId;
			} else {
				// For anonymous users, create a unique participant identity based on the provided participant name
				const identityPrefix = this.createParticipantIdentityPrefixFromName(participantName) || 'participant';
				participantIdentity = `${identityPrefix}-${uid(15)}`;
			}
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

		const livekitPermissions = this.getLiveKitPermissions(roomId, tokenMetadata.permissions);
		return this.tokenService.generateRoomMemberToken({
			tokenMetadata,
			livekitPermissions,
			participantName,
			participantIdentity
		});
	}

	protected async resolvePermissionSourceFromSecret(
		roomId: string,
		secret: string
	): Promise<ResolvedPermissionSource> {
		const isExternalMemberId = secret.startsWith('ext-');

		if (isExternalMemberId) {
			const member = await this.getRoomMember(roomId, secret);

			if (!member) {
				throw errorRoomMemberNotFound(roomId, secret);
			}

			return {
				memberId: member.memberId,
				permissions: member.effectivePermissions
			};
		}

		return this.resolveAnonymousAccessBySecret(roomId, secret);
	}

	/**
	 * Resolves anonymous access and effective permissions from a room secret.
	 *
	 * - Moderator and speaker secrets map to their room role permissions.
	 * - Recording secret maps to read-only recording permissions.
	 */
	protected async resolveAnonymousAccessBySecret(roomId: string, secret: string): Promise<ResolvedPermissionSource> {
		const { roles, access } = await this.roomService.getMeetRoom(roomId, ['roles', 'access']);
		const { moderatorSecret, speakerSecret, recordingSecret } = MeetRoomHelper.extractSecretsFromRoom(access);

		const anonymousRole: MeetRoomMemberRole | 'recording' | undefined =
			secret === moderatorSecret
				? MeetRoomMemberRole.MODERATOR
				: secret === speakerSecret
					? MeetRoomMemberRole.SPEAKER
					: secret === recordingSecret
						? 'recording'
						: undefined;

		if (!anonymousRole) {
			throw errorInvalidRoomSecret(roomId, secret);
		}

		if (!access.anonymous[anonymousRole].enabled) {
			throw errorAnonymousAccessDisabled(roomId, anonymousRole);
		}

		if (anonymousRole === 'recording') {
			return {
				permissions: this.getRecordingReadOnlyPermissions()
			};
		}

		return {
			permissions: roles[anonymousRole].permissions
		};
	}

	protected async resolvePermissionSourceFromAuthenticatedUser(
		roomId: string
	): Promise<ResolvedPermissionSource | undefined> {
		const user = this.requestSessionService.getAuthenticatedUser();

		if (!user) {
			return undefined;
		}

		const isAdmin = user.role === MeetUserRole.ADMIN;
		const isOwner = await this.roomService.isRoomOwner(roomId, user.userId);

		if (isAdmin || isOwner) {
			// Admins and room owner get all permissions without needing a member record in the database
			return {
				userId: user.userId,
				permissions: this.getAllPermissions(),
				badge: isAdmin ? MeetRoomMemberUIBadge.ADMIN : MeetRoomMemberUIBadge.OWNER
			};
		}

		const member = await this.getRoomMember(roomId, user.userId);

		if (!member) {
			return undefined;
		}

		return {
			memberId: user.userId,
			userId: user.userId,
			permissions: member.effectivePermissions
		};
	}

	protected mergePermissions(
		first?: MeetRoomMemberPermissions,
		second?: MeetRoomMemberPermissions
	): MeetRoomMemberPermissions {
		const merged = this.getNoPermissions();

		const sources = [first, second].filter(
			(permissions): permissions is MeetRoomMemberPermissions => !!permissions
		);

		for (const source of sources) {
			for (const [key, value] of Object.entries(source) as [keyof MeetRoomMemberPermissions, boolean][]) {
				merged[key] = merged[key] || value;
			}
		}

		return merged;
	}

	protected resolveBadgeFromPermissions(
		permissions: MeetRoomMemberPermissions,
		moderatorPermissions: MeetRoomMemberPermissions
	): MeetRoomMemberUIBadge {
		const hasModeratorPermissions = Object.entries(moderatorPermissions).every(([permission, allowed]) => {
			if (!allowed) {
				return true;
			}

			return permissions[permission as keyof MeetRoomMemberPermissions] === true;
		});

		return hasModeratorPermissions ? MeetRoomMemberUIBadge.MODERATOR : MeetRoomMemberUIBadge.OTHER;
	}

	protected async resolveTokenMetadataFromParticipant(
		roomId: string,
		participantIdentity: string
	): Promise<MeetRoomMemberTokenMetadata> {
		const sessionParticipantIdentity = this.requestSessionService.getParticipantIdentity();

		if (!sessionParticipantIdentity || sessionParticipantIdentity !== participantIdentity) {
			throw errorInsufficientPermissions();
		}

		const participant = await this.getParticipantFromMeeting(roomId, participantIdentity);
		const participantMetadata = this.parseParticipantMeetingMetadata(participant.metadata);

		return {
			iat: Date.now(),
			roomId,
			memberId: participantMetadata.memberId,
			userId: participantMetadata.userId,
			permissions: participantMetadata.permissions,
			badge: participantMetadata.badge,
			isPromotedModerator: participantMetadata.isPromotedModerator,
			livekitUrl: participantMetadata.livekitUrl
		};
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
	 * Gets a permission set that only allows retrieving recordings.
	 */
	getRecordingReadOnlyPermissions(): MeetRoomMemberPermissions {
		return {
			...this.getNoPermissions(),
			canRetrieveRecordings: true
		};
	}

	/**
	 * Gets the LiveKit permissions for a room member based on their Meet permissions.
	 *
	 * @param roomId - The ID of the room
	 * @returns The LiveKit permissions for the room member
	 */
	protected getLiveKitPermissions(roomId: string, permissions: MeetRoomMemberPermissions): LiveKitPermissions {
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

	async updateParticipantRole(
		roomId: string,
		participantIdentity: string,
		action: MeetParticipantModerationAction
	): Promise<void> {
		try {
			const { roles } = await this.roomService.getMeetRoom(roomId, ['roles']);
			const participant = await this.getParticipantFromMeeting(roomId, participantIdentity);
			const metadata = this.parseParticipantMeetingMetadata(participant.metadata);

			if (action === MeetParticipantModerationAction.UPGRADE) {
				if (metadata.badge !== MeetRoomMemberUIBadge.OTHER) {
					// TODO: Consider throwing a more specific error indicating that only participants with OTHER badge can be promoted to moderator
					throw errorInsufficientPermissions();
				}

				metadata.originalPermissions = metadata.permissions;
				metadata.permissions = this.mergePermissions(
					metadata.permissions,
					roles[MeetRoomMemberRole.MODERATOR].permissions
				);
				metadata.badge = MeetRoomMemberUIBadge.MODERATOR;
				metadata.isPromotedModerator = true;
			} else {
				if (
					metadata.badge !== MeetRoomMemberUIBadge.MODERATOR ||
					!metadata.isPromotedModerator ||
					!metadata.originalPermissions
				) {
					// TODO: Consider throwing a more specific error indicating that only participants with MODERATOR badge
					// that were promoted (not original moderators) can be demoted back to their original permissions
					throw errorInsufficientPermissions();
				}

				metadata.permissions = metadata.originalPermissions;
				metadata.badge = MeetRoomMemberUIBadge.OTHER;
				metadata.isPromotedModerator = undefined;
				delete metadata.originalPermissions;
			}

			await this.livekitService.updateParticipantMetadata(roomId, participantIdentity, JSON.stringify(metadata));
			await this.frontendEventService.sendParticipantRoleUpdatedSignal(
				roomId,
				participantIdentity,
				metadata.badge
			);
		} catch (error) {
			this.logger.error('Error applying participant moderation action:', error);
			throw error;
		}
	}

	/**
	 * Kicks multiple members from a meeting in batches.
	 * This method processes the kicks in parallel batches to avoid overwhelming the system.
	 *
	 * @param roomId - The ID of the room
	 * @param memberIds - Array of member IDs to kick from the meeting
	 * @param batchSize - Number of kicks to process in parallel (default: 10)
	 */
	protected async kickMembersFromMeetingInBatches(
		roomId: string,
		memberIds: string[],
		batchSize = 10
	): Promise<void> {
		if (memberIds.length === 0) {
			return;
		}

		let kickedCount = 0;
		let failedCount = 0;

		// Process kicks in batches to avoid overwhelming the system
		for (let i = 0; i < memberIds.length; i += batchSize) {
			const batch = memberIds.slice(i, i + batchSize);

			const results = await Promise.all(
				batch.map(async (memberId) => {
					try {
						await this.kickParticipantFromMeeting(roomId, memberId);
						this.logger.verbose(`Kicked participant '${memberId}' from meeting in room '${roomId}'`);
						return true;
					} catch (error) {
						const isParticipantNotFound = error instanceof OpenViduMeetError && error.statusCode === 404;

						if (!isParticipantNotFound) {
							// Real error, log warning
							this.logger.warn(
								`Failed to kick participant '${memberId}' from meeting in room '${roomId}':`,
								error
							);
							return false;
						}

						// Participant not in meeting, nothing to do
						return true;
					}
				})
			);

			// Count only successful kicks and real failures (not "participant not found")
			results.forEach((result) => {
				if (result) {
					kickedCount++;
				} else {
					failedCount++;
				}
			});
		}

		if (kickedCount > 0) {
			this.logger.info(`Kicked ${kickedCount} participant(s) from meeting in room '${roomId}'`);
		}

		if (failedCount > 0) {
			this.logger.warn(`Failed to kick ${failedCount} participant(s) from meeting in room '${roomId}'`);
		}
	}

	async kickParticipantFromMeeting(roomId: string, participantIdentity: string): Promise<void> {
		this.logger.verbose(`Kicking participant '${participantIdentity}' from room '${roomId}'`);
		return this.livekitService.deleteParticipant(roomId, participantIdentity);
	}

	protected async existsParticipantInMeeting(roomId: string, participantIdentity: string): Promise<boolean> {
		this.logger.verbose(`Checking if participant '${participantIdentity}' exists in room '${roomId}'`);
		return this.livekitService.participantExists(roomId, participantIdentity);
	}

	protected async getParticipantFromMeeting(roomId: string, participantIdentity: string): Promise<ParticipantInfo> {
		this.logger.verbose(`Fetching participant '${participantIdentity}' from room '${roomId}'`);
		return this.livekitService.getParticipant(roomId, participantIdentity);
	}

	protected parseParticipantMeetingMetadata(metadata: string): ParticipantMeetingMetadata {
		const parsed = JSON.parse(metadata || '{}') as ParticipantMeetingMetadata;
		const normalized = this.tokenService.parseRoomMemberTokenMetadata(JSON.stringify(parsed));

		return {
			...parsed,
			...normalized
		};
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
