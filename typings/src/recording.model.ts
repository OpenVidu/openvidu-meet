export const enum MeetRecordingStatus {
    STARTING = 'starting',
    ACTIVE = 'active',
    ENDING = 'ending',
    COMPLETE = 'complete',
    FAILED = 'failed',
    ABORTED = 'aborted',
    LIMIT_REACHED = 'limit_reached'
}

// export const enum MeetRecordingOutputMode {
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

export type MeetRecordingFilters = {
    maxItems?: number;
    nextPageToken?: string;
    roomId?: string;
    fields?: string;
};
