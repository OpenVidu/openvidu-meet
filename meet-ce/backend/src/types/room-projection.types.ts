import type { MeetRoomField, MeetRoomFilters } from '@openvidu-meet/typings';

/** Base query inputs without the fields selector. */
type RoomQueryBase = Omit<MeetRoomFilters, 'fields'>;

/** The access scope a list is restricted to: the rooms owned by, joined by or open to user access of the caller. */
export type RoomAccessScope = Pick<RoomQueryBase, 'owner' | 'member' | 'userAccess'>;

/** Full rooms, no projection. */
export type RoomQuery = RoomQueryBase & { fields?: undefined };

/** Strongly typed field projection. */
export type RoomQueryWithProjection<TFields extends readonly MeetRoomField[]> = RoomQueryBase & {
	fields: TFields;
};

/** Runtime-provided projection, not strongly typed. */
export type RoomQueryWithFields = RoomQueryBase & {
	fields?: readonly MeetRoomField[];
};

/** Paginated response returned by room list methods. */
export type MeetRoomPage<TItem> = {
	rooms: TItem[];
	isTruncated: boolean;
	nextPageToken?: string;
};
