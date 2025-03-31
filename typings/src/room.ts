import { RoomPreferences } from './room-preferences.js';

interface BaseRoomOptions {
	expirationDate: number;
	roomNamePrefix?: string;
	preferences?: RoomPreferences;
	maxParticipants?: number | null;
}
/**
 * Options for creating or configuring a room.
 */
export type MeetRoomOptions = BaseRoomOptions;

/**
 * Interface representing the response received when a room is created.
 */
export interface MeetRoom extends BaseRoomOptions {
	roomName: string;
	creationDate: number;
	moderatorRoomUrl: string;
	publisherRoomUrl: string;
}
