export interface MeetUser {
	username: string;
	passwordHash: string;
	roles: MeetUserRole[];
}

export enum MeetUserRole {
	// Represents a user with administrative privileges
	ADMIN = 'admin',
	// Represents a regular user with standard access
	USER = 'user',
	// Represents a user who accesses the application via an API key
	APP = 'app',
}

export type MeetUserDTO = Omit<MeetUser, 'passwordHash'>;
