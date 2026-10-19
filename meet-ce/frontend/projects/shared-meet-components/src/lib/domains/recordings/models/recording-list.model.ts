import {
	MeetRecordingInfo,
	MeetRecordingSortField,
	MeetRecordingStatus,
	SortOrder,
	TextMatchMode
} from '@openvidu-meet/typings';

/** Most recordings the REST API accepts in one bulk delete or ZIP download. */
export const RECORDINGS_BULK_MAX_ITEMS = 100;

export interface RecordingTableAction {
	recordings: MeetRecordingInfo[];
	action: 'play' | 'download' | 'shareLink' | 'delete' | 'bulkDelete' | 'bulkDownload';
}

export interface RecordingTableFilter {
	nameFilter: string;
	nameMatchMode: TextMatchMode;
	nameCaseInsensitive: boolean;
	statusFilter: MeetRecordingStatus | '';
	sortField: MeetRecordingSortField;
	sortOrder: SortOrder;
}
