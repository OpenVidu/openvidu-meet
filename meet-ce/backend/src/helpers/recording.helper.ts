import { MeetRecordingLayout, MeetRecordingStatus, MEET_RECORDING_AUTO_START_PRESETS } from '@openvidu-meet/typings';
import type {
	MeetRecordingAutoStartMode,
	MeetRecordingAutoStartPreset,
	MeetRecordingEncodingOptions,
	MeetRecordingEncodingPreset,
	MeetRecordingField,
	MeetRecordingInfo
} from '@openvidu-meet/typings';
import type { EgressInfo } from 'livekit-server-sdk';
import { container } from '../config/dependency-injector.config.js';
import { RoomService } from '../services/room.service.js';
import { EgressHelper } from './egress.helper.js';
import { EncodingConverter } from './encoding-converter.helper.js';
import { applyHttpFieldFiltering } from './field-filter.helper.js';

export class RecordingHelper {
	private constructor() {
		// Prevent instantiation of this utility class
	}

	/**
	 * Applies HTTP-level field filtering to a MeetRecordingInfo object.
	 * Since recordings have no extra fields, this simply filters to the requested fields.
	 * When no fields are specified, the full recording object is returned unmodified.
	 */
	static applyFieldFilters(recording: MeetRecordingInfo, fields?: MeetRecordingField[]): MeetRecordingInfo {
		if (!fields || fields.length === 0) {
			return recording;
		}

		// Recordings have no extra fields concept, so we pass empty arrays for extra fields params
		return applyHttpFieldFiltering(recording, fields, undefined, []);
	}

	static async toRecordingInfo(egressInfo: EgressInfo): Promise<MeetRecordingInfo> {
		const status = EgressHelper.toStatus(egressInfo.status, MeetRecordingStatus);
		const size = RecordingHelper.extractSize(egressInfo);
		// const outputMode = RecordingHelper.extractOutputMode(egressInfo);
		const duration = RecordingHelper.extractDuration(egressInfo);
		const startDateMs = RecordingHelper.extractStartDate(egressInfo);
		const endDateMs = RecordingHelper.extractEndDate(egressInfo);
		const filename = RecordingHelper.extractFilename(egressInfo);
		const recordingId = RecordingHelper.extractRecordingIdFromEgress(egressInfo);
		const { roomName: roomId } = egressInfo;
		const layout = RecordingHelper.extractRecordingLayout(egressInfo);
		const encoding = RecordingHelper.extractRecordingEncoding(egressInfo);
		const roomService = container.get(RoomService);
		const { roomName } = await roomService.getMeetRoom(roomId, ['roomName']);

		return {
			recordingId,
			roomId,
			roomName,
			// outputMode,
			layout,
			encoding,
			status,
			filename,
			startDate: startDateMs,
			endDate: endDateMs,
			duration,
			size,
			...EgressHelper.extractError(egressInfo)
		};
	}

	/**
	 * The preset that makes the recording auto-start `mode` fire, returned as data instead of a
	 * verdict: the rule belongs to the recording domain, but only the caller holds the live meeting
	 * state that answers it, so this stays pure and never calls `MeetingService`.
	 */
	static getAutoStartConfig(mode: MeetRecordingAutoStartMode): MeetRecordingAutoStartPreset {
		return MEET_RECORDING_AUTO_START_PRESETS[mode];
	}

	static canBeDeleted(status: MeetRecordingStatus): boolean {
		const isFinished = [
			MeetRecordingStatus.COMPLETE,
			MeetRecordingStatus.FAILED,
			MeetRecordingStatus.ABORTED,
			MeetRecordingStatus.LIMIT_REACHED
		].includes(status);
		return isFinished;
	}

	/**
	 * Extracts the OpenVidu output mode based on the provided egress information.
	 * If the egress information contains roomComposite, it returns RecordingOutputMode.COMPOSED.
	 * Otherwise, it returns RecordingOutputMode.INDIVIDUAL.
	 *
	 * @param egressInfo - The egress information containing the roomComposite flag.
	 * @returns The extracted OpenVidu output mode.
	 */
	// static extractOutputMode(egressInfo: EgressInfo): MeetRecordingOutputMode {
	// 	// if (egressInfo.request.case === 'roomComposite') {
	// 	// 	return MeetRecordingOutputMode.COMPOSED;
	// 	// } else {
	// 	// 	return MeetRecordingOutputMode.INDIVIDUAL;
	// 	// }
	// 	return MeetRecordingOutputMode.COMPOSED;
	// }

	/**
	 * Extracts the filename/path for storing the recording.
	 * For EgressInfo, returns the last segment of the fileResults.
	 * For MeetRecordingInfo, returns a combination of roomId and filename.
	 */
	static extractFilename(recordingInfo: MeetRecordingInfo): string;

	static extractFilename(egressInfo: EgressInfo): string;

	static extractFilename(info: MeetRecordingInfo | EgressInfo): string {
		if ('request' in info) {
			// EgressInfo
			return info.fileResults[0].filename.split('/').pop()!;
		} else {
			// MeetRecordingInfo
			const { filename, roomId } = info;

			return `${roomId}/${filename}`;
		}
	}

	/**
	 * Extracts the UID from the given filename.
	 *
	 * @param filename room-123--{uid}.mp4
	 * @returns
	 */
	static extractUidFromFilename(filename: string): string {
		const uidWithExtension = filename.split('--')[1];
		return uidWithExtension.split('.')[0];
	}

	static extractRecordingIdFromEgress(egressInfo: EgressInfo): string {
		const { roomName: meetRoomId, egressId } = egressInfo;
		const filename = RecordingHelper.extractFilename(egressInfo);
		const uid = RecordingHelper.extractUidFromFilename(filename);
		return `${meetRoomId}--${egressId}--${uid}`;
	}

	static extractRecordingLayout(egressInfo: EgressInfo): MeetRecordingLayout | undefined {
		if (egressInfo.request.case !== 'roomComposite') return undefined;

		const { layout } = egressInfo.request.value;

		switch (layout) {
			case 'grid':
				return MeetRecordingLayout.GRID;
			case 'speaker':
				return MeetRecordingLayout.SPEAKER;
			case 'single-speaker':
				return MeetRecordingLayout.SINGLE_SPEAKER;
			default:
				return MeetRecordingLayout.GRID; // Default layout
		}
	}

	/**
	 * Extracts the encoding configuration from EgressInfo.
	 * Converts LiveKit encoding options back to OpenVidu Meet format.
	 *
	 * @param egressInfo - The egress information from LiveKit
	 * @returns The encoding configuration in OpenVidu Meet format (preset or advanced options)
	 */
	static extractRecordingEncoding(
		egressInfo: EgressInfo
	): MeetRecordingEncodingPreset | MeetRecordingEncodingOptions | undefined {
		if (egressInfo.request.case !== 'roomComposite') return undefined;

		const { options } = egressInfo.request.value;

		// Extract encoding based on type (preset or advanced)
		const encodingOptions =
			options.case === 'preset' ? options.value : options.case === 'advanced' ? options.value : undefined;

		return EncodingConverter.fromLivekit(encodingOptions);
	}

	/**
	 * Extracts the room name, egressId, and UID from the given recordingId.
	 * @param recordingId ${roomId}--${egressId}--${uid}
	 */
	static extractInfoFromRecordingId(recordingId: string): { roomId: string; egressId: string; uid: string } {
		const [roomId, egressId, uid] = recordingId.split('--');

		if (!roomId || !egressId || !uid) {
			throw new Error(`Invalid recordingId format: ${recordingId}`);
		}

		return { roomId, egressId, uid };
	}

	/**
	 * The duration of the recorded file, in seconds, once LiveKit has measured it.
	 */
	static extractDuration(egressInfo: EgressInfo): number | undefined {
		return EgressHelper.nsToSeconds(egressInfo.fileResults?.[0]?.duration);
	}

	/**
	 * The instant the recording ended, in milliseconds since the epoch, once it has.
	 */
	static extractEndDate(egressInfo: EgressInfo): number | undefined {
		return EgressHelper.nsToMs(egressInfo.endedAt);
	}

	/**
	 * Extracts the instant the recording started writing media from the given EgressInfo object.
	 *
	 * The egress's own `startedAt` is stamped when the request is accepted, which can be minutes
	 * before any media exists, so the file result is the only accurate source. LiveKit backfills the
	 * file's `startedAt` with its `endedAt` when the egress ended without ever recording, and that
	 * case is reported as no start date at all.
	 *
	 * @param egressInfo The EgressInfo object from which to extract the start date.
	 * @returns The start date in milliseconds, or `undefined` if the recording has not started.
	 */
	static extractStartDate(egressInfo: EgressInfo): number | undefined {
		const { startedAt, endedAt } = egressInfo.fileResults?.[0] ?? {};

		if (startedAt === endedAt) return undefined;

		return EgressHelper.nsToMs(startedAt);
	}

	static extractUpdatedDate(egressInfo: EgressInfo): number | undefined {
		return EgressHelper.nsToMs(egressInfo.updatedAt);
	}

	/**
	 * Extracts the size from the given EgressInfo object.
	 * If the size is not available, it returns 0.
	 *
	 * @param egressInfo - The EgressInfo object to extract the size from.
	 * @returns The size extracted from the EgressInfo object, or 0 if not available.
	 */
	static extractSize(egressInfo: EgressInfo): number | undefined {
		const size = Number(egressInfo.fileResults?.[0]?.size ?? 0);
		return size !== 0 ? size : undefined;
	}
}
