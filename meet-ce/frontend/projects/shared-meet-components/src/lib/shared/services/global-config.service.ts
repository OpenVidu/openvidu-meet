import { inject, Injectable } from '@angular/core';
import { MeetAppearanceConfig, SecurityConfig, WebhookConfig } from '@openvidu-meet/typings';
import { ILogger, LoggerService } from 'openvidu-components-angular';
import { HttpService } from './http.service';
import { RoomFeatureService } from './room-feature.service';

@Injectable({
	providedIn: 'root'
})
export class GlobalConfigService {
	protected readonly GLOBAL_CONFIG_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/config`;

	protected loggerService: LoggerService = inject(LoggerService);
	protected httpService: HttpService = inject(HttpService);
	protected roomFeatureService: RoomFeatureService = inject(RoomFeatureService);

	protected log: ILogger = this.loggerService.get('OpenVidu Meet - GlobalConfigService');

	constructor() {}

	async getSecurityConfig(): Promise<SecurityConfig> {
		const path = `${this.GLOBAL_CONFIG_API}/security`;
		return await this.httpService.getRequest<SecurityConfig>(path);
	}

	async saveSecurityConfig(config: SecurityConfig) {
		const path = `${this.GLOBAL_CONFIG_API}/security`;
		await this.httpService.putRequest(path, config);
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
			this.roomFeatureService.setAppearanceConfig(config.appearance);
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
			this.roomFeatureService.setCaptionsGlobalConfig(config.enabled);
		} catch (error) {
			this.log.e('Error loading captions config:', error);
			throw error;
		}
	}
}
