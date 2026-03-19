import type {
	MeetRecordingField,
	MeetRecordingFilters,
	MeetRecordingInfo,
	ProjectedEntityByFields
} from '@openvidu-meet/typings';

/** Base query inputs without the fields selector. */
type MeetRecordingQueryBase = Omit<MeetRecordingFilters, 'fields'>;
/** Base repository query inputs with internal access-control scope. */
type MeetRecordingRepositoryQueryBase = MeetRecordingQueryBase & { roomIds?: string[] };

/** Paginated response returned by recording list methods. */
export type MeetRecordingPage<TItem> = {
	recordings: TItem[];
	isTruncated: boolean;
	nextPageToken?: string;
};

/** Recording entity projected to the requested fields tuple. */
export type ProjectedRecording<TFields extends readonly MeetRecordingField[]> = ProjectedEntityByFields<
	MeetRecordingInfo,
	TFields
>;

// ------- Service-level query types for stricter typing and encapsulation of internal fields and access control. -------

/** Service query: full recordings, no projection. */
export type MeetRecordingServiceQuery = MeetRecordingQueryBase & { fields?: undefined };

/** Service query: strongly typed field projection. */
export type MeetRecordingServiceQueryWithProjection<TFields extends readonly MeetRecordingField[]> =
	MeetRecordingQueryBase & {
		fields: TFields;
	};

/** Service query: runtime-provided projection, not strongly typed. */
export type MeetRecordingServiceQueryWithFields = MeetRecordingQueryBase & { fields?: readonly MeetRecordingField[] };

// ------- Repository-specific types for stricter typing and encapsulation of internal fields and access control. -------

/** Repository query: full recordings, no projection. */
export type MeetRecordingRepositoryQuery = MeetRecordingRepositoryQueryBase & { fields?: undefined };

/** Repository query: strongly typed field projection. */
export type MeetRecordingRepositoryQueryWithProjection<TFields extends readonly MeetRecordingField[]> =
	MeetRecordingRepositoryQueryBase & {
		fields: TFields;
	};

/** Repository query: runtime-provided projection, not strongly typed. */
export type MeetRecordingRepositoryQueryWithFields = MeetRecordingRepositoryQueryBase & {
	fields?: readonly MeetRecordingField[];
};
