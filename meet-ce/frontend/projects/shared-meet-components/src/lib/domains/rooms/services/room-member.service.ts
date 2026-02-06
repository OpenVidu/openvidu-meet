import { Injectable } from '@angular/core';
import {
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberTokenOptions
} from '@openvidu-meet/typings';
import { E2eeService, LoggerService } from 'openvidu-components-angular';
import { FeatureConfigurationService } from '../../../shared/services/feature-configuration.service';
import { HttpService } from '../../../shared/services/http.service';
import { TokenStorageService } from '../../../shared/services/token-storage.service';
import { getValidDecodedToken } from '../../../shared/utils/token.utils';

@Injectable({
	providedIn: 'root'
})
export class RoomMemberService {
	protected readonly ROOM_MEMBERS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/rooms`;
	protected readonly PARTICIPANT_NAME_KEY = 'ovMeet-participantName';

	protected participantName?: string;
	protected participantIdentity?: string;
	protected role: MeetRoomMemberRole = MeetRoomMemberRole.SPEAKER;
	protected permissions?: MeetRoomMemberPermissions;

	protected log;

	constructor(
		protected loggerService: LoggerService,
		protected httpService: HttpService,
		protected featureConfService: FeatureConfigurationService,
		protected tokenStorageService: TokenStorageService,
		protected e2eeService: E2eeService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - ParticipantTokenService');
	}

	protected getRoomMemberApiPath(roomId: string): string {
		return `${this.ROOM_MEMBERS_API}/${roomId}/members`;
	}

	setParticipantName(participantName: string): void {
		this.participantName = participantName;
		localStorage.setItem(this.PARTICIPANT_NAME_KEY, participantName);
	}

	getParticipantName(): string | undefined {
		return this.participantName || localStorage.getItem(this.PARTICIPANT_NAME_KEY) || undefined;
	}

	getParticipantIdentity(): string | undefined {
		return this.participantIdentity;
	}

	clearParticipantIdentity(): void {
		this.participantIdentity = undefined;
	}

	/**
	 * Generates a room member token and extracts role/permissions
	 *
	 * @param tokenOptions - The options for the token generation
	 * @return A promise that resolves to the room member token
	 */
	async generateToken(roomId: string, tokenOptions: MeetRoomMemberTokenOptions, e2eeKey?: string): Promise<string> {
		if (tokenOptions.participantName && e2eeKey) {
			// Assign E2EE key and encrypt participant name
			await this.e2eeService.setE2EEKey(e2eeKey);
			const encryptedName = await this.e2eeService.encrypt(tokenOptions.participantName);
			tokenOptions.participantName = encryptedName;
		}

		const path = `${this.getRoomMemberApiPath(roomId)}/token`;
		const { token } = await this.httpService.postRequest<{ token: string }>(path, tokenOptions);

		this.tokenStorageService.setRoomMemberToken(token);
		await this.updateRoomMemberTokenInfo(token);
		return token;
	}

	/**
	 * Updates the current room member token information, including role and permissions.
	 *
	 * @param token - The JWT token to set.
	 * @throws Error if the token is invalid or expired.
	 */
	protected async updateRoomMemberTokenInfo(token: string): Promise<void> {
		try {
			const decodedToken = getValidDecodedToken(token);
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
			this.log.e('Error updating room member token info', error);
			throw new Error('Error updating room member token info');
		}
	}

	isModerator(): boolean {
		return this.role === MeetRoomMemberRole.MODERATOR;
	}

	getRoomMemberPermissions(): MeetRoomMemberPermissions | undefined {
		return this.permissions;
	}

	canRetrieveRecordings(): boolean {
		return this.permissions?.canRetrieveRecordings ?? false;
	}

	canDeleteRecordings(): boolean {
		return this.permissions?.canDeleteRecordings ?? false;
	}
}
