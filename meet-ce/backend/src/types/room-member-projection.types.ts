import type {
	MeetRoomMember,
	MeetRoomMemberField,
	MeetRoomMemberFilters,
	ProjectedEntityByFields
} from '@openvidu-meet/typings';

/** Base query inputs without the fields selector. */
type RoomMemberQueryBase = Omit<MeetRoomMemberFilters, 'fields'>;

/** Full room members, no projection. */
export type RoomMemberQuery = RoomMemberQueryBase & { fields?: undefined };

/** Strongly typed field projection. */
export type RoomMemberQueryWithProjection<TFields extends readonly MeetRoomMemberField[]> = RoomMemberQueryBase & {
	fields: TFields;
};

/** Runtime-provided projection, not strongly typed. */
export type RoomMemberQueryWithFields = RoomMemberQueryBase & {
	fields?: readonly MeetRoomMemberField[];
};

/** Room member entity projected to the requested fields tuple. */
export type ProjectedMeetRoomMember<TFields extends readonly MeetRoomMemberField[]> = ProjectedEntityByFields<
	MeetRoomMember,
	TFields
>;

/** Paginated response returned by room member list methods. */
export type MeetRoomMemberPage<TItem> = {
	members: TItem[];
	isTruncated: boolean;
	nextPageToken?: string;
};
