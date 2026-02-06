import { MeetRecordingInfo, MeetRecordingStatus, SortAndPagination } from '@openvidu-meet/typings';

/**
 * List of all valid fields that can be selected from a MeetRecordingInfo.
 * This array is the source of truth and TypeScript validates it matches the MeetRecordingInfo interface.
 * If you add a property to MeetRecordingInfo, TypeScript will error until you add it here.
 */
export const MEET_RECORDING_FIELDS = [
	'recordingId',
	'roomId',
	'roomName',
	'status',
	'layout',
	'encoding',
	'filename',
	'startDate',
	'endDate',
	'duration',
	'size',
	'errorCode',
	'error',
	'details'
] as const satisfies readonly (keyof MeetRecordingInfo)[];

/**
 * Properties of a {@link MeetRecordingInfo} that can be included in the API response when fields filtering is applied.
 * Derived from MEET_RECORDING_FIELDS array which is validated by TypeScript to match MeetRecordingInfo keys.
 */
export type MeetRecordingField = (typeof MEET_RECORDING_FIELDS)[number];

/**
 * Filters for querying recordings with pagination, sorting and field selection.
 */
export interface MeetRecordingFilters extends SortAndPagination {
	/**
	 * Filter recordings by room ID (exact match)
	 */
	roomId?: string;
	/**
	 * Filter recordings by room name (case-insensitive partial match)
	 */
	roomName?: string;
	/**
	 * Filter recordings by status
	 */
	status?: MeetRecordingStatus;
	/**
	 * Array of fields to include in the response
	 */
	fields?: MeetRecordingField[];
}
