import { SortAndPagination } from './sort-pagination.js';

/**
 * Options for creating a new Meet user.
 */
export interface MeetUserOptions {
    userId: string; // Unique identifier for the user (lowercase letters, numbers, underscores)
    name: string; // Name of the user
    role: MeetUserRole; // Role of the user
    password: string; // Plain text password for the user (will be hashed before storage)
}

export interface MeetUser {
    userId: string;
    name: string;
    registrationDate: number;
    role: MeetUserRole;
    passwordHash: string;
    mustChangePassword: boolean;
}

export enum MeetUserRole {
    // Represents a user with administrative privileges (can manage all rooms and users)
    ADMIN = 'admin',
    // Represents a regular user (can manage own rooms and access rooms where they are members)
    USER = 'user',
    // Represents a room member role (used for room-specific access)
    ROOM_MEMBER = 'room_member'
}

export type MeetUserDTO = Omit<MeetUser, 'passwordHash' | 'mustChangePassword'>;

export interface MeetUserFilters extends SortAndPagination {
    userId?: string;
    name?: string;
    role?: MeetUserRole;
}
