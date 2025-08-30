import {
	MeetRoomStatus,
	MeetTokenMetadata,
	OpenViduMeetPermissions,
	ParticipantOptions,
	ParticipantPermissions,
	ParticipantRole
} from '@typings-ce';
import { inject, injectable } from 'inversify';
import { ParticipantInfo } from 'livekit-server-sdk';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { validateMeetTokenMetadata } from '../middlewares/index.js';
import {
	errorParticipantIdentityNotProvided,
	errorParticipantNotFound,
	errorRoomClosed
} from '../models/error.model.js';
import {
	FrontendEventService,
	LiveKitService,
	LoggerService,
	ParticipantNameService,
	RoomService,
	TokenService
} from './index.js';

@injectable()
export class ParticipantService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(TokenService) protected tokenService: TokenService,
		@inject(ParticipantNameService) protected participantNameService: ParticipantNameService
	) {}

	async generateOrRefreshParticipantToken(
		participantOptions: ParticipantOptions,
		currentRoles: { role: ParticipantRole; permissions: OpenViduMeetPermissions }[],
		refresh = false
	): Promise<string> {
		const { roomId, secret, participantName, participantIdentity } = participantOptions;
		let finalParticipantName = participantName;
		let finalParticipantOptions: ParticipantOptions = participantOptions;

		if (participantName) {
			// Check that room is open
			const room = await this.roomService.getMeetRoom(roomId);

			if (room.status === MeetRoomStatus.CLOSED) {
				throw errorRoomClosed(roomId);
			}

			// Create the Livekit room if it doesn't exist
			await this.roomService.createLivekitRoom(roomId);

			if (refresh) {
				if (!participantIdentity) {
					throw errorParticipantIdentityNotProvided();
				}

				this.logger.verbose(`Refreshing participant token for '${participantIdentity}' in room '${roomId}'`);
				// Check if participant with same participantIdentity exists in the room
				const participantExists = await this.participantExists(roomId, participantIdentity, 'identity');

				if (!participantExists) {
					this.logger.verbose(`Participant '${participantIdentity}' does not exist in room '${roomId}'`);
					throw errorParticipantNotFound(participantIdentity, roomId);
				}
			} else {
				this.logger.verbose(`Generating participant token for '${participantName}' in room '${roomId}'`);

				try {
					// Reserve a unique name for the participant
					finalParticipantName = await this.participantNameService.reserveUniqueName(roomId, participantName);
					this.logger.verbose(`Reserved unique name '${finalParticipantName}' for room '${roomId}'`);
				} catch (error) {
					this.logger.error(
						`Failed to reserve unique name '${participantName}' for room '${roomId}':`,
						error
					);
					throw error;
				}

				// Update participantOptions with the final participant name
				finalParticipantOptions = {
					...participantOptions,
					participantName: finalParticipantName
				};
			}
		}

		const role = await this.roomService.getRoomRoleBySecret(roomId, secret);
		const token = await this.generateParticipantToken(finalParticipantOptions, role, currentRoles);
		this.logger.verbose(
			`Participant token generated for room '${roomId}'` +
				(finalParticipantName ? ` with name '${finalParticipantName}'` : '')
		);
		return token;
	}

	protected async generateParticipantToken(
		participantOptions: ParticipantOptions,
		role: ParticipantRole,
		currentRoles: { role: ParticipantRole; permissions: OpenViduMeetPermissions }[]
	): Promise<string> {
		const { roomId, participantName } = participantOptions;
		const permissions = this.getParticipantPermissions(roomId, role, !!participantName);

		if (!currentRoles.some((r) => r.role === role)) {
			currentRoles.push({ role, permissions: permissions.openvidu });
		}

		return this.tokenService.generateParticipantToken(participantOptions, permissions.livekit, currentRoles, role);
	}

	async getParticipant(roomId: string, participantIdentity: string): Promise<ParticipantInfo> {
		this.logger.verbose(`Fetching participant '${participantIdentity}'`);
		return this.livekitService.getParticipant(roomId, participantIdentity);
	}

	async participantExists(
		roomId: string,
		participantNameOrIdentity: string,
		participantField: 'name' | 'identity' = 'identity'
	): Promise<boolean> {
		this.logger.verbose(`Checking if participant '${participantNameOrIdentity}' exists in room '${roomId}'`);
		return this.livekitService.participantExists(roomId, participantNameOrIdentity, participantField);
	}

	async deleteParticipant(roomId: string, participantIdentity: string): Promise<void> {
		this.logger.verbose(`Deleting participant '${participantIdentity}' from room '${roomId}'`);

		return this.livekitService.deleteParticipant(roomId, participantIdentity);
	}

	getParticipantPermissions(roomId: string, role: ParticipantRole, addJoinPermission = true): ParticipantPermissions {
		switch (role) {
			case ParticipantRole.MODERATOR:
				return this.generateModeratorPermissions(roomId, addJoinPermission);
			case ParticipantRole.SPEAKER:
				return this.generateSpeakerPermissions(roomId, addJoinPermission);
			default:
				throw new Error(`Role ${role} not supported`);
		}
	}

	async updateParticipantRole(roomId: string, participantIdentity: string, newRole: ParticipantRole): Promise<void> {
		try {
			const meetRoom = await this.roomService.getMeetRoom(roomId);

			const participant = await this.getParticipant(roomId, participantIdentity);
			const metadata: MeetTokenMetadata = this.parseMetadata(participant.metadata);

			// Update selected role and roles array
			metadata.selectedRole = newRole;
			const currentRoles = metadata.roles;

			if (!currentRoles.some((r) => r.role === newRole)) {
				const { openvidu } = this.getParticipantPermissions(roomId, newRole);
				currentRoles.push({ role: newRole, permissions: openvidu });
			}

			await this.livekitService.updateParticipantMetadata(roomId, participantIdentity, JSON.stringify(metadata));

			const { speakerSecret, moderatorSecret } = MeetRoomHelper.extractSecretsFromRoom(meetRoom);
			const secret = newRole === ParticipantRole.MODERATOR ? moderatorSecret : speakerSecret;
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

	parseMetadata(metadata: string): MeetTokenMetadata {
		try {
			const parsedMetadata = JSON.parse(metadata);
			return validateMeetTokenMetadata(parsedMetadata);
		} catch (error) {
			this.logger.error('Failed to parse participant metadata:', error);
			throw new Error('Invalid participant metadata format');
		}
	}

	protected generateModeratorPermissions(roomId: string, addJoinPermission = true): ParticipantPermissions {
		return {
			livekit: {
				roomJoin: addJoinPermission,
				room: roomId,
				canPublish: true,
				canSubscribe: true,
				canPublishData: true,
				canUpdateOwnMetadata: true
			},
			openvidu: {
				canRecord: true,
				canChat: true,
				canChangeVirtualBackground: true
			}
		};
	}

	protected generateSpeakerPermissions(roomId: string, addJoinPermission = true): ParticipantPermissions {
		return {
			livekit: {
				roomJoin: addJoinPermission,
				room: roomId,
				canPublish: true,
				canSubscribe: true,
				canPublishData: true,
				canUpdateOwnMetadata: true
			},
			openvidu: {
				canRecord: false,
				canChat: true,
				canChangeVirtualBackground: true
			}
		};
	}

	/**
	 * Releases a participant's reserved name when they disconnect.
	 * This should be called when a participant leaves the room to free up the name.
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
	 * Gets all currently reserved participant names in a room.
	 * Useful for debugging and monitoring.
	 *
	 * @param roomId - The room identifier
	 * @returns Promise<string[]> - Array of reserved participant names
	 */
	async getReservedNames(roomId: string): Promise<string[]> {
		return await this.participantNameService.getReservedNames(roomId);
	}

	/**
	 * Cleans up expired participant name reservations for a room.
	 * This can be called during room cleanup or periodically.
	 *
	 * @param roomId - The room identifier
	 */
	async cleanupParticipantNames(roomId: string): Promise<void> {
		await this.participantNameService.cleanupExpiredReservations(roomId);
	}
}
