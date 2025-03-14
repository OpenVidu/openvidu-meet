import { RecordingStatus } from './recording.model.js';

export interface OpenViduWebhookEvent {
	createdAt: number;
	event: OpenViduWebhookEventType;
	data: RoomWebhookData | RecordingWebhookData;
}

export enum OpenViduWebhookEventType {
	RECORDING_STARTED = 'recording_started',
	RECORDING_STOPPED = 'recording_stopped',
	ROOM_FINISHED = 'room_finished'
}

export interface RecordingWebhookData {
	recordingId: string;
	filename?: string;
	roomName: string;
	status: RecordingStatus;
}

export interface RoomWebhookData {
	roomName: string;
}
