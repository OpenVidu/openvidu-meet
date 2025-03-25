import { AuthenticationPreferences } from './auth-preferences.js';

/**
 * Represents global preferences for OpenVidu Meet.
 */
export interface GlobalPreferences {
    projectId: string;
    // roomFeaturesPreferences: RoomFeaturesPreferences;
    webhooksPreferences: WebhookPreferences;
    securityPreferences: SecurityPreferences;
}

export interface WebhookPreferences {
    enabled: boolean;
    url: string;
    // events: WebhookEvent[];
}

export interface SecurityPreferences {
    authentication: AuthenticationPreferences;
    roomCreationPolicy: RoomCreationPolicy;
    // e2eEncryption: {};
}

export interface RoomCreationPolicy {
    allowRoomCreation: boolean;
    requireAuthentication: boolean;
}
