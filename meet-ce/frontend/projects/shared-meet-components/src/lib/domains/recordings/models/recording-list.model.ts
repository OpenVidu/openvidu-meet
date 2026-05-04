import {
	MeetRecordingInfo,
	MeetRecordingSortField,
	MeetRecordingStatus,
	SortOrder,
	TextMatchMode
} from '@openvidu-meet/typings';

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
