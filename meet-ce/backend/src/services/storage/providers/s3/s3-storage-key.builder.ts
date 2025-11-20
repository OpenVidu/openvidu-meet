import { RecordingHelper } from '../../../../helpers/recording.helper.js';
import { StorageKeyBuilder } from '../../storage.interface.js';

export class S3KeyBuilder implements StorageKeyBuilder {
	buildGlobalConfigKey(): string {
		return `global-config.json`;
	}

	buildMeetRoomKey(roomId: string): string {
		return `rooms/${roomId}/${roomId}.json`;
	}

	buildAllMeetRoomsKey(roomName?: string): string {
		const roomSegment = roomName ? `/${roomName}` : '';
		return `rooms${roomSegment}`;
	}

	buildArchivedMeetRoomKey(roomId: string): string {
		return `recordings/.room_metadata/${roomId}/room_metadata.json`;
	}

	buildMeetRecordingKey(recordingId: string): string {
		const { roomId, egressId, uid } = RecordingHelper.extractInfoFromRecordingId(recordingId);
		return `recordings/.metadata/${roomId}/${egressId}/${uid}.json`;
	}

	buildBinaryRecordingKey(recordingId: string): string {
		const { roomId, uid } = RecordingHelper.extractInfoFromRecordingId(recordingId);
		return `recordings/${roomId}/${roomId}--${uid}.mp4`;
	}

	buildAllMeetRecordingsKey(roomId?: string): string {
		const roomSegment = roomId ? `/${roomId}` : '';
		return `recordings/.metadata${roomSegment}`;
	}

	buildAccessRecordingSecretsKey(recordingId: string): string {
		const { roomId, egressId, uid } = RecordingHelper.extractInfoFromRecordingId(recordingId);
		return `recordings/.secrets/${roomId}/${egressId}/${uid}.json`;
	}

	buildUserKey(userId: string): string {
		return `users/${userId}.json`;
	}

	buildApiKeysKey(): string {
		return `api-keys.json`;
	}
}
