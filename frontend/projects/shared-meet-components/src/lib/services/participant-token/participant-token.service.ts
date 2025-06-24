import { Injectable } from '@angular/core';
import { ParticipantOptions } from '@lib/typings/ce';
import { TokenGenerationResult } from '../../models/auth.model';
import { ContextService, HttpService, SessionStorageService } from '../../services';

@Injectable({
	providedIn: 'root'
})
export class ParticipantTokenService {
	protected readonly PARTICIPANTS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/participants`;

	constructor(
		private httpService: HttpService,
		private ctxService: ContextService,
		private sessionStorageService: SessionStorageService
	) {}

	/**
	 * Generates a participant token and extracts role/permissions
	 *
	 * @param roomId - The ID of the room for which the token is generated
	 * @param participantName - The name of the participant
	 * @param secret - The secret for the participant
	 * @return A promise that resolves to a TokenGenerationResult containing the token, role, and permissions
	 */
	async generateToken(roomId: string, participantName: string, secret: string): Promise<TokenGenerationResult> {
		const path = `${this.PARTICIPANTS_API}/token`;
		const participantOptions: ParticipantOptions = {
			roomId,
			participantName,
			secret
		};
		const response = await this.httpService.postRequest<{ token: string }>(path, participantOptions);

		this.ctxService.setParticipantTokenAndUpdateContext(response.token);
		return {
			token: response.token,
			role: this.ctxService.getParticipantRole(),
			permissions: this.ctxService.getParticipantPermissions()
		};
	}

	/**
	 * Refreshes the participant token using the provided options.
	 *
	 * @param participantOptions - The options for the participant
	 * @return A promise that resolves to an object containing the new token
	 */
	async refreshParticipantToken(participantOptions: ParticipantOptions): Promise<{ token: string }> {
		const path = `${this.PARTICIPANTS_API}/token/refresh`;
		return this.httpService.postRequest(path, participantOptions);
	}
}
