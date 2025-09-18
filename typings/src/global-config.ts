import { AuthenticationConfig } from './auth-config.js';

/**
 * Represents global config for OpenVidu Meet.
 */
export interface GlobalConfig {
    projectId: string;
    securityConfig: SecurityConfig;
    webhooksConfig: WebhookConfig;
    // roomsConfig: MeetRoomConfig;
}

export interface WebhookConfig {
    enabled: boolean;
    url?: string;
    // events: WebhookEvent[];
}

export interface SecurityConfig {
    authentication: AuthenticationConfig;
}
