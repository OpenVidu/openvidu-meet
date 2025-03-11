/**
 * Represents global preferences for OpenVidu Meet.
 */
export interface GlobalPreferences {
	projectId: string;
	// roomFeaturesPreferences: RoomFeaturesPreferences;
	webhooksPreferences: WebhookPreferences;
	// securityPreferences: SecurityPreferences;
}

export interface WebhookPreferences {
	enabled: boolean;
	url: string;
	// events: WebhookEvent[];
}

// export interface SecurityPreferences {
// 	authentication: AuthenticationPreferences;
// 	e2eEncryption: {}

// }

// export interface AuthenticationPreferences {
// 	requiresAuthentication: boolean;
// 	authenticationMethod: AuthMethod; // Método de autenticación
// 	userAccessControl: UserAccessControl; // Control sobre quién puede acceder y cómo
// }
