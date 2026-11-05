import {
	MEET_RECORDING_SORT_FIELDS,
	MeetRecordingInfo,
	MeetRecordingSortField,
	MeetRecordingStatus,
	SortOrder,
	TextMatchMode
} from '@openvidu-meet/typings';
import { ListUrlParams } from '../../../shared/models/list-url-state';

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

export const RECORDING_FILTER_DEFAULTS: RecordingTableFilter = {
	nameFilter: '',
	nameMatchMode: TextMatchMode.PREFIX,
	nameCaseInsensitive: false,
	statusFilter: '',
	sortField: 'startDate',
	sortOrder: SortOrder.DESC
};

export const RECORDING_FILTER_URL_PARAMS: ListUrlParams<RecordingTableFilter> = {
	nameFilter: { param: 'q' },
	nameMatchMode: { param: 'match', allowed: Object.values(TextMatchMode) },
	nameCaseInsensitive: { param: 'ignoreCase' },
	statusFilter: { param: 'status', allowed: ['', ...Object.values(MeetRecordingStatus)] },
	sortField: { param: 'sort', allowed: MEET_RECORDING_SORT_FIELDS },
	sortOrder: { param: 'order', allowed: Object.values(SortOrder) }
};
