import type { ParticipantPermission } from '@livekit/protocol';
import type {
	LiveKitPermissions,
	MeetRoom,
	MeetRoomMember,
	MeetRoomMemberField,
	MeetRoomMemberOptions,
	MeetRoomMemberPermissions,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberTokenOptions,
	MeetRoomRoles,
	ProjectedMeetRoomMember
} from '@openvidu-meet/typings';
import {
	MEET_PERMISSION_KEYS,
	MeetParticipantModerationAction,
	MeetRoomMemberRole,
	MeetRoomMemberType,
	MeetRoomMemberUIBadge,
	MeetRoomStatus,
	MeetUserRole,
	TrackSource
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { ParticipantInfo } from 'livekit-server-sdk';
import merge from 'lodash.merge';
import ms from 'ms';
import { uid as secureUid } from 'uid/secure';
import { uid } from 'uid/single';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import type { ParticipantMeetingMetadata } from '../helpers/participant.helper.js';
import { MeetParticipantHelper } from '../helpers/participant.helper.js';
import { MeetLock } from '../helpers/redis.helper.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { verifyRoomMemberToken } from '../middlewares/auth.middleware.js';
import {
	errorAnonymousAccessDisabled,
	errorInsufficientPermissions,
	errorInvalidRoomSecret,
	errorInvalidToken,
	errorMeetingFull,
	errorParticipantCannotBeDemotedFromModerator,
	errorParticipantCannotBePromotedToModerator,
	errorParticipantNameRequiredForMeetingJoin,
	errorParticipantUpdateInProgress,
	errorRoomClosed,
	errorRoomMemberAlreadyExists,
	errorRoomMemberCannotBeOwnerOrAdmin,
	errorRoomMemberNotFound,
	errorUnauthorized,
	errorUserNotFound,
	OpenViduMeetError
} from '../models/error.model.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import type {
	MeetRoomMemberPage,
	RoomMemberQuery,
	RoomMemberQueryWithFields,
	RoomMemberQueryWithProjection
} from '../types/room-member-projection.types.js';
import { runConcurrently } from '../utils/concurrency.utils.js';
import { FrontendEventService } from './frontend-event.service.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { MeetingService } from './meeting.service.js';
import { MutexService } from './mutex.service.js';
import { ParticipantNameService } from './participant-name.service.js';
import { ParticipantTokenRevocationService } from './participant-token-revocation.service.js';
import { RecordingService } from './recording.service.js';
import { RequestSessionService } from './request-session.service.js';
import { RoomService } from './room.service.js';
import { TokenService } from './token.service.js';
import { UserService } from './user.service.js';
import { WebhookDispatcherService } from './webhook-dispatcher.service.js';

interface ResolvedPermissionSource {
	memberId?: string;
	userId?: string;
	name?: string;
	permissions: MeetRoomMemberPermissions;
	badge?: MeetRoomMemberUIBadge;
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
		@inject(RequestSessionService) protected requestSessionService: RequestSessionService,
		@inject(MeetingService) protected meetingService: MeetingService,
		@inject(RecordingService) protected recordingService: RecordingService,
		@inject(WebhookDispatcherService) protected webhookDispatcherService: WebhookDispatcherService,
		@inject(ParticipantTokenRevocationService)
		protected participantTokenRevocationService: ParticipantTokenRevocationService,
		@inject(MutexService) protected mutexService: MutexService
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
		let memberType: MeetRoomMemberType;
		let accessUrl = `/room/${roomId}`;

		if (userId) {
			// User
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
			memberType = MeetRoomMemberType.USER;
		} else if (name) {
			// Identified guest
			// Generate memberId and use provided name
			memberId = `guest-${secureUid(10)}`;
			memberName = name;
			memberType = MeetRoomMemberType.IDENTIFIED_GUEST;
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
			type: memberType,
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
	 * Checks if a user or identified guest is a member of a room.
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
	async getRoomMember(roomId: string, memberId: string): Promise<MeetRoomMember | null>;

	async getRoomMember<const TFields extends readonly MeetRoomMemberField[]>(
		roomId: string,
		memberId: string,
		fields: TFields
	): Promise<ProjectedMeetRoomMember<TFields> | null>;

	async getRoomMember(
		roomId: string,
		memberId: string,
		fields?: readonly MeetRoomMemberField[]
	): Promise<MeetRoomMember | Partial<MeetRoomMember> | null>;

	async getRoomMember(
		roomId: string,
		memberId: string,
		fields?: readonly MeetRoomMemberField[]
	): Promise<MeetRoomMember | Partial<MeetRoomMember> | null> {
		return this.roomMemberRepository.findByRoomAndMemberId(roomId, memberId, fields);
	}

	/**
	 * Retrieves all members of a room with filtering and pagination.
	 *
	 * @param roomId - The ID of the room
	 * @param filters - Filters for the query
	 * @returns A promise that resolves to an object containing the members and pagination info
	 */
	async getAllRoomMembers(roomId: string, filters?: RoomMemberQuery): Promise<MeetRoomMemberPage<MeetRoomMember>>;

	async getAllRoomMembers<const TFields extends readonly MeetRoomMemberField[]>(
		roomId: string,
		filters: RoomMemberQueryWithProjection<TFields>
	): Promise<MeetRoomMemberPage<ProjectedMeetRoomMember<TFields>>>;

	async getAllRoomMembers(
		roomId: string,
		filters: RoomMemberQueryWithFields
	): Promise<MeetRoomMemberPage<MeetRoomMember | Partial<MeetRoomMember>>>;

	async getAllRoomMembers(
		roomId: string,
		filters: RoomMemberQueryWithFields = {}
	): Promise<MeetRoomMemberPage<MeetRoomMember | Partial<MeetRoomMember>>> {
		const response = await this.roomMemberRepository.findByRoomId(roomId, filters);
		return response;
	}

	/**
	 * Updates an existing room member. Only a change of its effective permissions revokes the member's
	 * earlier tokens and reaches a member in the meeting.
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
		const member = await this.getRoomMember(roomId, memberId, [
			'baseRole',
			'customPermissions',
			'effectivePermissions'
		]);

		if (!member) {
			throw errorRoomMemberNotFound(roomId, memberId);
		}

		const nextBaseRole = updates.baseRole ?? member.baseRole;
		const nextCustomPermissions = updates.customPermissions ?? member.customPermissions;

		// Recompute effective permissions
		const room = await this.roomService.getMeetRoom(roomId, ['roles', 'config']);
		const effectivePermissions = this.computeEffectivePermissions(room.roles, nextBaseRole, nextCustomPermissions);
		const permissionsChanged = MEET_PERMISSION_KEYS.some(
			(key) => effectivePermissions[key] !== member.effectivePermissions[key]
		);

		const updatedMember = await this.roomMemberRepository.updatePartial(roomId, memberId, {
			baseRole: nextBaseRole,
			customPermissions: nextCustomPermissions,
			effectivePermissions,
			...(permissionsChanged && { permissionsUpdatedAt: Date.now() })
		});

		if (!permissionsChanged) {
			return updatedMember;
		}

		if (!effectivePermissions.meetingJoin) {
			// If member lost permission to join meeting, kick them out if they are currently in a meeting
			await this.kickMembersFromMeetingInBatches(roomId, [memberId]);
		} else {
			await this.applyMemberPermissionsToMeeting(roomId, memberId, effectivePermissions, room);
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

		let batchNumber = 0;
		let nextPageToken: string | undefined;
		let totalUpdated = 0;

		do {
			batchNumber++;

			// Get a batch of members
			const {
				members,
				isTruncated,
				nextPageToken: token
			} = await this.getAllRoomMembers(roomId, {
				maxItems: 100,
				nextPageToken,
				fields: ['memberId', 'baseRole', 'customPermissions']
			});

			if (members.length === 0) {
				break;
			}

			this.logger.verbose(`Processing batch ${batchNumber} with ${members.length} members in room '${roomId}'`);

			// Update each member's effective permissions in this batch
			await runConcurrently(
				members,
				async (member) => {
					try {
						// Recalculate effective permissions based on new room roles
						const effectivePermissions = this.computeEffectivePermissions(
							roomRoles,
							member.baseRole,
							member.customPermissions
						);

						// Update the member with new effective permissions
						await this.roomMemberRepository.updatePartial(roomId, member.memberId, {
							effectivePermissions,
							permissionsUpdatedAt: Date.now()
						});

						this.logger.debug(
							`Updated effective permissions for member '${member.memberId}' in room '${roomId}'`
						);
					} catch (error) {
						this.logger.warn(
							`Failed to update effective permissions for member '${member.memberId}' in room '${roomId}':`,
							error
						);
						// Continue with other members even if one fails
					}
				},
				{ concurrency: INTERNAL_CONFIG.CONCURRENCY_BULK_UPDATE_PERMISSIONS, failFast: true }
			);

			totalUpdated += members.length;
			nextPageToken = isTruncated ? token : undefined;

			this.logger.verbose(`Completed batch ${batchNumber}, total updated: ${totalUpdated} members`);
		} while (nextPageToken);

		if (totalUpdated === 0) {
			this.logger.verbose(`No members found in room '${roomId}' to update`);
			return;
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
		const foundMemberIdsSet = new Set(foundMemberIds);

		const failed = memberIds
			.filter((id) => !foundMemberIdsSet.has(id))
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
	 * Generates a room member token.
	 *
	 * @param roomId - The room identifier
	 * @param tokenOptions - Options for token generation
	 * @param previousToken - An optional existing token to regenerate from
	 * @returns A promise that resolves to the generated token
	 */
	async generateRoomMemberToken(
		roomId: string,
		tokenOptions: MeetRoomMemberTokenOptions,
		previousToken?: string
	): Promise<string> {
		const {
			secret,
			joinMeeting = false,
			participantName,
			participantExternalId,
			participantMetadata
		} = tokenOptions;

		const [secretSource, authenticatedSource, room] = await Promise.all([
			secret ? this.resolvePermissionSourceFromSecret(roomId, secret) : Promise.resolve(undefined),
			this.resolvePermissionSourceFromAuthenticatedUser(roomId),
			this.roomService.getMeetRoom(roomId, ['roles', 'config'])
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
			badge,
			externalId: participantExternalId,
			metadata: participantMetadata
		};

		if (joinMeeting) {
			tokenMetadata.livekitUrl = MEET_ENV.LIVEKIT_URL;
			const boundName =
				secretSource?.name ||
				authenticatedSource?.name ||
				this.requestSessionService.getAuthenticatedUser()?.name;
			// An encrypted room gets the name encrypted by the client, which the server cannot check
			let resolvedParticipantName = room.config.e2ee.enabled
				? participantName || boundName
				: boundName || participantName;
			let participantIdentity: string | undefined;

			// If regenerating an existing token for joining a meeting, use the participant identity from the previous token's context
			// to ensure they keep the same identity in LiveKit and maintain their presence in the meeting.
			if (previousToken) {
				const tokenContext = await this.getValidatedRoomMemberTokenContext(roomId, previousToken);

				if (tokenContext.participantIdentity && tokenContext.participantName) {
					participantIdentity = tokenContext.participantIdentity;
					resolvedParticipantName = tokenContext.participantName;
				}

				// The app-provided correlation fields travel with the participant, not with the request:
				// keep the previous token's values unless the regeneration explicitly re-provides them.
				tokenMetadata.externalId ??= tokenContext.tokenMetadata.externalId;
				tokenMetadata.metadata ??= tokenContext.tokenMetadata.metadata;
			}

			return this.generateTokenForJoiningMeeting(
				roomId,
				tokenMetadata,
				resolvedParticipantName,
				participantIdentity
			);
		}

		this.logger.verbose(`Generating room member token for room '${roomId}' (not joining a meeting)`);
		return this.tokenService.generateRoomMemberToken({ tokenMetadata });
	}

	/**
	 * Generates a room member token for joining a meeting. This method handles both initial token generation when joining a meeting
	 * for the first time and token regeneration when refreshing an existing token while in a meeting.
	 * When regenerating a token, it ensures that the participant keeps the same identity in LiveKit to maintain their presence in the meeting
	 * and updates their permissions based on the current LiveKit participant metadata.
	 *
	 * @param roomId - The ID of the room
	 * @param tokenMetadata - The metadata to include in the token
	 * @param participantName - The name of the participant (required for initial generation)
	 * @param participantIdentity - The identity of the participant (required for regeneration)
	 * @returns A promise that resolves to the generated token
	 */
	protected async generateTokenForJoiningMeeting(
		roomId: string,
		tokenMetadata: MeetRoomMemberTokenMetadata,
		participantName?: string,
		participantIdentity?: string
	): Promise<string> {
		// Check that room is open
		const { status, roles, config } = await this.roomService.getMeetRoom(roomId, ['status', 'roles', 'config']);

		if (status === MeetRoomStatus.CLOSED) {
			throw errorRoomClosed(roomId);
		}

		// Check that member has permission to join meeting
		if (!tokenMetadata.permissions.meetingJoin) {
			throw errorInsufficientPermissions();
		}

		const isRefresh = !!participantIdentity;

		if (!isRefresh) {
			// GENERATION MODE

			// Name is required for joining a meeting
			if (!participantName) {
				throw errorParticipantNameRequiredForMeetingJoin();
			}

			const { maxParticipants } = config;

			if (maxParticipants) {
				const currentParticipantsCount = await this.meetingService.countStandardParticipants(roomId);
				const isMeetingFull = currentParticipantsCount >= maxParticipants;

				if (isMeetingFull) throw errorMeetingFull(roomId);
			}

			this.logger.verbose(
				`Generating room member token for joining a meeting for '${participantName}' in room '${roomId}'`
			);

			if (tokenMetadata.memberId || tokenMetadata.userId) {
				// Use memberId as participant identity for identified members
				// (users or identified guests with a record in the database)
				// Use userId as participant identity for users without a member record
				participantIdentity = tokenMetadata.memberId || tokenMetadata.userId;
			} else {
				// For anonymous users, create a unique participant identity based on the provided participant name
				const identityPrefix = this.createParticipantIdentityPrefixFromName(participantName) || 'participant';
				participantIdentity = `${identityPrefix}-${uid(15)}`;
			}

			try {
				// Reserve a unique name for the participant
				participantName = await this.participantNameService.reserveUniqueName(
					roomId,
					participantName,
					participantIdentity!
				);
				this.logger.verbose(`Reserved unique name '${participantName}' for room '${roomId}'`);
			} catch (error) {
				this.logger.debug(`Failed to reserve unique name '${participantName}' for room '${roomId}':`, error);
				throw error;
			}

			// Create the Livekit room if it doesn't exist
			await this.roomService.createLivekitRoom(roomId);
		} else {
			// REFRESH MODE
			this.logger.verbose(
				`Regenerating room member token for participant '${participantIdentity}' in room '${roomId}'`
			);

			const participant = await this.applyPermissionsToLiveParticipant(
				roomId,
				participantIdentity!,
				{ roles, config },
				() => {
					// Issued after any demotion that held the lock first, so the demotion does not revoke it.
					tokenMetadata.iat = Date.now();
					return tokenMetadata;
				}
			);
			participantName = participant.name || participantName;
		}

		const livekitPermissions = this.getLiveKitPermissions(roomId, tokenMetadata.permissions, config.chat.enabled);
		return this.tokenService.generateRoomMemberToken({
			tokenMetadata,
			livekitPermissions,
			participantName,
			participantIdentity
		});
	}

	/**
	 * Refreshes a room member token by verifying the previous token and generating a new one
	 * with metadata obtained from the current LiveKit participant.
	 * This method should be called when a participant wants to refresh their token while in a meeting to get updated permissions
	 * based on their current LiveKit participant metadata.
	 *
	 * The previous token gets the same checks as on any other endpoint, so a token that a change made after it
	 * invalidated cannot be renewed into one that is accepted again. A demotion is the exception: the participant is
	 * read after it, so the new token carries the restored permissions.
	 *
	 * @param roomId - The ID of the room
	 * @param previousToken - The previous room member token to refresh
	 * @returns A promise that resolves to the new refreshed token
	 * @throws Error if the previous token is invalid, expired, or if the participant is not found in the meeting,
	 * and a 409 if a change to the participant's role keeps their metadata locked for too long
	 */
	async refreshRoomMemberToken(roomId: string, previousToken: string): Promise<string> {
		const { participantIdentity, participantName, metadata, room } = await verifyRoomMemberToken(previousToken, {
			clockToleranceSeconds: INTERNAL_CONFIG.REFRESH_CLOCK_TOLERANCE_SECONDS,
			ignoreDemotion: true
		});

		if (metadata.roomId !== roomId) {
			throw errorInsufficientPermissions();
		}

		if (!participantIdentity || !participantName) {
			throw errorInvalidToken();
		}

		const tokenMetadata = await this.withParticipantMetadataLock(roomId, participantIdentity, () =>
			this.buildTokenMetadataFromParticipant(roomId, participantIdentity)
		);
		const livekitPermissions = this.getLiveKitPermissions(
			roomId,
			tokenMetadata.permissions,
			room.config.chat.enabled
		);
		return this.tokenService.generateRoomMemberToken({
			tokenMetadata,
			livekitPermissions,
			participantName: participantName,
			participantIdentity
		});
	}

	/**
	 * Validates a room member token and extracts the participant identity and name from its claims, as well as the token metadata.
	 * This method is used during token regeneration to keep the participant's identity in the meeting.
	 *
	 * @param roomId - The ID of the room
	 * @param roomMemberToken - The room member token to validate
	 * @returns An object containing the participant identity, name, and token metadata if valid
	 * @throws Error if the token is invalid, expired, or if the room ID in the token does not match
	 */
	protected async getValidatedRoomMemberTokenContext(
		roomId: string,
		roomMemberToken: string
	): Promise<{ participantIdentity?: string; participantName?: string; tokenMetadata: MeetRoomMemberTokenMetadata }> {
		try {
			const {
				sub: participantIdentity,
				name: participantName,
				metadata
			} = await this.tokenService.verifyToken(roomMemberToken, INTERNAL_CONFIG.REFRESH_CLOCK_TOLERANCE_SECONDS);

			if (!metadata) {
				throw errorInvalidToken();
			}

			const tokenMetadata = this.tokenService.parseRoomMemberTokenMetadata(metadata);

			if (tokenMetadata.roomId !== roomId) {
				throw errorInsufficientPermissions();
			}

			return { participantIdentity, participantName, tokenMetadata };
		} catch (error) {
			if (error instanceof OpenViduMeetError) {
				throw error;
			}

			this.logger.warn(
				`Room member token validation rejected for room '${roomId}': token verification failed`,
				error
			);
			throw errorInvalidToken();
		}
	}

	/**
	 * Resolves permission source from a room secret, which can be either an identified guest member secret or an anonymous access secret.
	 *
	 * - If the secret starts with 'guest-', it is treated as an identified guest member ID and looks up the corresponding member record in the database.
	 * - If the secret does not start with 'guest-', it is treated as an anonymous access secret
	 * and resolves permissions based on matching it to the room's anonymous access secrets for moderator, speaker, or recording roles.
	 *
	 * @param roomId - The ID of the room
	 * @param secret - The secret provided for access
	 * @returns The resolved permission source for the secret
	 * @throws Error if the secret is invalid, if no member is found for an identified guest member secret,
	 * or if anonymous access for the corresponding role is disabled
	 */
	protected async resolvePermissionSourceFromSecret(
		roomId: string,
		secret: string
	): Promise<ResolvedPermissionSource> {
		const isIdentifiedGuestMemberId = secret.startsWith('guest-');

		if (isIdentifiedGuestMemberId) {
			const member = await this.getRoomMember(roomId, secret, ['memberId', 'name', 'effectivePermissions']);

			if (!member) {
				throw errorRoomMemberNotFound(roomId, secret);
			}

			return {
				memberId: member.memberId,
				name: member.name,
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
	 *
	 * @param roomId - The ID of the room
	 * @param secret - The secret provided for anonymous access
	 * @returns The resolved permission source for the anonymous user
	 * @throws Error if the secret is invalid or if anonymous access for the corresponding role is disabled
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
			throw errorInvalidRoomSecret(roomId);
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

	/**
	 * Resolves permission source for an authenticated user by checking their role, room ownership, and membership.
	 * Users without a member record may still get permissions based on user access settings.
	 *
	 * @param roomId - The ID of the room
	 * @returns The resolved permission source for the authenticated user, or undefined if no access
	 */
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
				name: user.name,
				permissions: this.getAllPermissions(),
				badge: isOwner ? MeetRoomMemberUIBadge.OWNER : MeetRoomMemberUIBadge.ADMIN
			};
		}

		const member = await this.getRoomMember(roomId, user.userId, ['name', 'effectivePermissions']);

		if (member) {
			return {
				memberId: user.userId,
				userId: user.userId,
				name: member.name,
				permissions: member.effectivePermissions
			};
		}

		// If user is not a member, they may still have access if user access is enabled,
		// granting them the speaker role permissions as a default for users without a member record.
		const { access, roles } = await this.roomService.getMeetRoom(roomId, ['access', 'roles']);

		if (!access.user.enabled) {
			return undefined;
		}

		return {
			userId: user.userId,
			name: user.name,
			permissions: roles.speaker.permissions
		};
	}

	/**
	 * Merges two sets of permissions by taking the logical OR of each permission field.
	 * If a permission is true in either set, it will be true in the merged result.
	 *
	 * @param first - The first set of permissions to merge
	 * @param second - The second set of permissions to merge
	 * @returns The merged permissions object
	 */
	protected mergePermissions(
		first?: MeetRoomMemberPermissions,
		second?: MeetRoomMemberPermissions
	): MeetRoomMemberPermissions {
		const sources = [first, second].filter((p): p is MeetRoomMemberPermissions => !!p);
		const basePermissions = this.getNoPermissions();

		return (Object.keys(basePermissions) as Array<keyof MeetRoomMemberPermissions>).reduce(
			(merged, permission) => ({
				...merged,
				[permission]: sources.some((source) => source[permission] === true)
			}),
			basePermissions
		);
	}

	/**
	 * Determines the UI badge for a room member based on their permissions compared to moderator permissions.
	 *
	 * @param permissions - The effective permissions of the room member
	 * @param moderatorPermissions - The permissions associated with the moderator role for the room
	 * @returns The UI badge to display for the room member (MODERATOR or OTHER)
	 */
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

	/**
	 * Builds token metadata for a room member token based on the current LiveKit participant metadata.
	 * This is used when refreshing a token while in a meeting to ensure the new token reflects any permission changes
	 * that may have occurred during the meeting (e.g., being promoted to moderator).
	 *
	 * @param roomId - The ID of the room
	 * @param participantIdentity - The LiveKit identity of the participant
	 * @returns The token metadata to include in the refreshed token
	 */
	protected async buildTokenMetadataFromParticipant(
		roomId: string,
		participantIdentity: string
	): Promise<MeetRoomMemberTokenMetadata> {
		const participant = await this.getParticipantFromMeeting(roomId, participantIdentity);
		const participantMetadata = MeetParticipantHelper.parseOwnMeetingMetadata(participant);

		return {
			iat: Date.now(),
			roomId,
			memberId: participantMetadata.memberId,
			userId: participantMetadata.userId,
			permissions: participantMetadata.permissions,
			badge: participantMetadata.badge,
			isPromotedModerator: participantMetadata.isPromotedModerator,
			livekitUrl: participantMetadata.livekitUrl,
			externalId: participantMetadata.externalId,
			metadata: participantMetadata.metadata
		};
	}

	/**
	 * Gets all permissions set to true.
	 */
	getAllPermissions(): MeetRoomMemberPermissions {
		return {
			recordingControl: true,
			recordingList: true,
			recordingPlay: true,
			recordingDownload: true,
			recordingDelete: true,
			meetingJoin: true,
			meetingRead: true,
			roomShareAccessLinks: true,
			participantPromote: true,
			participantKick: true,
			participantMute: true,
			participantHandLower: true,
			participantReactionSend: true,
			meetingEnd: true,
			mediaPublishVideo: true,
			mediaPublishAudio: true,
			mediaShareScreen: true,
			chatRead: true,
			chatWrite: true,
			mediaChangeVirtualBackground: true
		};
	}

	/**
	 * Gets all permissions set to false.
	 */
	getNoPermissions(): MeetRoomMemberPermissions {
		return {
			recordingControl: false,
			recordingList: false,
			recordingPlay: false,
			recordingDownload: false,
			recordingDelete: false,
			meetingJoin: false,
			meetingRead: false,
			roomShareAccessLinks: false,
			participantPromote: false,
			participantKick: false,
			participantMute: false,
			participantHandLower: false,
			participantReactionSend: false,
			meetingEnd: false,
			mediaPublishVideo: false,
			mediaPublishAudio: false,
			mediaShareScreen: false,
			chatRead: false,
			chatWrite: false,
			mediaChangeVirtualBackground: false
		};
	}

	/**
	 * Gets a permission set that only allows retrieving recordings.
	 *
	 * Grants the whole retrieval group (list + play + download), preserving what the pre-split
	 * `canRetrieveRecordings: true` granted to public recording links. Narrowing the link to
	 * `recordingPlay` only (the use case the split enables) is a behavior change for existing
	 * deployments and needs its own sign-off — see §8.11 of the migration plan.
	 */
	getRecordingReadOnlyPermissions(): MeetRoomMemberPermissions {
		return {
			...this.getNoPermissions(),
			recordingList: true,
			recordingPlay: true,
			recordingDownload: true
		};
	}

	/**
	 * Gets the LiveKit permissions for a room member based on their Meet permissions.
	 *
	 * @param roomId - The ID of the room
	 * @param chatEnabled - The room's `config.chat.enabled`
	 * @returns The LiveKit permissions for the room member
	 */
	protected getLiveKitPermissions(
		roomId: string,
		permissions: MeetRoomMemberPermissions,
		chatEnabled: boolean
	): LiveKitPermissions {
		return {
			room: roomId,
			roomJoin: true,
			canSubscribe: true,
			canUpdateOwnMetadata: false,
			...this.buildPublishGrant(permissions, chatEnabled)
		};
	}

	/**
	 * The grant fields a participant's Meet permissions and the room's chat switch decide: media sources
	 * and data channel. Chat is the only data a participant publishes.
	 */
	private buildPublishGrant(
		permissions: MeetRoomMemberPermissions,
		chatEnabled: boolean
	): Pick<LiveKitPermissions, 'canPublish' | 'canPublishSources' | 'canPublishData'> {
		const canPublishSources: TrackSource[] = [];

		if (permissions.mediaPublishAudio) {
			canPublishSources.push(TrackSource.MICROPHONE);
		}

		if (permissions.mediaPublishVideo) {
			canPublishSources.push(TrackSource.CAMERA);
		}

		if (permissions.mediaShareScreen) {
			canPublishSources.push(TrackSource.SCREEN_SHARE);
			canPublishSources.push(TrackSource.SCREEN_SHARE_AUDIO);
		}

		return {
			canPublish: permissions.mediaPublishAudio || permissions.mediaPublishVideo || permissions.mediaShareScreen,
			canPublishSources,
			canPublishData: chatEnabled && permissions.chatWrite
		};
	}

	/**
	 * Builds the LiveKit grant to push to a participant whose permissions changed mid-meeting.
	 */
	protected buildLiveParticipantPermission(
		currentPermission: ParticipantInfo['permission'],
		permissions: MeetRoomMemberPermissions,
		chatEnabled: boolean
	): Partial<ParticipantPermission> | undefined {
		if (!currentPermission) {
			return undefined;
		}

		return { ...currentPermission, ...this.buildPublishGrant(permissions, chatEnabled) };
	}

	/**
	 * Applies a moderation action to a participant currently in a meeting.
	 *
	 * - `UPGRADE`: promotes an eligible participant to moderator by merging moderator permissions.
	 * - `DOWNGRADE`: reverts a promoted moderator to their original permissions.
	 *
	 * After updating participant metadata in LiveKit, which is what tells the affected participant to
	 * refresh their token, it reports the change through the `participantRoleChanged` webhook. A demotion
	 * also revokes the room member tokens the participant was issued until then, which still carry the
	 * moderator permissions.
	 *
	 * @param roomId - The ID of the room where the participant is connected.
	 * @param participantIdentity - The LiveKit identity of the participant to moderate.
	 * @param action - The moderation action to apply.
	 */

	async updateParticipantRole(
		roomId: string,
		participantIdentity: string,
		action: MeetParticipantModerationAction
	): Promise<void> {
		try {
			const { roles, roomName, config } = await this.roomService.getMeetRoom(roomId, [
				'roles',
				'roomName',
				'config'
			]);
			const updatedParticipant = await this.withParticipantMetadataLock(roomId, participantIdentity, async () => {
				const participant = await this.getParticipantFromMeeting(roomId, participantIdentity);
				const metadata = MeetParticipantHelper.requireMeetingMetadata(participant, roomId);

				if (action === MeetParticipantModerationAction.UPGRADE) {
					if (metadata.badge !== MeetRoomMemberUIBadge.OTHER) {
						throw errorParticipantCannotBePromotedToModerator(participantIdentity, roomId);
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
						throw errorParticipantCannotBeDemotedFromModerator(participantIdentity, roomId);
					}

					metadata.permissions = metadata.originalPermissions;
					metadata.badge = MeetRoomMemberUIBadge.OTHER;
					metadata.isPromotedModerator = undefined;
					delete metadata.originalPermissions;
				}

				const permission = this.buildLiveParticipantPermission(
					participant.permission,
					metadata.permissions,
					config.chat.enabled
				);
				const updatedParticipant = await this.livekitService.updateParticipant(roomId, participantIdentity, {
					metadata: JSON.stringify(metadata),
					permission
				});

				if (action === MeetParticipantModerationAction.DOWNGRADE) {
					await this.participantTokenRevocationService.revokeIssuedTokens(roomId, participantIdentity);
				}

				return updatedParticipant;
			});

			this.webhookDispatcherService.sendParticipantRoleChangedWebhook({
				roomId,
				roomName,
				participant: MeetParticipantHelper.toParticipantInfo(updatedParticipant)
			});

			if (action === MeetParticipantModerationAction.UPGRADE) {
				void this.reevaluateRecordingAutoStart(roomId, updatedParticipant);
			}
		} catch (error) {
			this.logger.warn(
				`Error applying participant moderation action in room '${roomId}' for participant '${participantIdentity}'`,
				error
			);
			throw error;
		}
	}

	/**
	 * Applies new base permissions to a participant in the meeting from the server: their LiveKit metadata and
	 * grant. A participant promoted to moderator stays promoted, with the new permissions as the ones a demotion
	 * restores.
	 *
	 * @param roomId - The ID of the room
	 * @param participantIdentity - The LiveKit identity of the participant
	 * @param room - The room's roles and config
	 * @param buildMetadata - Builds the participant's metadata, with their new base permissions and badge, from
	 * their current one
	 * @returns The participant as it was before the update
	 */
	protected async applyPermissionsToLiveParticipant(
		roomId: string,
		participantIdentity: string,
		{ roles, config }: Pick<MeetRoom, 'roles' | 'config'>,
		buildMetadata: (current: ParticipantMeetingMetadata) => ParticipantMeetingMetadata
	): Promise<ParticipantInfo> {
		return this.withParticipantMetadataLock(roomId, participantIdentity, async () => {
			const participant = await this.getParticipantFromMeeting(roomId, participantIdentity);
			const current = MeetParticipantHelper.parseOwnMeetingMetadata(participant);
			const metadata = buildMetadata(current);

			if (current.isPromotedModerator && metadata.badge === MeetRoomMemberUIBadge.OTHER) {
				metadata.originalPermissions = metadata.permissions;
				metadata.permissions = this.mergePermissions(
					metadata.permissions,
					roles[MeetRoomMemberRole.MODERATOR].permissions
				);
				metadata.badge = MeetRoomMemberUIBadge.MODERATOR;
				metadata.isPromotedModerator = true;
			}

			await this.livekitService.updateParticipant(roomId, participantIdentity, {
				metadata: JSON.stringify(metadata),
				permission: this.buildLiveParticipantPermission(
					participant.permission,
					metadata.permissions,
					config.chat.enabled
				)
			});
			return participant;
		});
	}

	/**
	 * Applies a member's new permissions to their participant in the meeting, if they are in it, and signals
	 * their client to renew its token so the meeting interface follows. When a role change keeps the
	 * participant locked for too long, the renewal alone carries the new permissions.
	 *
	 * @param roomId - The ID of the room
	 * @param memberId - The ID of the member, which is their participant identity
	 * @param permissions - The member's new effective permissions
	 * @param room - The room's roles and config
	 */
	protected async applyMemberPermissionsToMeeting(
		roomId: string,
		memberId: string,
		permissions: MeetRoomMemberPermissions,
		room: Pick<MeetRoom, 'roles' | 'config'>
	): Promise<void> {
		const badge = this.resolveBadgeFromPermissions(
			permissions,
			room.roles[MeetRoomMemberRole.MODERATOR].permissions
		);

		try {
			await this.applyPermissionsToLiveParticipant(roomId, memberId, room, (current) =>
				current.memberId === memberId
					? { ...current, permissions, badge, isPromotedModerator: undefined, originalPermissions: undefined }
					: current
			);
		} catch (error) {
			if (!(error instanceof OpenViduMeetError) || ![404, 409].includes(error.statusCode)) {
				throw error;
			}

			if (error.statusCode === 404) {
				this.logger.verbose(`Member '${memberId}' is not in the meeting of room '${roomId}'`);
				return;
			}

			this.logger.warn(`Could not apply the new permissions of member '${memberId}' in room '${roomId}':`, error);
		}

		await this.frontendEventService.sendParticipantPermissionsUpdatedSignal(roomId, memberId);
	}

	/**
	 * Runs a read, or a read-modify-write, of a participant's LiveKit metadata while holding their lock,
	 * so a role change, a token regeneration and a token refresh never act on each other's half-applied
	 * update. A caller that finds the lock taken waits for it; one that keeps finding it taken is refused.
	 */
	protected async withParticipantMetadataLock<T>(
		roomId: string,
		participantIdentity: string,
		update: () => Promise<T>
	): Promise<T> {
		const result = await this.mutexService.withRetryLock(
			MeetLock.getParticipantMetadataLock(roomId, participantIdentity),
			ms(INTERNAL_CONFIG.PARTICIPANT_METADATA_LOCK_TTL),
			update,
			INTERNAL_CONFIG.PARTICIPANT_METADATA_LOCK_MAX_ATTEMPTS,
			ms(INTERNAL_CONFIG.PARTICIPANT_METADATA_LOCK_RETRY_DELAY)
		);

		if (result === null) {
			throw errorParticipantUpdateInProgress(participantIdentity, roomId);
		}

		return result;
	}

	/**
	 * A promotion reaches the `when_moderator_joins` auto-start threshold, which no join webhook
	 * reports. Detached: starting a recording is a LiveKit round trip the promotion must not wait on.
	 */
	private async reevaluateRecordingAutoStart(roomId: string, candidate: ParticipantInfo): Promise<void> {
		try {
			const room = await this.livekitService.getRoom(roomId);
			await this.recordingService.startAutoRecordingIfNeeded(room, candidate);
		} catch (error) {
			this.logger.warn(
				`Error re-evaluating the recording auto-start in room '${roomId}' after promoting '${candidate.identity}'`,
				error
			);
		}
	}

	/**
	 * Sends a signal to the participant to regenerate their token and update their permissions in real-time.
	 * This is used after a participant's permissions have been updated while they are in a meeting.
	 *
	 * @param roomId - The ID of the room
	 * @param participantIdentity - The identity of the participant to send the signal to
	 */
	async notifyParticipantPermissionsUpdate(roomId: string, participantIdentity: string): Promise<void> {
		const isParticipantInMeeting = await this.existsParticipantInMeeting(roomId, participantIdentity);

		if (!isParticipantInMeeting) {
			this.logger.verbose(
				`Not sending permissions updated signal to participant '${participantIdentity}' in room '${roomId}' because they are not currently in a meeting`
			);
			return;
		}

		await this.frontendEventService.sendParticipantPermissionsUpdatedSignal(roomId, participantIdentity);
	}

	/**
	 * Kicks multiple members from a meeting in batches.
	 * This method processes the kicks in parallel batches to avoid overwhelming the system.
	 *
	 * @param roomId - The ID of the room
	 * @param memberIds - Array of member IDs to kick from the meeting
	 * @param concurrency - Number of kicks to process in parallel (default: {@link INTERNAL_CONFIG.CONCURRENCY_BULK_KICK_MEMBERS})
	 */
	protected async kickMembersFromMeetingInBatches(
		roomId: string,
		memberIds: string[],
		concurrency = INTERNAL_CONFIG.CONCURRENCY_BULK_KICK_MEMBERS
	): Promise<void> {
		if (memberIds.length === 0) {
			return;
		}

		type KickOutcome = 'kicked' | 'skipped' | 'failed';

		const kickResults = await runConcurrently<string, KickOutcome>(
			memberIds,
			async (memberId) => {
				try {
					await this.kickParticipantFromMeeting(roomId, memberId);
					this.logger.verbose(`Kicked participant '${memberId}' from meeting in room '${roomId}'`);
					return 'kicked';
				} catch (error) {
					const isParticipantNotFound = error instanceof OpenViduMeetError && error.statusCode === 404;

					if (!isParticipantNotFound) {
						// Real error, log warning
						this.logger.warn(
							`Failed to kick participant '${memberId}' from meeting in room '${roomId}':`,
							error
						);
						return 'failed';
					}

					// Participant not in meeting, nothing to do
					this.logger.verbose(
						`Skipping participant '${memberId}' in room '${roomId}' because they are not in the meeting`
					);
					return 'skipped';
				}
			},
			{ concurrency, failFast: true }
		);

		let kickedCount = 0;
		let skippedCount = 0;
		let failedCount = 0;

		// Count outcomes separately to distinguish real kicks from skipped/non-present members.
		kickResults.forEach((result) => {
			if (result === 'kicked') {
				kickedCount++;
			} else if (result === 'skipped') {
				skippedCount++;
			} else {
				failedCount++;
			}
		});

		if (kickedCount > 0) {
			this.logger.info(`Kicked ${kickedCount} participant(s) from meeting in room '${roomId}'`);
		}

		if (failedCount > 0) {
			this.logger.warn(`Failed to kick ${failedCount} participant(s) from meeting in room '${roomId}'`);
		}

		if (skippedCount > 0) {
			this.logger.verbose(`Skipped ${skippedCount} participant(s) not present in meeting in room '${roomId}'`);
		}
	}

	async kickParticipantFromMeeting(roomId: string, participantIdentity: string): Promise<void> {
		this.logger.verbose(`Kicking participant '${participantIdentity}' from room '${roomId}'`);
		return this.livekitService.deleteParticipant(roomId, participantIdentity);
	}

	protected async existsParticipantInMeeting(roomId: string, participantIdentity: string): Promise<boolean> {
		this.logger.debug(`Checking if participant '${participantIdentity}' exists in room '${roomId}'`);
		return this.livekitService.participantExists(roomId, participantIdentity);
	}

	protected async getParticipantFromMeeting(roomId: string, participantIdentity: string): Promise<ParticipantInfo> {
		this.logger.debug(`Fetching participant '${participantIdentity}' from room '${roomId}'`);
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
	 * Releases the name a participant's session reserved when that session leaves the meeting, unless a
	 * newer session of the same participant took it over meanwhile.
	 *
	 * @param roomId - The room identifier
	 * @param participant - The participant whose session left
	 */
	async releaseParticipantName(roomId: string, participant: ParticipantInfo): Promise<void> {
		const { name, identity } = participant;

		try {
			await this.participantNameService.releaseName(
				roomId,
				name,
				identity,
				MeetParticipantHelper.extractJoinDate(participant)
			);
		} catch (error) {
			this.logger.warn(`Error releasing participant name '${name}' for room '${roomId}':`, error);
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
