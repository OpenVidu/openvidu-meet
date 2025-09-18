import INTERNAL_CONFIG from '../../../../config/internal-config.js';
import { RecordingHelper } from '../../../../helpers/recording.helper.js';
import { StorageKeyBuilder } from '../../storage.interface.js';

export class S3KeyBuilder implements StorageKeyBuilder {
	buildGlobalConfigKey(): string {
		return `global-config.json`;
	}

	buildMeetRoomKey(roomId: string): string {
		return `${INTERNAL_CONFIG.S3_ROOMS_PREFIX}/${roomId}/${roomId}.json`;
	}

	buildAllMeetRoomsKey(roomName?: string): string {
		const roomSegment = roomName ? `/${roomName}` : '';
		return `${INTERNAL_CONFIG.S3_ROOMS_PREFIX}${roomSegment}`;
	}

	buildArchivedMeetRoomKey(roomId: string): string {
		return `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.room_metadata/${roomId}/room_metadata.json`;
	}

	buildMeetRecordingKey(recordingId: string): string {
		const { roomId, egressId, uid } = RecordingHelper.extractInfoFromRecordingId(recordingId);
		return `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.metadata/${roomId}/${egressId}/${uid}.json`;
	}

	buildBinaryRecordingKey(recordingId: string): string {
		const { roomId, uid } = RecordingHelper.extractInfoFromRecordingId(recordingId);
		return `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/${roomId}/${roomId}--${uid}.mp4`;
	}

	buildAllMeetRecordingsKey(roomId?: string): string {
		const roomSegment = roomId ? `/${roomId}` : '';
		return `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.metadata${roomSegment}`;
	}

	buildAccessRecordingSecretsKey(recordingId: string): string {
		const { roomId, egressId, uid } = RecordingHelper.extractInfoFromRecordingId(recordingId);
		return `${INTERNAL_CONFIG.S3_RECORDINGS_PREFIX}/.secrets/${roomId}/${egressId}/${uid}.json`;
	}

	buildUserKey(userId: string): string {
		return `${INTERNAL_CONFIG.S3_USERS_PREFIX}/${userId}.json`;
	}

	buildApiKeysKey(): string {
		return `${INTERNAL_CONFIG.S3_API_KEYS_PREFIX}.json`;
	}
}
