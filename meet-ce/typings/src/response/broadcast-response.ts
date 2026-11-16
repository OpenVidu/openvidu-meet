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
	'destination',
	'layout',
	'encoding',
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

/**
 * Answer of `bulkStopBroadcasts`: `200` when all were stopped, `400` when any was not.
 */
export interface MeetBroadcastBulkStopResponse {
	/** Summary of the outcome */
	message: string;
	/** Identifiers of the broadcasts stopped */
	deleted: string[];
	/** The broadcasts not stopped */
	failed: {
		/** Identifier of the broadcast not stopped */
		broadcastId: string;
		/** Why the broadcast was not stopped */
		error: string;
	}[];
}
