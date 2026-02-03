import { MeetRecordingInfo } from './recording.model.js';
import { MeetRoom } from './room.js';

export type MeetWebhookPayload = MeetRecordingInfo | MeetRoom;

export enum MeetWebhookEventType {
	MEETING_STARTED = 'meetingStarted',
	MEETING_ENDED = 'meetingEnded',
	RECORDING_STARTED = 'recordingStarted',
	RECORDING_UPDATED = 'recordingUpdated',
	RECORDING_ENDED = 'recordingEnded',
	ROOM_FINISHED = 'roomFinished'
}

export interface MeetWebhookEvent {
	creationDate: number;
	event: MeetWebhookEventType;
	data: MeetWebhookPayload;
}
