import { MeetRoomMemberPermissions } from './permissions/meet-permissions.js';
import { MeetRoom, MeetRoomStatus } from './room.js';
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
 * Utility type to extract keys of T that are objects, used to define which fields can be extraFields.
 */
type ExtraFieldKey<T> = {
	[K in keyof T]: T[K] extends object ? K : never;
}[keyof T];
