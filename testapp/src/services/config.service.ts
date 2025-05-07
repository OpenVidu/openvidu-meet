import { Logger } from '../utils/logger.js';

/**
 * Service for handling configuration and environment variables
 */
export class ConfigService {
  private static instance: ConfigService;
  private logger: Logger;

  // Environment variables with defaults
  public readonly meetApiUrl: string;
  public readonly apiKey: string;
  public readonly port: number;

  private constructor() {
    this.logger = new Logger('ConfigService');

    // Load environment variables with defaults
    this.meetApiUrl = process.env.OPENVIDU_MEET_URL || 'http://localhost:6080/meet/api/v1';
    this.apiKey = process.env.API_KEY || 'meet-api-key';
    this.port = parseInt(process.env.PORT || '5080', 10);

    this.logger.debug('Configuration loaded:', {
      meetApiUrl: this.meetApiUrl,
      port: this.port,
      // Don't log sensitive data like API keys
    });
  }

  /**
   * Get singleton instance of ConfigService
   */
  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Get API headers with authentication
   */
  public getApiHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-API-KEY': this.apiKey
    };
  }
}