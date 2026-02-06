import { Injectable } from '@angular/core';
import {
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberTokenOptions
} from '@openvidu-meet/typings';
import { E2eeService, LoggerService } from 'openvidu-components-angular';
import { FeatureConfigurationService } from '../../../shared/services/feature-configuration.service';
import { TokenStorageService } from '../../../shared/services/token-storage.service';
import { decodeToken } from '../../../shared/utils/token.utils';
import { RoomMemberService } from './room-member.service';

@Injectable({
	providedIn: 'root'
})
export class RoomMemberContextService {
	protected readonly PARTICIPANT_NAME_KEY = 'ovMeet-participantName';

	protected participantName?: string;
	protected participantIdentity?: string;
	protected role: MeetRoomMemberRole = MeetRoomMemberRole.SPEAKER;
	protected permissions?: MeetRoomMemberPermissions;

	protected log;

	constructor(
		protected loggerService: LoggerService,
		protected roomMemberService: RoomMemberService,
		protected featureConfService: FeatureConfigurationService,
		protected tokenStorageService: TokenStorageService,
		protected e2eeService: E2eeService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RoomMemberContextService');
	}

	/**
	 * Sets the participant's display name and stores it in localStorage.
	 *
	 * @param participantName - The display name of the participant
	 */
	setParticipantName(participantName: string): void {
		this.participantName = participantName;
		localStorage.setItem(this.PARTICIPANT_NAME_KEY, participantName);
	}

	/**
	 * Retrieves the participant's display name from memory or localStorage.
	 *
	 * @returns The display name of the participant, or undefined if not set
	 */
	getParticipantName(): string | undefined {
		return this.participantName || localStorage.getItem(this.PARTICIPANT_NAME_KEY) || undefined;
	}

	/**
	 * Retrieves the participant's identity.
	 *
	 * @returns The identity of the participant, or undefined if not set
	 */
	getParticipantIdentity(): string | undefined {
		return this.participantIdentity;
	}

	/**
	 * Clears the participant's identity.
	 */
	clearParticipantIdentity(): void {
		this.participantIdentity = undefined;
	}

	/**
	 * Checks if the current room member has a specific permission.
	 *
	 * @param permission - The permission to check
	 * @returns True if the member has the permission, false otherwise
	 */
	hasPermission(permission: keyof MeetRoomMemberPermissions): boolean {
		return this.permissions?.[permission] ?? false;
	}

	/**
	 * Generates a room member token and updates the context with role and permissions.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param tokenOptions - The options for the token generation
	 * @param e2eeKey - Optional E2EE encryption key
	 * @return A promise that resolves to the room member token
	 */
	async generateToken(roomId: string, tokenOptions: MeetRoomMemberTokenOptions, e2eeKey?: string): Promise<string> {
		if (tokenOptions.participantName && e2eeKey) {
			// Assign E2EE key and encrypt participant name
			await this.e2eeService.setE2EEKey(e2eeKey);
			const encryptedName = await this.e2eeService.encrypt(tokenOptions.participantName);
			tokenOptions.participantName = encryptedName;
		}

		const { token } = await this.roomMemberService.generateRoomMemberToken(roomId, tokenOptions);
		this.tokenStorageService.setRoomMemberToken(token);
		await this.updateContextFromToken(token);
		return token;
	}

	/**
	 * Updates the room member context (role and permissions) based on the provided token.
	 *
	 * @param token - The room member token
	 * @throws Error if the token is invalid or expired.
	 */
	protected async updateContextFromToken(token: string): Promise<void> {
		try {
			const decodedToken = decodeToken(token);
			const metadata = decodedToken.metadata as MeetRoomMemberTokenMetadata;

			if (decodedToken.sub && decodedToken.name) {
				const decryptedName = await this.e2eeService.decrypt(decodedToken.name);
				this.setParticipantName(decryptedName);
				this.participantIdentity = decodedToken.sub;
			}

			this.role = metadata.baseRole;
			this.permissions = metadata.effectivePermissions;

			// Update feature configuration
			this.featureConfService.setRoomMemberRole(this.role);
			this.featureConfService.setRoomMemberPermissions(this.permissions);
		} catch (error) {
			this.log.e('Error decoding room member token:', error);
			throw new Error('Invalid room member token');
		}
	}
}
