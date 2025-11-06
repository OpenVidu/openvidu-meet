import { Injectable } from '@angular/core';
import { FeatureConfigurationService, GlobalConfigService, HttpService, TokenStorageService } from '../services';
import {
	AuthTransportMode,
	MeetTokenMetadata,
	ParticipantOptions,
	ParticipantPermissions,
	ParticipantRole
} from '@openvidu-meet/typings';
import { getValidDecodedToken } from '../utils';
import { E2eeService, LoggerService } from 'openvidu-components-angular';

@Injectable({
	providedIn: 'root'
})
export class ParticipantService {
	protected readonly PARTICIPANTS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/participants`;
	protected readonly PARTICIPANT_NAME_KEY = 'ovMeet-participantName';

	protected participantName?: string;
	protected participantIdentity?: string;
	protected role: ParticipantRole = ParticipantRole.SPEAKER;
	protected permissions?: ParticipantPermissions;

	protected log;

	constructor(
		protected loggerService: LoggerService,
		protected httpService: HttpService,
		protected featureConfService: FeatureConfigurationService,
		protected globalConfigService: GlobalConfigService,
		protected tokenStorageService: TokenStorageService,
		protected e2eeService: E2eeService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - ParticipantTokenService');
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

	/**
	 * Generates a participant token and extracts role/permissions
	 *
	 * @param participantOptions - The options for the participant, including room ID, participant name, and secret
	 * @return A promise that resolves to the participant token
	 */
	async generateToken(participantOptions: ParticipantOptions, e2EEKey = ''): Promise<string> {
		const path = `${this.PARTICIPANTS_API}/token`;

		if (participantOptions.participantName && !!e2EEKey) {
			// Asign E2EE key and encrypt participant name
			await this.e2eeService.setE2EEKey(e2EEKey);
			participantOptions.participantName = await this.e2eeService.encrypt(participantOptions.participantName);
		}

		const { token } = await this.httpService.postRequest<{ token: string }>(path, participantOptions);

		// Store token in sessionStorage for header mode
		const authTransportMode = await this.globalConfigService.getAuthTransportMode();
		if (authTransportMode === AuthTransportMode.HEADER) {
			this.tokenStorageService.setParticipantToken(token);
		}

		await this.updateParticipantTokenInfo(token);
		return token;
	}

	/**
	 * Refreshes the participant token using the provided options.
	 *
	 * @param participantOptions - The options for the participant, including room ID, participant name, and secret
	 * @return A promise that resolves to the refreshed participant token
	 */
	async refreshParticipantToken(participantOptions: ParticipantOptions): Promise<string> {
		const path = `${this.PARTICIPANTS_API}/token/refresh`;
		const { token } = await this.httpService.postRequest<{ token: string }>(path, participantOptions);

		// Store token in sessionStorage for header mode
		const authTransportMode = await this.globalConfigService.getAuthTransportMode();
		if (authTransportMode === AuthTransportMode.HEADER) {
			this.tokenStorageService.setParticipantToken(token);
		}

		await this.updateParticipantTokenInfo(token);
		return token;
	}

	/**
	 * Updates the current participant token information, including role and permissions.
	 *
	 * @param token - The JWT token to set.
	 * @throws Error if the token is invalid or expired.
	 */
	protected async updateParticipantTokenInfo(token: string): Promise<void> {
		try {
			const decodedToken = getValidDecodedToken(token);
			const metadata = decodedToken.metadata as MeetTokenMetadata;

			if (decodedToken.sub && decodedToken.name) {
				const decryptedName = await this.e2eeService.decryptOrMask(decodedToken.name);
				this.setParticipantName(decryptedName);
				this.participantIdentity = decodedToken.sub;
			}

			this.role = metadata.selectedRole;
			const openviduPermissions = metadata.roles.find((r) => r.role === this.role)!.permissions;
			this.permissions = {
				livekit: decodedToken.video,
				openvidu: openviduPermissions
			};

			// Update feature configuration
			this.featureConfService.setParticipantRole(this.role);
			this.featureConfService.setParticipantPermissions(this.permissions);
		} catch (error) {
			this.log.e('Error setting participant token and associated data', error);
			throw new Error('Error setting participant token');
		}
	}

	setParticipantRole(participantRole: ParticipantRole): void {
		this.role = participantRole;
		this.featureConfService.setParticipantRole(this.role);
	}

	getParticipantRole(): ParticipantRole {
		return this.role;
	}

	isModeratorParticipant(): boolean {
		return this.getParticipantRole() === ParticipantRole.MODERATOR;
	}

	getParticipantPermissions(): ParticipantPermissions | undefined {
		return this.permissions;
	}

	getParticipantRoleHeader(): Record<string, string> {
		return { 'x-participant-role': this.getParticipantRole() };
	}
}
