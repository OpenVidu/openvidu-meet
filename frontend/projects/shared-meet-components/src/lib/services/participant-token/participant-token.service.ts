import { Injectable } from '@angular/core';
import { TokenGenerationResult } from '@lib/models/auth.model';
import { HttpService, ContextService, SessionStorageService } from 'shared-meet-components';

@Injectable({
	providedIn: 'root'
})
export class ParticipantTokenService {
	constructor(
		private httpService: HttpService,
		private ctxService: ContextService,
		private sessionStorageService: SessionStorageService
	) {}

	/**
	 * Generates a participant token and extracts role/permissions
	 */
	async generateToken(roomId: string, participantName: string, secret: string): Promise<TokenGenerationResult> {
		const response = await this.httpService.generateParticipantToken({
			roomId,
			participantName,
			secret
		});

		this.ctxService.setParticipantTokenAndUpdateContext(response.token);

		return {
			token: response.token,
			role: this.ctxService.getParticipantRole(),
			permissions: this.ctxService.getParticipantPermissions()
		};
	}
}
