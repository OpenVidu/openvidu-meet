import { injectable, inject } from 'inversify';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { ParticipantPermissions, ParticipantRole, TokenOptions } from '@typings-ce';
import { ParticipantInfo } from 'livekit-server-sdk';
import { RoomService } from './room.service.js';
import { errorParticipantAlreadyExists, errorParticipantNotFound } from '../models/index.js';

@injectable()
export class ParticipantService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(LiveKitService) protected livekitService: LiveKitService
	) {}

	async generateOrRefreshParticipantToken(options: TokenOptions, refresh = false): Promise<string> {
		const { roomId, participantName, secret } = options;

		// Check if participant with same participantName exists in the room
		const participantExists = await this.participantExists(roomId, participantName);

		if (!refresh && participantExists) {
			this.logger.verbose(`Participant ${participantName} already exists in room ${roomId}`);
			throw errorParticipantAlreadyExists(participantName, roomId);
		}

		if (refresh && !participantExists) {
			this.logger.verbose(`Participant ${participantName} does not exist in room ${roomId}`);
			throw errorParticipantNotFound(participantName, roomId);
		}

		const role = await this.roomService.getRoomRoleBySecret(roomId, secret);
		const token = await this.generateParticipantToken(role, options);
		this.logger.verbose(`Participant token generated for room ${roomId}`);
		return token;
	}

	protected async generateParticipantToken(role: ParticipantRole, options: TokenOptions): Promise<string> {
		const permissions = this.getParticipantPermissions(role, options.roomId);
		return this.livekitService.generateToken(options, permissions, role);
	}

	async getParticipant(roomId: string, participantName: string): Promise<ParticipantInfo | null> {
		this.logger.verbose(`Fetching participant ${participantName}`);
		return this.livekitService.getParticipant(roomId, participantName);
	}

	async participantExists(roomId: string, participantName: string): Promise<boolean> {
		this.logger.verbose(`Checking if participant ${participantName} exists in room ${roomId}`);

		try {
			const participant = await this.getParticipant(roomId, participantName);
			return participant !== null;
		} catch (error) {
			return false;
		}
	}

	async deleteParticipant(participantName: string, roomId: string): Promise<void> {
		this.logger.verbose(`Deleting participant ${participantName} from room ${roomId}`);

		return this.livekitService.deleteParticipant(participantName, roomId);
	}

	getParticipantPermissions(role: ParticipantRole, roomId: string): ParticipantPermissions {
		switch (role) {
			case ParticipantRole.MODERATOR:
				return this.generateModeratorPermissions(roomId);
			case ParticipantRole.PUBLISHER:
				return this.generatePublisherPermissions(roomId);
			default:
				throw new Error(`Role ${role} not supported`);
		}
	}

	protected generateModeratorPermissions(roomId: string): ParticipantPermissions {
		return {
			livekit: {
				roomCreate: true,
				roomJoin: true,
				roomList: true,
				roomRecord: true,
				roomAdmin: true,
				room: roomId,
				ingressAdmin: true,
				canPublish: true,
				canSubscribe: true,
				canPublishData: true,
				canUpdateOwnMetadata: true,
				hidden: false,
				recorder: true,
				agent: false
			},
			openvidu: {
				canPublishScreen: true,
				canRecord: true,
				canChat: true,
				canChangeVirtualBackground: true
			}
		};
	}

	protected generatePublisherPermissions(roomId: string): ParticipantPermissions {
		return {
			livekit: {
				roomJoin: true,
				roomList: true,
				roomRecord: false,
				roomAdmin: false,
				room: roomId,
				ingressAdmin: false,
				canPublish: true,
				canSubscribe: true,
				canPublishData: true,
				canUpdateOwnMetadata: true,
				hidden: false,
				recorder: false,
				agent: false
			},
			openvidu: {
				canPublishScreen: true,
				canRecord: false,
				canChat: true,
				canChangeVirtualBackground: true
			}
		};
	}
}
