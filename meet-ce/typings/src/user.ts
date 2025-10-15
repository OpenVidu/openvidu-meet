export interface User {
	username: string;
	passwordHash: string;
	roles: UserRole[];
}

export enum UserRole {
	// Represents a user with administrative privileges
	ADMIN = 'admin',
	// Represents a regular user with standard access
	USER = 'user',
	// Represents a user who accesses the application via an API key
	APP = 'app',
}

export type UserDTO = Omit<User, 'passwordHash'>;
