import { AuthMode, AuthType, GlobalConfig } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import {
	MEET_INITIAL_API_KEY,
	MEET_INITIAL_WEBHOOK_ENABLED,
	MEET_INITIAL_WEBHOOK_URL,
	MEET_NAME_ID
} from '../environment.js';
import { GlobalConfigRepository } from '../repositories/index.js';
import { LoggerService } from './index.js';

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
	 * Retrieves the global configuration.
	 */
	async getGlobalConfig(): Promise<GlobalConfig> {
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
	async saveGlobalConfig(config: GlobalConfig): Promise<GlobalConfig> {
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
			projectId: MEET_NAME_ID,
			webhooksConfig: {
				enabled: MEET_INITIAL_WEBHOOK_ENABLED === 'true' && !!MEET_INITIAL_API_KEY,
				url: MEET_INITIAL_WEBHOOK_URL
			},
			securityConfig: {
				authentication: {
					authMethod: {
						type: AuthType.SINGLE_USER
					},
					authModeToAccessRoom: AuthMode.NONE
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
