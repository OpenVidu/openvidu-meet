export const enum MeetRecordingStatus {
	STARTING = 'STARTING',
	ACTIVE = 'ACTIVE',
	ENDING = 'ENDING',
	COMPLETE = 'COMPLETE',
	FAILED = 'FAILED',
	ABORTED = 'ABORTED',
	LIMITED_REACHED = 'LIMITED_REACHED',
}

export const enum MeetRecordingOutputMode {
	COMPOSED = 'COMPOSED'
}

/**
 * Interface representing a recording
 */
export interface MeetRecordingInfo {
	recordingId: string;
	roomId: string;
	outputMode: MeetRecordingOutputMode;
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
