import type { ParticipantPermission } from '@livekit/protocol';
import type {
	LiveKitPermissions,
	MeetWaitingRoomTicketResponse,
	MeetRoom,
	MeetRoomField,
	MeetRoomMember,
	MeetRoomMemberField,
	MeetRoomMemberOptions,
	MeetRoomMemberPermissions,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberTokenOptions,
	ProjectedMeetRoom,
	ProjectedMeetRoomMember
} from '@openvidu-meet/typings';
import {
	MEET_PERMISSION_KEYS,
	MeetWaitingRoomStatus,
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
import ms from 'ms';
import { uid as secureUid } from 'uid/secure';
import { uid } from 'uid/single';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import type { ParticipantMeetingMetadata } from '../helpers/participant.helper.js';
import { MeetParticipantHelper } from '../helpers/participant.helper.js';
import { MeetLock } from '../helpers/redis.helper.js';
import { MeetRoomMemberHelper } from '../helpers/room-member.helper.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
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
	errorWaitingRoomWaitEnded,
	OpenViduMeetError
} from '../models/error.model.js';
import type { WaitingRoomWait } from '../models/waiting-room.model.js';
import { RoomMemberRepository } from '../repositories/room-member.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import type {
	MeetRoomMemberPage,
	RoomMemberQuery,
	RoomMemberQueryWithFields,
	RoomMemberQueryWithProjection
} from '../types/room-member-projection.types.js';
import { runConcurrently } from '../utils/concurrency.utils.js';
import { FrontendEventService } from './frontend-event.service.js';
import { LiveKitService } from './livekit.service.js';
import { WaitingRoomAdmissionPolicy } from './waiting-room/waiting-room-admission.policy.js';
import { WaitingRoomService } from './waiting-room/waiting-room.service.js';
import { LoggerService } from './logger.service.js';
import { MeetingService } from './meeting.service.js';
import { MutexService } from './mutex.service.js';
import { ParticipantNameService } from './participant-name.service.js';
import { ParticipantTokenRevocationService } from './participant-token-revocation.service.js';
import { RecordingService } from './recording.service.js';
import { RequestSessionService } from './request-session.service.js';
import { RoomService } from './room.service.js';
import { TokenService } from './token.service.js';
import { WebhookDispatcherService } from './webhook-dispatcher.service.js';

interface ResolvedPermissionSource {
	memberId?: string;
	userId?: string;
	name?: string;
	permissions: MeetRoomMemberPermissions;
	badge?: MeetRoomMemberUIBadge;
}

/** What a token request answers: a token, or the ticket of the wait of a participant who has to wait. */
export type RoomMemberTokenAnswer = { token: string } | MeetWaitingRoomTicketResponse;

const ROOM_TO_JOIN_FIELDS = [
	'roomId',
	'roomName',
	'status',
	'roles',
	'config',
	'rolesUpdatedAt'
] as const satisfies readonly MeetRoomField[];

type RoomToJoin = ProjectedMeetRoom<typeof ROOM_TO_JOIN_FIELDS>;

/**
 * Service for managing room members and meeting participants.
 */
@injectable()
export class RoomMemberService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(RoomMemberRepository) protected roomMemberRepository: RoomMemberRepository,
		@inject(RoomService) protected roomService: RoomService,
		@inject(UserRepository) protected userRepository: UserRepository,
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
		@inject(MutexService) protected mutexService: MutexService,
		@inject(WaitingRoomService) protected waitingRoomService: WaitingRoomService,
		@inject(WaitingRoomAdmissionPolicy) protected waitingRoomAdmissionPolicy: WaitingRoomAdmissionPolicy
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
			const user = await this.userRepository.findByUserId(userId, ['userId', 'name', 'role']);

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
			accessUrl += `?secret=${memberId}-${secureUid(10)}`;
		} else {
			throw new Error('Either userId or name must be provided');
		}

		// Compute effective permissions
		const { roles } = await this.roomService.getMeetRoom(roomId, ['roles']);
		const effectivePermissions = MeetRoomMemberHelper.computeEffectivePermissions(
			roles,
			baseRole,
			customPermissions
		);

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
		const effectivePermissions = MeetRoomMemberHelper.computeEffectivePermissions(
			room.roles,
			nextBaseRole,
			nextCustomPermissions
		);
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
	 * Generates a room member token, or, for a participant who has to wait in the room's waiting room, the
	 * ticket of their wait.
	 *
	 * @param roomId - The room identifier
	 * @param tokenOptions - Options for token generation
	 * @param previousToken - An optional existing token to regenerate from, ignored with a `waitingRoomTicket`
	 * @returns A promise that resolves to the generated token or to the ticket of the wait
	 */
	async generateRoomMemberToken(
		roomId: string,
		tokenOptions: MeetRoomMemberTokenOptions,
		previousToken?: string
	): Promise<RoomMemberTokenAnswer> {
		const {
			secret,
			joinMeeting = false,
			participantName,
			participantExternalId,
			participantMetadata,
			waitingRoomTicket
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

		if (!joinMeeting) {
			this.logger.verbose(`Generating room member token for room '${roomId}' (not joining a meeting)`);
			return { token: await this.tokenService.generateRoomMemberToken({ tokenMetadata }) };
		}

		tokenMetadata.livekitUrl = MEET_ENV.LIVEKIT_URL;

		if (waitingRoomTicket) {
			return this.joinWithWaitingRoomTicket(roomId, waitingRoomTicket, tokenMetadata);
		}

		const boundName =
			secretSource?.name || authenticatedSource?.name || this.requestSessionService.getAuthenticatedUser()?.name;
		// An encrypted room gets the name encrypted by the client, which the server cannot check
		const resolvedParticipantName = room.config.e2ee.enabled
			? participantName || boundName
			: boundName || participantName;

		if (previousToken) {
			const tokenContext = await this.getValidatedRoomMemberTokenContext(roomId, previousToken);

			// The app-provided correlation fields travel with the participant, not with the request:
			// keep the previous token's values unless the regeneration explicitly re-provides them.
			tokenMetadata.externalId ??= tokenContext.tokenMetadata.externalId;
			tokenMetadata.metadata ??= tokenContext.tokenMetadata.metadata;

			// A participant regenerating their token keeps their identity in LiveKit and their presence in the meeting.
			if (tokenContext.participantIdentity && tokenContext.participantName) {
				return {
					token: await this.regenerateJoinToken(
						roomId,
						tokenMetadata,
						tokenContext.participantName,
						tokenContext.participantIdentity
					)
				};
			}
		}

		return this.generateTokenForJoiningMeeting(roomId, tokenMetadata, resolvedParticipantName);
	}

	/**
	 * Answers a participant asking to join a meeting: a join token, or the ticket of a new wait when the
	 * room's waiting room applies to them. A wait reserves, creates and counts nothing.
	 *
	 * @param roomId - The ID of the room
	 * @param tokenMetadata - The metadata to include in the token
	 * @param participantName - The name of the participant
	 * @returns A promise that resolves to the join token or to the ticket of the wait
	 */
	protected async generateTokenForJoiningMeeting(
		roomId: string,
		tokenMetadata: MeetRoomMemberTokenMetadata,
		participantName?: string
	): Promise<RoomMemberTokenAnswer> {
		const room = await this.getRoomToJoin(roomId);
		this.assertCanJoin(room, tokenMetadata);
		const name = this.requireParticipantName(participantName);
		const participantIdentity = this.createParticipantIdentity(tokenMetadata, name);

		if (this.waitingRoomAdmissionPolicy.mustWait(room.config, tokenMetadata.permissions)) {
			const { memberId, userId, externalId, metadata } = tokenMetadata;
			return this.waitingRoomService.knock(room, {
				participantIdentity,
				participantName: name,
				externalId,
				metadata,
				memberId,
				userId
			});
		}

		await this.assertCapacity(room);
		return { token: await this.joinMeeting(room, tokenMetadata, name, participantIdentity) };
	}

	/**
	 * Answers a participant asking to join with the ticket of their wait, by the state of the wait: the
	 * ticket again while waiting or when an admitted participant finds the meeting full, a join token once
	 * admitted, and a `409` for a wait that ended otherwise. A ticket never starts a new wait.
	 *
	 * @throws The `403` error when the request's credential resolves to another principal than the wait's,
	 * the `409` wait ended error, and the usual errors of a join
	 */
	protected async joinWithWaitingRoomTicket(
		roomId: string,
		waitingRoomTicket: string,
		tokenMetadata: MeetRoomMemberTokenMetadata
	): Promise<RoomMemberTokenAnswer> {
		const wait = await this.waitingRoomService.findWait(waitingRoomTicket);
		const answer = this.waitingRoomAdmissionPolicy.answerTicket(wait, roomId, tokenMetadata);

		if (answer.kind === 'forbidden') throw errorInsufficientPermissions();

		if (answer.kind === 'ended') throw errorWaitingRoomWaitEnded(answer.status);

		const { participantIdentity, participantName, externalId, metadata } = wait!.participant;

		if (answer.kind === 'waiting') return this.waitingRoomService.ticketOf(waitingRoomTicket, wait!.participant);

		Object.assign(tokenMetadata, { externalId, metadata });
		const room = await this.getRoomToJoin(roomId);
		this.assertCanJoin(room, tokenMetadata);

		if (answer.kind === 'rejoin') {
			if (this.waitingRoomAdmissionPolicy.mustWait(room.config, tokenMetadata.permissions)) {
				throw errorWaitingRoomWaitEnded(MeetWaitingRoomStatus.ADMITTED);
			}

			await this.assertCapacity(room);
			return { token: await this.joinMeeting(room, tokenMetadata, participantName, participantIdentity) };
		}

		if (await this.isMeetingFull(room)) {
			const change = await this.waitingRoomService.returnToLine(wait!);

			if (!('entry' in change)) throw errorWaitingRoomWaitEnded(change.status);

			return this.waitingRoomService.ticketOf(waitingRoomTicket, change.entry);
		}

		return {
			token: await this.joinMeeting(room, tokenMetadata, participantName, participantIdentity, () =>
				this.consumeAdmission(wait!)
			)
		};
	}

	/**
	 * Regenerates the join token of a participant connected to the meeting, keeping their identity and
	 * applying their current permissions to their LiveKit participant.
	 */
	protected async regenerateJoinToken(
		roomId: string,
		tokenMetadata: MeetRoomMemberTokenMetadata,
		participantName: string,
		participantIdentity: string
	): Promise<string> {
		const room = await this.getRoomToJoin(roomId);
		this.assertCanJoin(room, tokenMetadata);
		this.logger.verbose(
			`Regenerating room member token for participant '${participantIdentity}' in room '${roomId}'`
		);

		const participant = await this.applyPermissionsToLiveParticipant(
			roomId,
			participantIdentity,
			room,
			() => tokenMetadata,
			room.rolesUpdatedAt
		);
		return this.mintJoinToken(room, tokenMetadata, participant.name || participantName, participantIdentity);
	}

	protected getRoomToJoin(roomId: string): Promise<RoomToJoin> {
		return this.roomService.getMeetRoom(roomId, ROOM_TO_JOIN_FIELDS);
	}

	/**
	 * @throws The `409` room closed error, or the `403` error when the participant may not join meetings
	 */
	protected assertCanJoin(room: RoomToJoin, tokenMetadata: MeetRoomMemberTokenMetadata): void {
		if (room.status === MeetRoomStatus.CLOSED) {
			throw errorRoomClosed(room.roomId);
		}

		if (!tokenMetadata.permissions.meetingJoin) {
			throw errorInsufficientPermissions();
		}
	}

	protected requireParticipantName(participantName?: string): string {
		if (!participantName) {
			throw errorParticipantNameRequiredForMeetingJoin();
		}

		return participantName;
	}

	/**
	 * The identity of a participant in the meeting: their `memberId` or `userId` when the credential has one,
	 * and otherwise a unique identity made from their name.
	 */
	protected createParticipantIdentity(tokenMetadata: MeetRoomMemberTokenMetadata, participantName: string): string {
		const { memberId, userId } = tokenMetadata;

		if (memberId || userId) {
			return (memberId || userId)!;
		}

		const identityPrefix = this.createParticipantIdentityPrefixFromName(participantName) || 'participant';
		return `${identityPrefix}-${uid(15)}`;
	}

	protected async isMeetingFull(room: RoomToJoin): Promise<boolean> {
		const { maxParticipants } = room.config;
		return (
			!!maxParticipants && (await this.meetingService.countStandardParticipants(room.roomId)) >= maxParticipants
		);
	}

	/**
	 * @throws The `409` meeting full error when the meeting has as many participants as the room allows
	 */
	protected async assertCapacity(room: RoomToJoin): Promise<void> {
		if (await this.isMeetingFull(room)) throw errorMeetingFull(room.roomId);
	}

	/**
	 * Joins a participant to the room's meeting: stamps the token issue, reserves a unique name, creates the
	 * LiveKit room, which starts the meeting, and mints the join token, running `beforeMint` right before it.
	 */
	protected async joinMeeting(
		room: RoomToJoin,
		tokenMetadata: MeetRoomMemberTokenMetadata,
		participantName: string,
		participantIdentity: string,
		beforeMint?: () => Promise<void>
	): Promise<string> {
		const { roomId } = room;
		this.logger.verbose(
			`Generating room member token for joining a meeting for '${participantName}' in room '${roomId}'`
		);
		Object.assign(
			tokenMetadata,
			await this.participantTokenRevocationService.getTokenIssue(roomId, participantIdentity)
		);

		const uniqueName = await this.participantNameService.reserveUniqueName(
			roomId,
			participantName,
			participantIdentity
		);
		this.logger.verbose(`Reserved unique name '${uniqueName}' for room '${roomId}'`);

		await this.roomService.createLivekitRoom(roomId);
		await beforeMint?.();
		return this.mintJoinToken(room, tokenMetadata, uniqueName, participantIdentity);
	}

	/**
	 * Uses the admission of a wait to issue its join token.
	 *
	 * @throws The `409` wait ended error when the wait is no longer admitted or its admission was used
	 */
	protected async consumeAdmission(wait: WaitingRoomWait): Promise<void> {
		const change = await this.waitingRoomService.consume(wait);

		if (!('entry' in change)) throw errorWaitingRoomWaitEnded(change.status);
	}

	protected mintJoinToken(
		room: RoomToJoin,
		tokenMetadata: MeetRoomMemberTokenMetadata,
		participantName: string,
		participantIdentity: string
	): Promise<string> {
		const livekitPermissions = this.getLiveKitPermissions(
			room.roomId,
			tokenMetadata.permissions,
			room.config.chat.enabled
		);
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
	 * invalidated cannot be renewed into one that is accepted again. A demotion is the exception for the previous
	 * token: the participant is read after it, so the new token carries the restored permissions. The participant's
	 * metadata in the meeting gets every check, demotion included, so a session that reconnected with an earlier
	 * token cannot renew what that token granted.
	 *
	 * @param roomId - The ID of the room
	 * @param previousToken - The previous room member token to refresh
	 * @returns A promise that resolves to the new refreshed token
	 * @throws Error if the previous token is invalid, expired, or if the participant is not found in the meeting,
	 * and a 409 if a change to the participant's role keeps their metadata locked for too long
	 */
	async refreshRoomMemberToken(roomId: string, previousToken: string): Promise<string> {
		const { participantIdentity, participantName, metadata, room } = await this.tokenService.verifyRoomMemberToken(
			previousToken,
			{
				clockToleranceSeconds: INTERNAL_CONFIG.REFRESH_CLOCK_TOLERANCE_SECONDS,
				ignoreDemotion: true
			}
		);

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
	 * Resolves permission source from a room secret: the secret of an identified guest's access URL when it starts
	 * with 'guest-', and otherwise one of the room's anonymous access secrets.
	 *
	 * @param roomId - The ID of the room
	 * @param secret - The secret provided for access
	 * @returns The resolved permission source for the secret
	 * @throws Error if the secret is invalid, if it is not the secret of an identified guest's access URL,
	 * or if anonymous access for the corresponding role is disabled
	 */
	protected async resolvePermissionSourceFromSecret(
		roomId: string,
		secret: string
	): Promise<ResolvedPermissionSource> {
		if (secret.startsWith('guest-')) {
			return this.resolveIdentifiedGuestBySecret(roomId, secret);
		}

		return this.resolveAnonymousAccessBySecret(roomId, secret);
	}

	/**
	 * Resolves the identified guest whose access URL carries exactly the given secret.
	 * The secret is the guest's memberId followed by '-' and a random part, or, for guests added
	 * before 3.10.0 (deprecated until 3.13.0), the memberId alone.
	 *
	 * @param roomId - The ID of the room
	 * @param secret - A secret starting with 'guest-'
	 * @returns The resolved permission source for the identified guest
	 * @throws Error if no identified guest of the room has that secret in its access URL
	 */
	protected async resolveIdentifiedGuestBySecret(roomId: string, secret: string): Promise<ResolvedPermissionSource> {
		const memberId = secret.split('-', 2).join('-');
		const member = await this.getRoomMember(roomId, memberId, [
			'memberId',
			'name',
			'effectivePermissions',
			'accessUrl'
		]);

		if (!member || new URL(member.accessUrl, 'http://localhost').searchParams.get('secret') !== secret) {
			throw errorRoomMemberNotFound(roomId, memberId);
		}

		if (secret === memberId) {
			this.logger.warn(
				`Identified guest '${memberId}' of room '${roomId}' used a deprecated access link whose secret is its memberId, which stops working in 3.13.0`
			);
		}

		return {
			memberId: member.memberId,
			name: member.name,
			permissions: member.effectivePermissions
		};
	}

	/**
	 * Resolves anonymous access and effective permissions from a room secret.
	 *
	 * Grants what the secret's link grants (see {@link MeetRoomHelper.anonymousLinkPermissions}).
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

		return {
			permissions: MeetRoomHelper.anonymousLinkPermissions(anonymousRole, roles)
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
				permissions: MeetRoomMemberHelper.allPermissions(),
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
		const basePermissions = MeetRoomMemberHelper.noPermissions();

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
	 * @throws The `401` invalid token error when a change made after the participant's metadata was issued
	 * invalidated it
	 */
	protected async buildTokenMetadataFromParticipant(
		roomId: string,
		participantIdentity: string
	): Promise<MeetRoomMemberTokenMetadata> {
		const participant = await this.getParticipantFromMeeting(roomId, participantIdentity);
		const participantMetadata = MeetParticipantHelper.parseOwnMeetingMetadata(participant);
		const { outdatedReason } = await this.tokenService.checkRoomMemberTokenCurrency(
			participantMetadata,
			participantIdentity
		);

		if (outdatedReason) {
			this.logger.debug(
				`Not renewing the token of participant '${participantIdentity}' in room '${roomId}': ${outdatedReason}`
			);
			throw errorInvalidToken();
		}

		return {
			...(await this.participantTokenRevocationService.getTokenIssue(roomId, participantIdentity)),
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
			canPublishData: chatEnabled && permissions.chatRead && permissions.chatWrite
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

				if (action === MeetParticipantModerationAction.DOWNGRADE) {
					await this.participantTokenRevocationService.revokeIssuedTokens(roomId, participantIdentity);
				}

				// Stamped after the revocation, so the token the media server derives from it is not revoked.
				Object.assign(
					metadata,
					await this.participantTokenRevocationService.getTokenIssue(roomId, participantIdentity)
				);
				const permission = this.buildLiveParticipantPermission(
					participant.permission,
					metadata.permissions,
					config.chat.enabled
				);
				return this.livekitService.updateParticipant(roomId, participantIdentity, {
					metadata: JSON.stringify(metadata),
					permission
				});
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
	 * Applies new base permissions to a participant in the meeting from the server: their LiveKit metadata, stamped
	 * with the time of the push, and grant. A participant promoted to moderator stays promoted, with the new
	 * permissions as the ones a demotion restores, unless the promotion comes from a session that reconnected with a
	 * token issued before a demotion.
	 *
	 * @param roomId - The ID of the room
	 * @param participantIdentity - The LiveKit identity of the participant
	 * @param room - The room's roles and config
	 * @param buildMetadata - Builds the participant's metadata, with their new base permissions and badge, from
	 * their current one
	 * @param refusedIssuedBefore - Set when the push renews a token: the room's last roles or access update. A session
	 * revoked, or issued before it, is not renewed
	 * @returns The participant as it was before the update
	 * @throws The `401` invalid token error when the session is refused
	 */
	protected async applyPermissionsToLiveParticipant(
		roomId: string,
		participantIdentity: string,
		{ roles, config }: Pick<MeetRoom, 'roles' | 'config'>,
		buildMetadata: (current: ParticipantMeetingMetadata) => ParticipantMeetingMetadata,
		refusedIssuedBefore?: number
	): Promise<ParticipantInfo> {
		return this.withParticipantMetadataLock(roomId, participantIdentity, async () => {
			const participant = await this.getParticipantFromMeeting(roomId, participantIdentity);
			const current = MeetParticipantHelper.parseOwnMeetingMetadata(participant);
			const revoked = await this.participantTokenRevocationService.isRevoked(
				roomId,
				participantIdentity,
				current
			);

			if (refusedIssuedBefore !== undefined && (revoked || current.iat < refusedIssuedBefore)) {
				throw errorInvalidToken();
			}

			const metadata = buildMetadata(current);

			if (current.isPromotedModerator && metadata.badge === MeetRoomMemberUIBadge.OTHER && !revoked) {
				metadata.originalPermissions = metadata.permissions;
				metadata.permissions = this.mergePermissions(
					metadata.permissions,
					roles[MeetRoomMemberRole.MODERATOR].permissions
				);
				metadata.badge = MeetRoomMemberUIBadge.MODERATOR;
				metadata.isPromotedModerator = true;
			}

			Object.assign(
				metadata,
				await this.participantTokenRevocationService.getTokenIssue(roomId, participantIdentity)
			);
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
					await this.livekitService.deleteParticipant(roomId, memberId);
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
