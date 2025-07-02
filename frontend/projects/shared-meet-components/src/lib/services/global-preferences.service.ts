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
	protected webhookPreferences?: WebhookPreferences;

	protected log;

	constructor(
		protected loggerService: LoggerService,
		protected httpService: HttpService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - GlobalPreferencesService');
	}

	async getSecurityPreferences(): Promise<SecurityPreferences> {
		if (this.securityPreferences) {
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
		await this.httpService.putRequest<SecurityPreferences>(path, preferences);
		this.securityPreferences = preferences;
	}

	async getWebhookPreferences(): Promise<WebhookPreferences> {
		if (this.webhookPreferences) {
			return this.webhookPreferences;
		}

		try {
			const path = `${this.PREFERENCES_API}/webhooks`;
			this.webhookPreferences = await this.httpService.getRequest<WebhookPreferences>(path);
			return this.webhookPreferences;
		} catch (error) {
			this.log.e('Error fetching webhook preferences:', error);
			throw error;
		}
	}

	async saveWebhookPreferences(preferences: WebhookPreferences) {
		const path = `${this.PREFERENCES_API}/webhooks`;
		await this.httpService.putRequest<WebhookPreferences>(path, preferences);
		this.webhookPreferences = preferences;
	}

	async testWebhookUrl(url: string): Promise<void> {
		const path = `${this.PREFERENCES_API}/webhooks/test`;
		await this.httpService.postRequest(path, { url });
	}
}
