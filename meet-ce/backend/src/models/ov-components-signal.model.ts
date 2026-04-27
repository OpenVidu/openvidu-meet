import { MeetingRecordingSignalPayload, MeetingStatusSignalPayload } from '@openvidu-meet/typings';

export const enum OpenViduComponentsDataTopic {
	RECORDING_STARTING = 'recordingStarting',
	RECORDING_STARTED = 'recordingStarted',
	RECORDING_STOPPING = 'recordingStopping',
	RECORDING_STOPPED = 'recordingStopped',
	RECORDING_FAILED = 'recordingFailed',
	ROOM_STATUS = 'roomStatus'
}

export type OpenViduComponentsSignalPayload = MeetingRecordingSignalPayload | MeetingStatusSignalPayload;
