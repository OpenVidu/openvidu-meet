/**
 * Represents a user in the Meet application.
 */
export interface MeetUser {
	/** Unique identifier for the user (lowercase letters, numbers, underscores) */
	userId: string;
	/** Name of the user */
	name: string;
	/** Timestamp in milliseconds since epoch when the user was registered */
	registrationDate: number;
	/** Role of the user. See {@link MeetUserRole} for details. */
	role: MeetUserRole;
	/** Hashed password for the user */
	passwordHash: string;
	/** Indicates whether the user must change their password on next login */
	mustChangePassword: boolean;
}

/**
 * Defines the possible roles for a Meet user.
 */
export enum MeetUserRole {
	/** Represents a user with administrative privileges (can manage all rooms and users) */
	ADMIN = 'admin',
	/** Represents a regular user (can manage own rooms and access rooms where they are members) */
	USER = 'user',
	/** Represents a user with permissions limited to specific rooms (can only access rooms where they are members) */
	ROOM_MEMBER = 'room_member'
}
