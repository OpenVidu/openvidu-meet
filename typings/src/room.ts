import { ParticipantPermissions, ParticipantRole } from './participant.js';
import { MeetRoomPreferences } from './room-preferences.js';

interface BaseRoomOptions {
    roomName?: string;
    autoDeletionDate?: number;
    preferences?: MeetRoomPreferences;
    // maxParticipants?: number | null;
}

/**
 * Options for creating or configuring a room.
 */
export type MeetRoomOptions = BaseRoomOptions;

/**
 * Interface representing the response received when a room is created.
 */
export interface MeetRoom extends BaseRoomOptions {
    roomId: string;
    roomName: string;
    creationDate: number;
    moderatorRoomUrl: string;
    publisherRoomUrl: string;
    markedForDeletion?: boolean;
}

export interface MeetRoomRoleAndPermissions {
    role: ParticipantRole;
    permissions: ParticipantPermissions;
}

export type MeetRoomFilters = {
    maxItems?: number;
    nextPageToken?: string;
    fields?: string;
};
