import { GlobalConfig, MeetAppearanceConfig, SecurityConfig, WebhookConfig } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MEET_ENV } from '../environment.js';
import { GlobalConfigRepository } from '../repositories/global-config.repository.js';
import { LoggerService } from './logger.service.js';

/**
 * Service for managing global configuration.
 * Handles initialization, retrieval and updates of system-wide configuration.
 */
@injectable()
export class GlobalConfigService {
	constructor(
		@inject(LoggerService) private logger: LoggerService,
		@inject(GlobalConfigRepository) private globalConfigRepository: GlobalConfigRepository
	) {}

	/**
	 * Initializes the global configuration with default values.
	 * This should only be called during system initialization if no config exists.
	 */
	async initializeGlobalConfig(): Promise<void> {
		try {
			const defaultConfig = this.getDefaultConfig();
			await this.globalConfigRepository.create(defaultConfig);
			this.logger.info('Global config initialized with default values');
		} catch (error) {
			this.logger.error('Error initializing global config:', error);
			throw error;
		}
	}

	/**
	 * Retrieves the webhook configuration.
	 *
	 * @returns The webhook configuration
	 */
	async getWebhookConfig(): Promise<WebhookConfig> {
		try {
			const config = await this.getGlobalConfig();
			return config.webhooksConfig;
		} catch (error) {
			this.logger.error('Error retrieving webhook config:', error);
			throw error;
		}
	}

	/**
	 * Updates the webhook configuration.
	 *
	 * @param webhookConfig - The webhook configuration to update
	 * @returns The updated webhook configuration
	 */
	async updateWebhookConfig(webhookConfig: WebhookConfig): Promise<WebhookConfig> {
		try {
			const globalConfig = await this.getGlobalConfig();

			globalConfig.webhooksConfig = {
				enabled: webhookConfig.enabled,
				url: webhookConfig.url === undefined ? globalConfig.webhooksConfig.url : webhookConfig.url
			};

			await this.saveGlobalConfig(globalConfig);
			this.logger.info('Webhook config updated successfully');
			return globalConfig.webhooksConfig;
		} catch (error) {
			this.logger.error('Error updating webhook config:', error);
			throw error;
		}
	}

	/**
	 * Retrieves the security configuration.
	 *
	 * @returns The security configuration
	 */
	async getSecurityConfig(): Promise<SecurityConfig> {
		try {
			const config = await this.getGlobalConfig();
			return config.securityConfig;
		} catch (error) {
			this.logger.error('Error retrieving security config:', error);
			throw error;
		}
	}

	/**
	 * Updates the security configuration.
	 *
	 * @param securityConfig - The security configuration to update
	 * @returns The updated security configuration
	 */
	async updateSecurityConfig(securityConfig: SecurityConfig): Promise<SecurityConfig> {
		try {
			const globalConfig = await this.getGlobalConfig();
			globalConfig.securityConfig.authentication = { ...securityConfig.authentication };
			await this.saveGlobalConfig(globalConfig);
			this.logger.info('Security config updated successfully');
			return globalConfig.securityConfig;
		} catch (error) {
			this.logger.error('Error updating security config:', error);
			throw error;
		}
	}

	/**
	 * Retrieves the rooms appearance configuration.
	 *
	 * @returns The rooms appearance configuration
	 */
	async getRoomsAppearanceConfig(): Promise<{ appearance: MeetAppearanceConfig }> {
		try {
			const config = await this.getGlobalConfig();
			return config.roomsConfig;
		} catch (error) {
			this.logger.error('Error retrieving rooms appearance config:', error);
			throw error;
		}
	}

	/**
	 * Updates the rooms appearance configuration.
	 *
	 * @param appearanceConfig - The appearance configuration to update
	 * @returns The updated appearance configuration
	 */
	async updateRoomsAppearanceConfig(appearanceConfig: {
		appearance: MeetAppearanceConfig;
	}): Promise<{ appearance: MeetAppearanceConfig }> {
		try {
			const globalConfig = await this.getGlobalConfig();

			if (globalConfig.roomsConfig.appearance.themes.length > 0) {
				// Preserve existing theme colors if they are not provided in the update
				const existingTheme = globalConfig.roomsConfig.appearance.themes[0];
				const newTheme = appearanceConfig.appearance.themes[0];

				newTheme.backgroundColor = newTheme.backgroundColor ?? existingTheme.backgroundColor;
				newTheme.primaryColor = newTheme.primaryColor ?? existingTheme.primaryColor;
				newTheme.secondaryColor = newTheme.secondaryColor ?? existingTheme.secondaryColor;
				newTheme.accentColor = newTheme.accentColor ?? existingTheme.accentColor;
				newTheme.surfaceColor = newTheme.surfaceColor ?? existingTheme.surfaceColor;
			}

			globalConfig.roomsConfig = appearanceConfig;
			await this.saveGlobalConfig(globalConfig);
			this.logger.info('Rooms appearance config updated successfully');
			return globalConfig.roomsConfig;
		} catch (error) {
			this.logger.error('Error updating rooms appearance config:', error);
			throw error;
		}
	}

	/**
	 * Retrieves the global configuration.
	 */
	protected async getGlobalConfig(): Promise<GlobalConfig> {
		try {
			const config = await this.globalConfigRepository.get();

			if (!config) {
				this.logger.error('Global config not found');
				throw new Error('Global config not found');
			}

			return config;
		} catch (error) {
			this.logger.error('Error retrieving global config:', error);
			throw error;
		}
	}

	/**
	 * Updates the global configuration.
	 *
	 * NOTE: This method only updates an existing configuration.
	 * If no global config exists, it will throw an error.
	 *
	 * @param config - The global configuration to save
	 * @returns The updated global configuration
	 * @throws Error if global config does not exist
	 */
	protected async saveGlobalConfig(config: GlobalConfig): Promise<GlobalConfig> {
		try {
			// Update existing config (will throw if not found)
			const updated = await this.globalConfigRepository.update(config);
			this.logger.info('Global config updated successfully');
			return updated;
		} catch (error) {
			this.logger.error('Error saving global config:', error);
			throw error;
		}
	}

	/**
	 * Returns the default global configuration.
	 *
	 * @returns The default GlobalConfig object
	 */
	protected getDefaultConfig(): GlobalConfig {
		const defaultConfig: GlobalConfig = {
			projectId: MEET_ENV.NAME_ID,
			webhooksConfig: {
				enabled: MEET_ENV.INITIAL_WEBHOOK_ENABLED === 'true' && !!MEET_ENV.INITIAL_API_KEY,
				url: MEET_ENV.INITIAL_WEBHOOK_URL
			},
			securityConfig: {
				authentication: {
					allowUserCreation: true,
					oauthProviders: []
				}
			},
			roomsConfig: {
				appearance: {
					themes: []
				}
			}
		};
		return defaultConfig;
	}
}
