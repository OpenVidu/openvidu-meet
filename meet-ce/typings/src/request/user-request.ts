import { MeetUserRole } from '../database/user.entity.js';

/**
 * Options for creating a new Meet user.
 */
export interface MeetUserOptions {
	/** Unique identifier for the user (lowercase letters, numbers, underscores) */
	userId: string;
	/** Name of the user */
	name: string;
	/** Role of the user. See {@link MeetUserRole} for details. */
	role: MeetUserRole;
	/** Plain text password for the user (will be hashed before storage) */
	password: string;
}
