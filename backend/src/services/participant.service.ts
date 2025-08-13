import {
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
import { errorParticipantAlreadyExists, errorParticipantNotFound } from '../models/error.model.js';
import { FrontendEventService, LiveKitService, LoggerService, RoomService, TokenService } from './index.js';

@injectable()
export class ParticipantService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(TokenService) protected tokenService: TokenService
	) {}

	async generateOrRefreshParticipantToken(
		participantOptions: ParticipantOptions,
		currentRoles: { role: ParticipantRole; permissions: OpenViduMeetPermissions }[],
		refresh = false
	): Promise<string> {
		const { roomId, participantName, secret } = participantOptions;

		if (participantName) {
			// Check if participant with same participantName exists in the room
			const participantExists = await this.participantExists(roomId, participantName);

			if (!refresh && participantExists) {
				this.logger.verbose(`Participant '${participantName}' already exists in room '${roomId}'`);
				throw errorParticipantAlreadyExists(participantName, roomId);
			}

			if (refresh && !participantExists) {
				this.logger.verbose(`Participant '${participantName}' does not exist in room '${roomId}'`);
				throw errorParticipantNotFound(participantName, roomId);
			}
		}

		const role = await this.roomService.getRoomRoleBySecret(roomId, secret);
		const token = await this.generateParticipantToken(participantOptions, role, currentRoles);
		this.logger.verbose(`Participant token generated for room '${roomId}'`);
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

	async participantExists(roomId: string, participantIdentity: string): Promise<boolean> {
		this.logger.verbose(`Checking if participant '${participantIdentity}' exists in room '${roomId}'`);

		try {
			await this.getParticipant(roomId, participantIdentity);
			return true;
		} catch (error) {
			return false;
		}
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
}
