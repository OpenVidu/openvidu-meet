import { MeetRoomMemberPermissions } from '../database/room-member-permissions.js';
import { MeetRoom, MeetRoomStatus } from '../database/room.entity.js';
import { SortAndPagination } from './sort-pagination.js';

/**
 * List of all valid fields that can be selected from a MeetRoom.
 * This array is the source of truth and TypeScript validates it matches the MeetRoom interface.
 * If you add a property to MeetRoom, TypeScript will error until you add it here.
 */
export const MEET_ROOM_FIELDS = [
	'roomId',
	'roomName',
	'owner',
	'creationDate',
	'config',
	'roles',
	'anonymous',
	'accessUrl',
	'status',
	'rolesUpdatedAt',
	'meetingEndAction',
	'autoDeletionDate',
	'autoDeletionPolicy'
] as const satisfies readonly (keyof MeetRoom)[];

/**
 * Properties of a {@link MeetRoom} that can be included as extra fields in the API response.
 * These fields are not included by default and must be explicitly requested via extraFields parameter.
 */
export const MEET_ROOM_EXTRA_FIELDS = ['config'] as const satisfies readonly ExtraFieldKey<MeetRoom>[];

/**
 * Properties of a room that can be requested as extra fields in the API response.
 */
export type MeetRoomExtraField = (typeof MEET_ROOM_EXTRA_FIELDS)[number];

/**
 * Properties of a {@link MeetRoom} that can be included in the API response when fields filtering is applied.
 * Derived from MEET_ROOM_FIELDS array which is validated by TypeScript to match MeetRoom keys.
 */
export type MeetRoomField = (typeof MEET_ROOM_FIELDS)[number];

/**
 * Sensitive fields of a MeetRoom that require specific permissions to be viewed.
 */
export const SENSITIVE_ROOM_FIELDS_BY_PERMISSION: Partial<Record<keyof MeetRoomMemberPermissions, MeetRoomField[]>> = {
	canShareAccessLinks: ['anonymous']
};

export const SENSITIVE_ROOM_FIELDS_ENTRIES = Object.entries(SENSITIVE_ROOM_FIELDS_BY_PERMISSION) as ReadonlyArray<
	[keyof MeetRoomMemberPermissions, MeetRoomField[]]
>;

/**
 * Filters for querying rooms with pagination, sorting, field selection, and extra fields support.
 */
export interface MeetRoomFilters extends SortAndPagination {
	/**
	 * Filter rooms by name (case-insensitive partial match)
	 */
	roomName?: string;
	/**
	 * Filter rooms by status
	 */
	status?: MeetRoomStatus;
	/**
	 * Array of fields to include in the response
	 */
	fields?: MeetRoomField[];
	/**
	 * Extra fields to include in the response (fields not included by default)
	 */
	extraFields?: MeetRoomExtraField[];
}

/**
 * Successs codes returned after successfully deleting a room, indicating the outcome of the deletion operation.
 */
export enum MeetRoomDeletionSuccessCode {
	ROOM_DELETED = 'room_deleted',
	ROOM_WITH_ACTIVE_MEETING_DELETED = 'room_with_active_meeting_deleted',
	ROOM_WITH_ACTIVE_MEETING_SCHEDULED_TO_BE_DELETED = 'room_with_active_meeting_scheduled_to_be_deleted',
	ROOM_AND_RECORDINGS_DELETED = 'room_and_recordings_deleted',
	ROOM_CLOSED = 'room_closed',
	ROOM_WITH_ACTIVE_MEETING_AND_RECORDINGS_DELETED = 'room_with_active_meeting_and_recordings_deleted',
	ROOM_WITH_ACTIVE_MEETING_CLOSED = 'room_with_active_meeting_closed',
	ROOM_WITH_ACTIVE_MEETING_AND_RECORDINGS_SCHEDULED_TO_BE_DELETED = 'room_with_active_meeting_and_recordings_scheduled_to_be_deleted',
	ROOM_WITH_ACTIVE_MEETING_SCHEDULED_TO_BE_CLOSED = 'room_with_active_meeting_scheduled_to_be_closed'
}

/**
 * Error codes that can be returned when attempting to delete a room, indicating why the deletion operation failed.
 */
export enum MeetRoomDeletionErrorCode {
	ROOM_HAS_ACTIVE_MEETING = 'room_has_active_meeting',
	ROOM_HAS_RECORDINGS = 'room_has_recordings',
	ROOM_WITH_ACTIVE_MEETING_HAS_RECORDINGS = 'room_with_active_meeting_has_recordings',
	ROOM_WITH_ACTIVE_MEETING_HAS_RECORDINGS_CANNOT_SCHEDULE_DELETION = 'room_with_active_meeting_has_recordings_cannot_schedule_deletion',
	ROOM_WITH_RECORDINGS_HAS_ACTIVE_MEETING = 'room_with_recordings_has_active_meeting'
}

/**
 * Utility type to extract keys of T that are objects, used to define which fields can be extraFields.
 */
type ExtraFieldKey<T> = {
	[K in keyof T]: T[K] extends object ? K : never;
}[keyof T];
