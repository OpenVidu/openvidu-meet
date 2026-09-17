import { inject, Service, signal } from '@angular/core';
import { MeetAppearanceConfig } from '@openvidu-meet/typings';
import { HttpService } from './http.service';
import { LoggerService } from './logger.service';
import type { ILogger } from '../models/logger.model';

@Service()
export class GlobalConfigService {
	protected readonly GLOBAL_CONFIG_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/config`;

	protected loggerService: LoggerService = inject(LoggerService);
	protected httpService: HttpService = inject(HttpService);

	protected log: ILogger = this.loggerService.get('OpenVidu Meet - GlobalConfigService');

	private readonly _roomAppearanceConfig = signal<MeetAppearanceConfig>({
		themes: []
	});
	private readonly _captionsGlobalEnabled = signal<boolean>(false);

	readonly roomAppearanceConfig = this._roomAppearanceConfig.asReadonly();
	readonly captionsGlobalEnabled = this._captionsGlobalEnabled.asReadonly();

	constructor() {}

	// No screen reads or writes the global security config yet: the console only edits appearance, and
	// the GET requires an administrator because it returns the OAuth provider credentials. These two
	// stay commented, with `SecurityConfig` out of the imports, until the OAuth login needs them.
	//
	// async getSecurityConfig(): Promise<SecurityConfig> {
	// 	const path = `${this.GLOBAL_CONFIG_API}/security`;
	// 	return await this.httpService.getRequest<SecurityConfig>(path);
	// }
	//
	// async saveSecurityConfig(config: SecurityConfig) {
	// 	const path = `${this.GLOBAL_CONFIG_API}/security`;
	// 	await this.httpService.putRequest(path, config);
	// }

	async getRoomsAppearanceConfig(): Promise<{ appearance: MeetAppearanceConfig }> {
		const path = `${this.GLOBAL_CONFIG_API}/rooms/appearance`;
		return await this.httpService.getRequest<{ appearance: MeetAppearanceConfig }>(path);
	}

	async loadRoomsAppearanceConfig(): Promise<void> {
		try {
			const { appearance } = await this.getRoomsAppearanceConfig();
			this._roomAppearanceConfig.set(appearance);
		} catch (error) {
			this.log.e('Error loading rooms appearance config:', error);
			throw error;
		}
	}

	async loadCaptionsConfig(): Promise<void> {
		try {
			const { enabled } = await this.getCaptionsConfig();
			this._captionsGlobalEnabled.set(enabled);
		} catch (error) {
			this.log.e('Error loading captions config:', error);
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
}
