import { inject, Injectable } from '@angular/core';
import { AuthMode, MeetAppearanceConfig, SecurityConfig, WebhookConfig } from '@openvidu-meet/typings';
import { ILogger, LoggerService } from 'openvidu-components-angular';
import { FeatureConfigurationService } from './feature-configuration.service';
import { HttpService } from './http.service';

@Injectable({
	providedIn: 'root'
})
export class GlobalConfigService {
	protected readonly GLOBAL_CONFIG_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/config`;
	protected securityConfig?: SecurityConfig;
	protected loggerService: LoggerService = inject(LoggerService);
	protected httpService: HttpService = inject(HttpService);
	protected featureConfService: FeatureConfigurationService = inject(FeatureConfigurationService);
	protected log: ILogger = this.loggerService.get('OpenVidu Meet - GlobalConfigService');
	constructor() {}

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

	async loadRoomsAppearanceConfig(): Promise<void> {
		try {
			const config = await this.getRoomsAppearanceConfig();
			this.featureConfService.setAppearanceConfig(config.appearance);
		} catch (error) {
			this.log.e('Error loading rooms appearance config:', error);
			throw error;
		}
	}

	async saveRoomsAppearanceConfig(config: MeetAppearanceConfig) {
		const path = `${this.GLOBAL_CONFIG_API}/rooms/appearance`;
		await this.httpService.putRequest(path, { appearance: config });
	}

	private async getCaptionsConfig(): Promise<{ enabled: boolean }> {
		const path = `${this.GLOBAL_CONFIG_API}/captions`;
		return await this.httpService.getRequest<{ enabled: boolean }>(path);
	}

	async loadCaptionsConfig(): Promise<void> {
		try {
			const config = await this.getCaptionsConfig();
			this.featureConfService.setCaptionsGlobalConfig(config.enabled);
		} catch (error) {
			this.log.e('Error loading captions config:', error);
			throw error;
		}
	}
}
