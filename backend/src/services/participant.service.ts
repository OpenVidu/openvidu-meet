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
		const { roomName, participantName, secret } = options;

		// Check if participant with same participantName exists in the room
		const participantExists = await this.participantExists(roomName, participantName);

		if (!refresh && participantExists) {
			this.logger.verbose(`Participant ${participantName} already exists in room ${roomName}`);
			throw errorParticipantAlreadyExists(participantName, roomName);
		}

		if (refresh && !participantExists) {
			this.logger.verbose(`Participant ${participantName} does not exist in room ${roomName}`);
			throw errorParticipantNotFound(participantName, roomName);
		}

		const role = await this.roomService.getRoomSecretRole(roomName, secret);
		return this.generateParticipantToken(role, options);
	}

	protected async generateParticipantToken(role: ParticipantRole, options: TokenOptions): Promise<string> {
		const permissions = this.getParticipantPermissions(role, options.roomName);
		return this.livekitService.generateToken(options, permissions, role);
	}

	async getParticipant(roomName: string, participantName: string): Promise<ParticipantInfo | null> {
		this.logger.verbose(`Fetching participant ${participantName}`);
		return this.livekitService.getParticipant(roomName, participantName);
	}

	async participantExists(roomName: string, participantName: string): Promise<boolean> {
		this.logger.verbose(`Checking if participant ${participantName} exists in room ${roomName}`);

		try {
			const participant = await this.getParticipant(roomName, participantName);
			return participant !== null;
		} catch (error) {
			return false;
		}
	}

	async deleteParticipant(participantName: string, roomName: string): Promise<void> {
		this.logger.verbose(`Deleting participant ${participantName} from room ${roomName}`);

		return this.livekitService.deleteParticipant(participantName, roomName);
	}

	getParticipantPermissions(role: ParticipantRole, roomName: string): ParticipantPermissions {
		switch (role) {
			case ParticipantRole.MODERATOR:
				return this.generateModeratorPermissions(roomName);
			case ParticipantRole.PUBLISHER:
				return this.generatePublisherPermissions(roomName);
			default:
				throw new Error(`Role ${role} not supported`);
		}
	}

	protected generateModeratorPermissions(roomName: string): ParticipantPermissions {
		return {
			livekit: {
				roomCreate: true,
				roomJoin: true,
				roomList: true,
				roomRecord: true,
				roomAdmin: true,
				room: roomName,
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

	protected generatePublisherPermissions(roomName: string): ParticipantPermissions {
		return {
			livekit: {
				roomJoin: true,
				roomList: true,
				roomRecord: false,
				roomAdmin: false,
				room: roomName,
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
