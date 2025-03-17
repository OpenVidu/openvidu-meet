export const enum RecordingStatus {
	STARTING = 'STARTING',
	STARTED = 'STARTED',
	STOPPING = 'STOPPING',
	STOPPED = 'STOPPED',
	FAILED = 'FAILED',
	READY = 'READY'
}

export const enum RecordingOutputMode {
	COMPOSED = 'COMPOSED',
	INDIVIDUAL = 'INDIVIDUAL'
}

/**
 * Interface representing a recording
 */
export interface RecordingInfo {
	id: string;
	roomName: string;
	roomId: string;
	outputMode: RecordingOutputMode;
	status: RecordingStatus;
	filename?: string;
	creationDate?: number;
	endDate?: number;
	duration?: number;
	size?: number;
}
