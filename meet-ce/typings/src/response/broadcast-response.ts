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

/**
 * `error` code of a broadcast request refused with `409`, a status with several causes.
 */
export enum MeetBroadcastErrorCode {
	/** `broadcastStart`: the meeting already streams to a destination with the stream key of one asked for */
	DESTINATION_IN_USE = 'destination_in_use',
	/** `broadcastStart`: no destination was asked for and the meeting already streams to every room destination */
	ALREADY_BROADCASTING = 'already_broadcasting',
	/** `broadcastStart`: the meeting has no participants to broadcast */
	NO_PARTICIPANTS = 'no_participants',
	/** `broadcastStart` and `broadcastStop`: another broadcast request of the meeting was still being applied; retry it */
	BROADCAST_BUSY = 'broadcast_busy',
	/** `broadcastStop`: the broadcast is already being stopped */
	BROADCAST_ENDING = 'broadcast_ending'
}
