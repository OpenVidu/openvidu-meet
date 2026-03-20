import type { MeetRoomField, MeetRoomFilters } from '@openvidu-meet/typings';

/** Base query inputs without the fields selector. */
type MeetRoomQueryBase = Omit<MeetRoomFilters, 'fields'>;
/** Base repository query inputs with internal access-control scope. */
type MeetRoomRepositoryQueryBase = MeetRoomQueryBase & {
	owner?: string;
	roomIds?: string[];
	includeRegisteredAccessEnabled?: boolean;
};

/** Paginated response returned by room list methods. */
export type MeetRoomPage<TItem> = {
	rooms: TItem[];
	isTruncated: boolean;
	nextPageToken?: string;
};

/** Repository query: full rooms, no projection. */
export type MeetRoomRepositoryQuery = MeetRoomRepositoryQueryBase & { fields?: undefined };

/** Repository query: strongly typed field projection. */
export type MeetRoomRepositoryQueryWithProjection<TFields extends readonly MeetRoomField[]> =
	MeetRoomRepositoryQueryBase & {
		fields: TFields;
	};

/** Repository-level query options for dynamic/optional projection inputs. */
export type MeetRoomRepositoryQueryWithFields = MeetRoomRepositoryQueryBase & {
	fields?: readonly MeetRoomField[];
};
