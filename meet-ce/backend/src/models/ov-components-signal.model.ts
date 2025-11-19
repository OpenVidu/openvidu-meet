export const enum OpenViduComponentsDataTopic {
	CHAT = 'chat',
	RECORDING_STARTING = 'recordingStarting',
	RECORDING_STARTED = 'recordingStarted',
	RECORDING_STOPPING = 'recordingStopping',
	RECORDING_STOPPED = 'recordingStopped',
	RECORDING_DELETED = 'recordingDeleted',
	RECORDING_FAILED = 'recordingFailed',
	ROOM_STATUS = 'roomStatus'
}

export interface RecordingSignalPayload {
	id: string;
	roomName: string;
	roomId: string;
	status: string;
	filename?: string;
	startedAt?: number;
	endedAt?: number;
	duration?: number;
	size?: number;
	location?: string;
	error?: string;
}

export interface RoomStatusSignalPayload {
	isRecordingStarted: boolean;
	recordingList: RecordingSignalPayload[];
}

export type OpenViduComponentsSignalPayload = RecordingSignalPayload | RoomStatusSignalPayload;
