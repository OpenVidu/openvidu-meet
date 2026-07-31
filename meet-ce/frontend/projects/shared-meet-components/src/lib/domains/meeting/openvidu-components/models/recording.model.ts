/**
 * Enum representing the possible status of a recording
 */
export enum RecordingState {
	STARTING = 'STARTING',
	STARTED = 'STARTED',
	STOPPING = 'STOPPING',
	STOPPED = 'STOPPED',
	FAILED = 'FAILED',
	READY = 'READY'
}

export enum RecordingOutputMode {
	COMPOSED = 'COMPOSED',
	INDIVIDUAL = 'INDIVIDUAL'
}

/**
 * Interface representing information related to the recording status
 */
export interface RecordingStateInfo {
	id?: string;
	status: RecordingState;
	startedAt?: Date;
	error?: string;
}

/**
 * Interface representing a recording
 */
export interface RecordingInfo {
	id: string;
	roomName: string;
	roomId: string;
	outputMode: RecordingOutputMode;
	status: RecordingState;
	filename?: string;
	startedAt?: number;
	endedAt?: number;
	duration?: number;
	size?: number;
	location?: string;
	// Frontend only property to mark the recording as deleted
	markedForDeletion?: boolean;
}

/**
 * Interface representing a recording event
 */
interface RecordingEvent {
	roomName: string;
	recordingId?: string;
}

// Distinct names for the same payload, so each output documents what it emits.
export type RecordingStartRequestedEvent = RecordingEvent;
export type RecordingStopRequestedEvent = RecordingEvent;
