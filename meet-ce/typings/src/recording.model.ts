import { SortAndPagination } from './sort-pagination.js';

export enum MeetRecordingStatus {
    STARTING = 'starting',
    ACTIVE = 'active',
    ENDING = 'ending',
    COMPLETE = 'complete',
    FAILED = 'failed',
    ABORTED = 'aborted',
    LIMIT_REACHED = 'limit_reached'
}

// export enum MeetRecordingOutputMode {
// 	COMPOSED = 'composed',
// }

/**
 * Interface representing a recording
 */
export interface MeetRecordingInfo {
    recordingId: string;
    roomId: string;
    roomName: string;
    // outputMode: MeetRecordingOutputMode;
    status: MeetRecordingStatus;
    filename?: string;
    startDate?: number;
    endDate?: number;
    duration?: number;
    size?: number;
    errorCode?: number;
    error?: string;
    details?: string;
}

export interface MeetRecordingFilters extends SortAndPagination {
    roomId?: string;
    roomName?: string;
    status?: MeetRecordingStatus;
    fields?: string;
}
