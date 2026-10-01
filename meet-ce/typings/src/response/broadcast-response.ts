import { MeetBroadcastInfo } from '../database/broadcast.entity.js';

/**
 * List of all valid fields that can be selected from a MeetBroadcastInfo.
 * IMPORTANT: Update this list if new properties are added to the MeetBroadcastInfo interface.
 */
export const MEET_BROADCAST_FIELDS = [
	'broadcastId',
	'roomId',
	'roomName',
	'status',
	'layout',
	'encoding',
	'destinations',
	'startDate',
	'endDate',
	'duration',
	'errorCode',
	'error',
	'details'
] as const satisfies readonly (keyof MeetBroadcastInfo)[];

/**
 * Properties of a {@link MeetBroadcastInfo} that can be included in the API response when fields filtering is applied.
 */
export type MeetBroadcastField = (typeof MEET_BROADCAST_FIELDS)[number];
