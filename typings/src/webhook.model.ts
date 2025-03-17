import { MeetRecordingStatus } from './recording.model.js';

export interface OpenViduWebhookEvent {
	creationDate: number;
	event: OpenViduWebhookEventType;
	data: RoomWebhookData | RecordingWebhookData;
}

export const enum OpenViduWebhookEventType {
	RECORDING_STARTED = 'recording_started',
	RECORDING_STOPPED = 'recording_stopped',
	ROOM_FINISHED = 'room_finished'
}

export interface RecordingWebhookData {
	recordingId: string;
	filename?: string;
	roomName: string;
	status: MeetRecordingStatus;
}

export interface RoomWebhookData {
	roomName: string;
}
