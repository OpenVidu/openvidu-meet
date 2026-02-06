import { MeetRoom, MeetRoomMemberPermissions, MeetRoomStatus, SortAndPagination } from '@openvidu-meet/typings';

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
 * Properties of a {@link MeetRoom} that can be expanded into full objects instead of stubs.
 */
export const MEET_ROOM_EXPANDABLE_FIELDS = ['config'] as const satisfies readonly ExpandableKey<MeetRoom>[];

/**
 * Properties of a room that can be expanded in the API response.
 */
export type MeetRoomExpandableProperties = (typeof MEET_ROOM_EXPANDABLE_FIELDS)[number];

/**
 * Properties of a room that can be collapsed in the API response.
 */
export type MeetRoomCollapsibleProperties = MeetRoomExpandableProperties;

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

export const SENSITIVE_ROOM_FIELDS_ENTRIES = Object.entries(SENSITIVE_ROOM_FIELDS_BY_PERMISSION) as ReadonlyArray<[
	keyof MeetRoomMemberPermissions,
	MeetRoomField[]
]>;

/**
 * Filters for querying rooms with pagination, sorting, field selection, and expand support.
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
	 * Expand specified properties in the response
	 */
	expand?: MeetRoomExpandableProperties[];
}

/**
 * Options for configuring the response MeetRoom REST API object
 */
export interface MeetRoomResponseOptions {
	/**
	 * Array of fields to include in the response.
	 * If not specified, all fields are included.
	 */
	fields?: MeetRoomField[];
	/**
	 * Array of collapsed properties to expand in the response.
	 * If not specified, no collapsed properties are expanded.
	 */
	collapse?: MeetRoomCollapsibleProperties[];
	/**
	 * Whether to check permissions for the room.
	 * If true, sensitive properties will be removed from the response if the requester does not have permission to view them.
	 */
	applyPermissionFiltering?: boolean;
}

/**
 * Stub that indicates a property can be expanded.
 */
export interface ExpandableStub {
	_expandable: true;
	_href: string;
}

/**
 * It produces a union type of property names that can be considered
 * "expandable", meaning they reference nested objects rather than
 * primitive values.
 */
type ExpandableKey<T> = {
	[K in keyof T]: T[K] extends object ? K : never;
}[keyof T];
