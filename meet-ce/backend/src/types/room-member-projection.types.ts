import type {
	MeetRoomMember,
	MeetRoomMemberField,
	MeetRoomMemberFilters,
	ProjectedEntityByFields
} from '@openvidu-meet/typings';

/** Base query inputs without the fields selector. */
type MeetRoomMemberQueryBase = Omit<MeetRoomMemberFilters, 'fields'>;

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

/** Query: full room members, no projection. */
export type RoomMemberQuery = MeetRoomMemberQueryBase & { fields?: undefined };

/** Query: strongly typed field projection. */
export type RoomMemberQueryWithProjection<TFields extends readonly MeetRoomMemberField[]> = MeetRoomMemberQueryBase & {
	fields: TFields;
};

/** Query options for dynamic/optional room-member projection inputs. */
export type MeetRoomMemberQueryWithFields = MeetRoomMemberQueryBase & {
	fields?: readonly MeetRoomMemberField[];
};
