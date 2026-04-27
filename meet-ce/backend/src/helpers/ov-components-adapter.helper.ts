import type { MeetingRecordingSignalPayload, MeetRecordingInfo } from '@openvidu-meet/typings';
import { MeetRecordingStatus } from '@openvidu-meet/typings';
import type { SendDataOptions } from 'livekit-server-sdk';
import { OpenViduComponentsDataTopic } from '../models/ov-components-signal.model.js';

export class OpenViduComponentsAdapterHelper {
	private constructor() {
		// Prevent instantiation of this utility class
	}

	static generateRecordingSignal(recordingInfo: MeetRecordingInfo) {
		const options: SendDataOptions = {
			destinationSids: [],
			topic: OpenViduComponentsAdapterHelper.generateDataTopic(recordingInfo)
		};
		const payload: MeetingRecordingSignalPayload =
			OpenViduComponentsAdapterHelper.parseRecordingInfoToOpenViduComponents(recordingInfo);

		return { payload, options };
	}

	static generateMeetingStatusSignal(recordingInfo: MeetRecordingInfo[], participantSid?: string) {
		const recordingActive = recordingInfo.find((rec) => rec.status === MeetRecordingStatus.ACTIVE);

		if (!recordingActive) return null;

		const payload = OpenViduComponentsAdapterHelper.parseRecordingInfoToOpenViduComponents(recordingActive);

		const options = {
			topic: OpenViduComponentsDataTopic.ROOM_STATUS,
			destinationSids: participantSid ? [participantSid] : []
		};
		return {
			payload,
			options
		};
	}

	private static parseRecordingInfoToOpenViduComponents(info: MeetRecordingInfo): MeetingRecordingSignalPayload {
		return {
			id: info.recordingId,
			startDate: info.startDate,
			error: info.error
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
}
