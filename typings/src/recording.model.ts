export const enum MeetRecordingStatus {
	STARTING = 'STARTING',
	STARTED = 'STARTED',
	STOPPING = 'STOPPING',
	STOPPED = 'STOPPED',
	FAILED = 'FAILED',
	READY = 'READY'
}

export const enum MeetRecordingOutputMode {
	COMPOSED = 'COMPOSED',
	INDIVIDUAL = 'INDIVIDUAL'
}

/**
 * Interface representing a recording
 */
export interface MeetRecordingInfo {
	id: string;
	roomName: string;
	// TODO: Delete roomId
	roomId: string;
	outputMode: MeetRecordingOutputMode;
	status: MeetRecordingStatus;
	filename?: string;
	startedAt?: number;
	endedAt?: number;
	duration?: number;
	size?: number;
}
