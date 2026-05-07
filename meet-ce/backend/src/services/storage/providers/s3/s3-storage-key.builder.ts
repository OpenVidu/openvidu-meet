import { RecordingHelper } from '../../../../helpers/recording.helper.js';
import type { StorageKeyBuilder } from '../../storage.interface.js';

export class S3KeyBuilder implements StorageKeyBuilder {
	buildBinaryRecordingKey(recordingId: string): string {
		const { roomId, uid } = RecordingHelper.extractInfoFromRecordingId(recordingId);
		return `recordings/${roomId}/${roomId}--${uid}.mp4`;
	}
}
