import { Injectable } from '@angular/core';
import { ParticipantTokenInfo } from '@lib/models';
import { FeatureConfigurationService, HttpService } from '@lib/services';
import { ParticipantOptions, ParticipantPermissions, ParticipantRole } from '@lib/typings/ce';
import { getValidDecodedToken } from '@lib/utils';
import { LoggerService } from 'openvidu-components-angular';

@Injectable({
	providedIn: 'root'
})
export class ParticipantTokenService {
	protected readonly PARTICIPANTS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/participants`;

	protected participantName: string = '';
	protected participantRole: ParticipantRole = ParticipantRole.PUBLISHER;
	protected currentTokenInfo?: ParticipantTokenInfo;

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

	getParticipantName(): string {
		return this.participantName;
	}

	/**
	 * Generates a participant token and extracts role/permissions
	 *
	 * @param participantOptions - The options for the participant, including room ID, participant name, and secret
	 * @return A promise that resolves to an object containing the token, role, and permissions
	 */
	async generateToken(participantOptions: ParticipantOptions): Promise<ParticipantTokenInfo> {
		const path = `${this.PARTICIPANTS_API}/token`;
		const { token } = await this.httpService.postRequest<{ token: string }>(path, participantOptions);

		this.updateParticipantTokenInfo(token);
		return this.currentTokenInfo!;
	}

	/**
	 * Refreshes the participant token using the provided options.
	 *
	 * @param participantOptions - The options for the participant, including room ID, participant name, and secret
	 * @return A promise that resolves to an object containing the new token, role, and permissions
	 */
	async refreshParticipantToken(participantOptions: ParticipantOptions): Promise<ParticipantTokenInfo> {
		const path = `${this.PARTICIPANTS_API}/token/refresh`;
		const { token } = await this.httpService.postRequest<{ token: string }>(path, participantOptions);

		this.updateParticipantTokenInfo(token);
		return this.currentTokenInfo!;
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
			const roleAndPermissions = decodedToken.metadata.roles?.find(
				(r: { role: ParticipantRole; permissions: ParticipantPermissions }) => r.role === this.participantRole
			);
			this.currentTokenInfo = {
				token: token,
				role: roleAndPermissions.role,
				permissions: {
					livekit: decodedToken.video,
					openvidu: roleAndPermissions.permissions
				}
			};
			this.participantRole = this.currentTokenInfo.role;

			// Update feature configuration
			this.featureConfService.setParticipantRole(this.currentTokenInfo.role);
			this.featureConfService.setParticipantPermissions(this.currentTokenInfo.permissions);
		} catch (error) {
			this.log.e('Error setting participant token and associated data', error);
			throw new Error('Error setting participant token');
		}
	}

	getParticipantToken(): string | undefined {
		return this.currentTokenInfo?.token;
	}

	setParticipantRole(participantRole: ParticipantRole): void {
		this.participantRole = participantRole;
	}

	getParticipantRole(): ParticipantRole {
		return this.participantRole;
	}

	isModeratorParticipant(): boolean {
		return this.getParticipantRole() === ParticipantRole.MODERATOR;
	}

	getParticipantPermissions(): ParticipantPermissions | undefined {
		return this.currentTokenInfo?.permissions;
	}

	getParticipantRoleHeader(): Record<string, string> {
		return { 'x-participant-role': this.getParticipantRole() };
	}
}
