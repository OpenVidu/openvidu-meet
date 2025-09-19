import { Injectable } from '@angular/core';
import { HttpService } from '@lib/services';
import { AuthMode, MeetAppearanceConfig, SecurityConfig, WebhookConfig } from '@lib/typings/ce';
import { LoggerService } from 'openvidu-components-angular';

@Injectable({
	providedIn: 'root'
})
export class GlobalConfigService {
	protected readonly GLOBAL_CONFIG_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/config`;

	protected securityConfig?: SecurityConfig;

	protected log;

	constructor(
		protected loggerService: LoggerService,
		protected httpService: HttpService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - GlobalConfigService');
	}

	async getSecurityConfig(forceRefresh = false): Promise<SecurityConfig> {
		if (this.securityConfig && !forceRefresh) {
			return this.securityConfig;
		}

		try {
			const path = `${this.GLOBAL_CONFIG_API}/security`;
			this.securityConfig = await this.httpService.getRequest<SecurityConfig>(path);
			return this.securityConfig;
		} catch (error) {
			this.log.e('Error fetching security config:', error);
			throw error;
		}
	}

	async getAuthModeToAccessRoom(): Promise<AuthMode> {
		await this.getSecurityConfig();
		return this.securityConfig!.authentication.authModeToAccessRoom;
	}

	async saveSecurityConfig(config: SecurityConfig) {
		const path = `${this.GLOBAL_CONFIG_API}/security`;
		await this.httpService.putRequest(path, config);
		this.securityConfig = config;
	}

	async getWebhookConfig(): Promise<WebhookConfig> {
		const path = `${this.GLOBAL_CONFIG_API}/webhooks`;
		return await this.httpService.getRequest<WebhookConfig>(path);
	}

	async saveWebhookConfig(config: WebhookConfig) {
		const path = `${this.GLOBAL_CONFIG_API}/webhooks`;
		await this.httpService.putRequest(path, config);
	}

	async testWebhookUrl(url: string): Promise<void> {
		const path = `${this.GLOBAL_CONFIG_API}/webhooks/test`;
		await this.httpService.postRequest(path, { url });
	}

	async getRoomsAppearanceConfig(): Promise<{ appearance: MeetAppearanceConfig }> {
		const path = `${this.GLOBAL_CONFIG_API}/rooms/appearance`;
		return await this.httpService.getRequest<{ appearance: MeetAppearanceConfig }>(path);
	}

	async saveRoomsAppearanceConfig(config: MeetAppearanceConfig) {
		const path = `${this.GLOBAL_CONFIG_API}/rooms/appearance`;
		await this.httpService.putRequest(path, { appearance: config });
	}
}
