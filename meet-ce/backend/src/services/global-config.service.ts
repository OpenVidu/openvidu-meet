import type { GlobalConfig, MeetAppearanceConfig, SecurityConfig, WebhookConfig } from '@openvidu-meet/typings';
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
			const webhookConfig = await this.getGlobalConfigField('webhooksConfig');
			return webhookConfig;
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
			const webhookConfigDB = await this.getGlobalConfigField('webhooksConfig');
			const updatedConfig = await this.globalConfigRepository.updatePartial({
				webhooksConfig: {
					enabled: webhookConfig.enabled,
					url: webhookConfig.url === undefined ? webhookConfigDB.url : webhookConfig.url
				}
			});
			this.logger.info('Webhook config updated successfully');
			return updatedConfig.webhooksConfig;
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
			const securityConfig = await this.getGlobalConfigField('securityConfig');
			return securityConfig;
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
			const updatedConfig = await this.globalConfigRepository.updatePartial({ securityConfig });
			this.logger.info('Security config updated successfully');
			return updatedConfig.securityConfig;
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
			const roomsConfig = await this.getGlobalConfigField('roomsConfig');
			return roomsConfig;
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
			const roomsConfigDB = await this.getGlobalConfigField('roomsConfig');
			const updatedRoomsConfig = {
				...appearanceConfig
			};

			if (roomsConfigDB.appearance.themes.length > 0) {
				// Preserve existing theme colors if they are not provided in the update
				const existingTheme = roomsConfigDB.appearance.themes[0];
				const newTheme = updatedRoomsConfig.appearance.themes[0];

				newTheme.backgroundColor = newTheme.backgroundColor ?? existingTheme.backgroundColor;
				newTheme.primaryColor = newTheme.primaryColor ?? existingTheme.primaryColor;
				newTheme.secondaryColor = newTheme.secondaryColor ?? existingTheme.secondaryColor;
				newTheme.accentColor = newTheme.accentColor ?? existingTheme.accentColor;
				newTheme.surfaceColor = newTheme.surfaceColor ?? existingTheme.surfaceColor;
			}

			const updatedConfig = await this.globalConfigRepository.updatePartial({ roomsConfig: updatedRoomsConfig });
			this.logger.info('Rooms appearance config updated successfully');
			return updatedConfig.roomsConfig;
		} catch (error) {
			this.logger.error('Error updating rooms appearance config:', error);
			throw error;
		}
	}

	/**
	 * Retrieves a specific field from the global configuration.
	 *
	 * @param field - The field name to retrieve
	 * @returns The value of the requested field
	 * @throws Error if global config is not found
	 */
	protected async getGlobalConfigField<T extends keyof GlobalConfig>(field: T): Promise<GlobalConfig[T]> {
		try {
			const config = await this.globalConfigRepository.get([field]);

			if (!config) {
				this.logger.error('Global config not found');
				throw new Error('Global config not found');
			}

			return config[field];
		} catch (error) {
			this.logger.error('Error retrieving global config:', error);
			throw error;
		}
	}

	/**
	 * Returns the default global configuration.
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
