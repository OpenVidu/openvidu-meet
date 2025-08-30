import { Injectable } from '@angular/core';
import { HttpService } from '@lib/services';
import { AuthMode, SecurityPreferences, WebhookPreferences } from '@lib/typings/ce';
import { LoggerService } from 'openvidu-components-angular';

@Injectable({
	providedIn: 'root'
})
export class GlobalPreferencesService {
	protected readonly PREFERENCES_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/preferences`;

	protected securityPreferences?: SecurityPreferences;

	protected log;

	constructor(
		protected loggerService: LoggerService,
		protected httpService: HttpService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - GlobalPreferencesService');
	}

	async getSecurityPreferences(forceRefresh = false): Promise<SecurityPreferences> {
		if (this.securityPreferences && !forceRefresh) {
			return this.securityPreferences;
		}

		try {
			const path = `${this.PREFERENCES_API}/security`;
			this.securityPreferences = await this.httpService.getRequest<SecurityPreferences>(path);
			return this.securityPreferences;
		} catch (error) {
			this.log.e('Error fetching security preferences:', error);
			throw error;
		}
	}

	async getAuthModeToAccessRoom(): Promise<AuthMode> {
		await this.getSecurityPreferences();
		return this.securityPreferences!.authentication.authModeToAccessRoom;
	}

	async saveSecurityPreferences(preferences: SecurityPreferences) {
		const path = `${this.PREFERENCES_API}/security`;
		await this.httpService.putRequest(path, preferences);
		this.securityPreferences = preferences;
	}

	async getWebhookPreferences(): Promise<WebhookPreferences> {
		try {
			const path = `${this.PREFERENCES_API}/webhooks`;
			return await this.httpService.getRequest<WebhookPreferences>(path);
		} catch (error) {
			this.log.e('Error fetching webhook preferences:', error);
			throw error;
		}
	}

	async saveWebhookPreferences(preferences: WebhookPreferences) {
		const path = `${this.PREFERENCES_API}/webhooks`;
		await this.httpService.putRequest(path, preferences);
	}

	async testWebhookUrl(url: string): Promise<void> {
		const path = `${this.PREFERENCES_API}/webhooks/test`;
		await this.httpService.postRequest(path, { url });
	}
}
