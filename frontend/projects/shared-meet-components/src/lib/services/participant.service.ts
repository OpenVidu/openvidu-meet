import { Injectable } from '@angular/core';
import { FeatureConfigurationService, HttpService } from '@lib/services';
import { MeetTokenMetadata, ParticipantOptions, ParticipantPermissions, ParticipantRole } from '@lib/typings/ce';
import { getValidDecodedToken } from '@lib/utils';
import { LoggerService } from 'openvidu-components-angular';

@Injectable({
	providedIn: 'root'
})
export class ParticipantService {
	protected readonly PARTICIPANTS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/participants`;

	protected participantName?: string;
	protected role: ParticipantRole = ParticipantRole.SPEAKER;
	protected permissions?: ParticipantPermissions;

	protected log;

	constructor(
		protected loggerService: LoggerService,
		protected httpService: HttpService,
		protected featureConfService: FeatureConfigurationService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - ParticipantTokenService');
	}

	setParticipantName(participantName: string): void {
		this.participantName = participantName;
	}

	getParticipantName(): string | undefined {
		return this.participantName;
	}

	/**
	 * Generates a participant token and extracts role/permissions
	 *
	 * @param participantOptions - The options for the participant, including room ID, participant name, and secret
	 * @return A promise that resolves to the participant token
	 */
	async generateToken(participantOptions: ParticipantOptions): Promise<string> {
		const path = `${this.PARTICIPANTS_API}/token`;
		const { token } = await this.httpService.postRequest<{ token: string }>(path, participantOptions);

		this.updateParticipantTokenInfo(token);
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

		this.updateParticipantTokenInfo(token);
		return token;
	}

	/**
	 * Updates the current participant token information, including role and permissions.
	 *
	 * @param token - The JWT token to set.
	 * @throws Error if the token is invalid or expired.
	 */
	protected updateParticipantTokenInfo(token: string): void {
		try {
			const decodedToken = getValidDecodedToken(token);
			const metadata = decodedToken.metadata as MeetTokenMetadata;

			this.role = metadata.selectedRole;
			const openviduPermissions = metadata.roles.find((r) => r.role === this.role)!.permissions;
			this.permissions = {
				livekit: decodedToken.video,
				openvidu: openviduPermissions
			};
			console.warn('PARTICIPANT PERMISSIONS', this.permissions);

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
