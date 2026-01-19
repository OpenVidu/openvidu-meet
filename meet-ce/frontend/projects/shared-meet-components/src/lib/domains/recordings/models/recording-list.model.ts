import { MeetRecordingInfo, MeetRecordingStatus } from '@openvidu-meet/typings';

export interface RecordingTableAction {
	recordings: MeetRecordingInfo[];
	action: 'play' | 'download' | 'shareLink' | 'delete' | 'bulkDelete' | 'bulkDownload';
}

export interface RecordingTableFilter {
	nameFilter: string;
	statusFilter: MeetRecordingStatus | '';
	sortField: 'roomName' | 'startDate' | 'duration' | 'size';
	sortOrder: 'asc' | 'desc';
}
