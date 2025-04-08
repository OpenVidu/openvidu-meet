import { MeetRoomPreferences } from './room-preferences.js';

interface BaseRoomOptions {
	autoDeletionDate?: number;
	roomIdPrefix?: string;
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
	creationDate: number;
	moderatorRoomUrl: string;
	publisherRoomUrl: string;
}

export type MeetRoomFilters = {
	maxItems?: number;
	nextPageToken?: string;
	fields?: string;
};