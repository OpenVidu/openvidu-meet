import {
	MeetRecordingAccess,
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberTokenOptions,
	MeetRoomStatus
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { ParticipantInfo } from 'livekit-server-sdk';
import { uid } from 'uid/single';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { validateRoomMemberTokenMetadata } from '../middlewares/request-validators/participant-validator.middleware.js';
import { errorInvalidRoomSecret, errorParticipantNotFound, errorRoomClosed } from '../models/error.model.js';
import { FrontendEventService } from './frontend-event.service.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { ParticipantNameService } from './participant-name.service.js';
import { RoomService } from './room.service.js';
import { TokenService } from './token.service.js';

/**
 * Service for managing room members and meeting participants.
 */
@injectable()
export class RoomMemberService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(ParticipantNameService) protected participantNameService: ParticipantNameService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(TokenService) protected tokenService: TokenService
	) {}

	/**
	 * Validates a secret against a room's moderator and speaker secrets and returns the corresponding role.
	 *
	 * @param roomId - The unique identifier of the room to check
	 * @param secret - The secret to validate against the room's moderator and speaker secrets
	 * @returns A promise that resolves to the room member role (MODERATOR or SPEAKER) if the secret is valid
	 * @throws Error if the moderator or speaker secrets cannot be extracted from their URLs
	 * @throws Error if the provided secret doesn't match any of the room's secrets (unauthorized)
	 */
	async getRoomMemberRoleBySecret(roomId: string, secret: string): Promise<MeetRoomMemberRole> {
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
	 * Generates or refreshes a room member token.
	 *
	 * @param roomId - The room identifier
	 * @param tokenOptions - Options for token generation
	 * @returns A promise that resolves to the generated token
	 */
	async generateOrRefreshRoomMemberToken(roomId: string, tokenOptions: MeetRoomMemberTokenOptions): Promise<string> {
		const { secret, grantJoinMeetingPermission = false, participantName, participantIdentity } = tokenOptions;

		// Get room member role from secret
		const role = await this.getRoomMemberRoleBySecret(roomId, secret);

		if (grantJoinMeetingPermission && participantName) {
			return this.generateTokenWithJoinMeetingPermission(roomId, role, participantName, participantIdentity);
		} else {
			return this.generateTokenWithoutJoinMeetingPermission(roomId, role);
		}
	}

	/**
	 * Generates a token with join meeting permissions.
	 * Handles both new token generation and token refresh.
	 */
	protected async generateTokenWithJoinMeetingPermission(
		roomId: string,
		role: MeetRoomMemberRole,
		participantName: string,
		participantIdentity?: string
	): Promise<string> {
		// Check that room is open
		const room = await this.roomService.getMeetRoom(roomId);

		if (room.status === MeetRoomStatus.CLOSED) {
			throw errorRoomClosed(roomId);
		}

		const isRefresh = !!participantIdentity;

		if (!isRefresh) {
			// GENERATION MODE
			this.logger.verbose(
				`Generating room member token with join meeting permission for '${participantName}' in room '${roomId}'`
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

		// Get participant permissions (with join meeting)
		const permissions = await this.getRoomMemberPermissions(roomId, role, true);

		// Generate token with participant name
		return this.tokenService.generateRoomMemberToken(role, permissions, participantName, participantIdentity);
	}

	/**
	 * Generates a token without join meeting permission.
	 * This token only provides access to other room resources (recordings, etc.)
	 */
	protected async generateTokenWithoutJoinMeetingPermission(
		roomId: string,
		role: MeetRoomMemberRole
	): Promise<string> {
		this.logger.verbose(`Generating room member token without join meeting permission for room '${roomId}'`);

		// Get participant permissions (without join meeting)
		const permissions = await this.getRoomMemberPermissions(roomId, role, false);

		// Generate token without participant name
		return this.tokenService.generateRoomMemberToken(role, permissions);
	}

	/**
	 * Gets the permissions for a room member based on their role.
	 *
	 * @param roomId - The ID of the room
	 * @param role - The role of the room member
	 * @param addJoinPermission - Whether to include join permission (for meeting access)
	 * @returns The permissions for the room member
	 */
	async getRoomMemberPermissions(
		roomId: string,
		role: MeetRoomMemberRole,
		addJoinPermission = true
	): Promise<MeetRoomMemberPermissions> {
		const recordingPermissions = await this.getRecordingPermissions(roomId, role);

		switch (role) {
			case MeetRoomMemberRole.MODERATOR:
				return this.generateModeratorPermissions(
					roomId,
					recordingPermissions.canRetrieveRecordings,
					recordingPermissions.canDeleteRecordings,
					addJoinPermission
				);
			case MeetRoomMemberRole.SPEAKER:
				return this.generateSpeakerPermissions(
					roomId,
					recordingPermissions.canRetrieveRecordings,
					recordingPermissions.canDeleteRecordings,
					addJoinPermission
				);
		}
	}

	protected generateModeratorPermissions(
		roomId: string,
		canRetrieveRecordings: boolean,
		canDeleteRecordings: boolean,
		addJoinPermission: boolean
	): MeetRoomMemberPermissions {
		return {
			livekit: {
				roomJoin: addJoinPermission,
				room: roomId,
				canPublish: true,
				canSubscribe: true,
				canPublishData: true,
				canUpdateOwnMetadata: true
			},
			meet: {
				canRecord: true,
				canRetrieveRecordings,
				canDeleteRecordings,
				canChat: true,
				canChangeVirtualBackground: true
			}
		};
	}

	protected generateSpeakerPermissions(
		roomId: string,
		canRetrieveRecordings: boolean,
		canDeleteRecordings: boolean,
		addJoinPermission: boolean
	): MeetRoomMemberPermissions {
		return {
			livekit: {
				roomJoin: addJoinPermission,
				room: roomId,
				canPublish: true,
				canSubscribe: true,
				canPublishData: true,
				canUpdateOwnMetadata: true
			},
			meet: {
				canRecord: false,
				canRetrieveRecordings,
				canDeleteRecordings,
				canChat: true,
				canChangeVirtualBackground: true
			}
		};
	}

	protected async getRecordingPermissions(
		roomId: string,
		role: MeetRoomMemberRole
	): Promise<{
		canRetrieveRecordings: boolean;
		canDeleteRecordings: boolean;
	}> {
		const room = await this.roomService.getMeetRoom(roomId);
		const recordingAccess = room.config.recording.allowAccessTo;

		if (!recordingAccess) {
			// Default to no access if not configured
			return {
				canRetrieveRecordings: false,
				canDeleteRecordings: false
			};
		}

		// A room member can delete recordings if they are a moderator and the recording access is not set to admin
		const canDeleteRecordings =
			role === MeetRoomMemberRole.MODERATOR && recordingAccess !== MeetRecordingAccess.ADMIN;

		/* A room member can retrieve recordings if
			- they can delete recordings
			- they are a speaker and the recording access includes speakers
		*/
		const canRetrieveRecordings =
			canDeleteRecordings ||
			(role === MeetRoomMemberRole.SPEAKER && recordingAccess === MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER);

		return {
			canRetrieveRecordings,
			canDeleteRecordings
		};
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
			metadata.role = newRole;
			const { meet } = await this.getRoomMemberPermissions(roomId, newRole);
			metadata.permissions = meet;

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
