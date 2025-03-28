import { MeetRecordingInfo, MeetRecordingStatus } from '@typings-ce';
import { SendDataOptions } from 'livekit-server-sdk';

const enum OpenViduComponentsDataTopic {
	CHAT = 'chat',
	RECORDING_STARTING = 'recordingStarting',
	RECORDING_STARTED = 'recordingStarted',
	RECORDING_STOPPING = 'recordingStopping',
	RECORDING_STOPPED = 'recordingStopped',
	RECORDING_DELETED = 'recordingDeleted',
	RECORDING_FAILED = 'recordingFailed',
	ROOM_STATUS = 'roomStatus'
}

export class OpenViduComponentsAdapterHelper {
	private constructor() {
		// Prevent instantiation of this utility class
	}

	static generateRecordingSignal(recordingInfo: MeetRecordingInfo) {
		const options: SendDataOptions = {
			destinationSids: [],
			topic: OpenViduComponentsAdapterHelper.generateDataTopic(recordingInfo)
		};
		const payload = OpenViduComponentsAdapterHelper.parseRecordingInfoToOpenViduComponents(recordingInfo);

		return { payload, options };
	}

	static generateRoomStatusSignal(isRecordingStarted: boolean, participantSid?: string) {
		const payload = {
			isRecordingStarted
		};

		const options = {
			topic: OpenViduComponentsDataTopic.ROOM_STATUS,
			destinationSids: participantSid ? [participantSid] : []
		};
		return {
			payload,
			options
		};
	}

	private static parseRecordingInfoToOpenViduComponents(info: MeetRecordingInfo) {
		return {
			id: info.recordingId,
			roomName: info.details ?? '',
			roomId: info.roomId,
			// outputMode: info.outputMode,
			status: this.mapRecordingStatus(info.status),
			filename: info.filename,
			startedAt: info.startDate,
			endedAt: info.endDate,
			duration: info.duration,
			size: info.size,
			location: undefined
		};
	}

	private static generateDataTopic(info: MeetRecordingInfo) {
		switch (info.status) {
			case MeetRecordingStatus.STARTING:
				return OpenViduComponentsDataTopic.RECORDING_STARTING;
			case MeetRecordingStatus.ACTIVE:
				return OpenViduComponentsDataTopic.RECORDING_STARTED;
			case MeetRecordingStatus.ENDING:
				return OpenViduComponentsDataTopic.RECORDING_STOPPING;
			case MeetRecordingStatus.COMPLETE:
				return OpenViduComponentsDataTopic.RECORDING_STOPPED;
			case MeetRecordingStatus.FAILED:
			case MeetRecordingStatus.ABORTED:
				return OpenViduComponentsDataTopic.RECORDING_FAILED;
			case MeetRecordingStatus.LIMIT_REACHED:
				return OpenViduComponentsDataTopic.RECORDING_STOPPED;
			default:
				return OpenViduComponentsDataTopic.RECORDING_FAILED;
		}
	}

	private static mapRecordingStatus(status: MeetRecordingStatus) {
		switch (status) {
			case MeetRecordingStatus.STARTING:
				return 'STARTING';
			case MeetRecordingStatus.ACTIVE:
				return 'STARTED';
			case MeetRecordingStatus.ENDING:
				return 'STOPPING';
			case MeetRecordingStatus.COMPLETE:
				return 'READY';
			case MeetRecordingStatus.FAILED:
			case MeetRecordingStatus.ABORTED:
				return 'FAILED';
			case MeetRecordingStatus.LIMIT_REACHED:
				return 'READY';
			default:
				return 'FAILED';
		}
	}
}
