import { RecordingInfo } from './recording.model.js';

export interface RoomStatusData {
	isRecordingStarted: boolean;
	recordingList: RecordingInfo[];
}
