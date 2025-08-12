import { EgressStatus } from '@livekit/protocol';
import { MeetRecordingInfo, MeetRecordingStatus } from '@typings-ce';
import { EgressInfo } from 'livekit-server-sdk';
import { uid as secureUid } from 'uid/secure';
import { container } from '../config/index.js';
import { RoomService } from '../services/index.js';

export class RecordingHelper {
	private constructor() {
		// Prevent instantiation of this utility class
	}

	static async toRecordingInfo(egressInfo: EgressInfo): Promise<MeetRecordingInfo> {
		const status = RecordingHelper.extractOpenViduStatus(egressInfo.status);
		const size = RecordingHelper.extractSize(egressInfo);
		// const outputMode = RecordingHelper.extractOutputMode(egressInfo);
		const duration = RecordingHelper.extractDuration(egressInfo);
		const startDateMs = RecordingHelper.extractStartDate(egressInfo);
		const endDateMs = RecordingHelper.extractEndDate(egressInfo);
		const filename = RecordingHelper.extractFilename(egressInfo);
		const recordingId = RecordingHelper.extractRecordingIdFromEgress(egressInfo);
		const { roomName: roomId, errorCode, error, details } = egressInfo;

		const roomService = container.get(RoomService);
		const { roomName } = await roomService.getMeetRoom(roomId);

		return {
			recordingId,
			roomId,
			roomName,
			// outputMode,
			status,
			filename,
			startDate: startDateMs,
			endDate: endDateMs,
			duration,
			size,
			errorCode: errorCode ? Number(errorCode) : undefined,
			error: error ? String(error) : undefined,
			details: details ? String(details) : undefined
		};
	}

	/**
	 * Checks if the egress is for recording.
	 * @param egress - The egress information.
	 * @returns A boolean indicating if the egress is for recording.
	 */
	static isRecordingEgress(egress: EgressInfo): boolean {
		const { streamResults = [], fileResults = [] } = egress;
		return fileResults.length > 0 && streamResults.length === 0;
	}

	static canBeDeleted(recordingInfo: MeetRecordingInfo): boolean {
		const { status } = recordingInfo;
		const isFinished = [
			MeetRecordingStatus.COMPLETE,
			MeetRecordingStatus.FAILED,
			MeetRecordingStatus.ABORTED,
			MeetRecordingStatus.LIMIT_REACHED
		].includes(status);
		return isFinished;
	}

	static extractOpenViduStatus(status: EgressStatus | undefined): MeetRecordingStatus {
		switch (status) {
			case EgressStatus.EGRESS_STARTING:
				return MeetRecordingStatus.STARTING;
			case EgressStatus.EGRESS_ACTIVE:
				return MeetRecordingStatus.ACTIVE;
			case EgressStatus.EGRESS_ENDING:
				return MeetRecordingStatus.ENDING;
			case EgressStatus.EGRESS_COMPLETE:
				return MeetRecordingStatus.COMPLETE;
			case EgressStatus.EGRESS_FAILED:
				return MeetRecordingStatus.FAILED;
			case EgressStatus.EGRESS_ABORTED:
				return MeetRecordingStatus.ABORTED;
			case EgressStatus.EGRESS_LIMIT_REACHED:
				return MeetRecordingStatus.LIMIT_REACHED;
			default:
				return MeetRecordingStatus.FAILED;
		}
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
			return info.fileResults[0]!.filename.split('/').pop()!;
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
	 * Extracts the duration from the given egress information.
	 * If the duration is not available, it returns 0.
	 * @param egressInfo The egress information containing the file results.
	 * @returns The duration in milliseconds.
	 */
	static extractDuration(egressInfo: EgressInfo): number | undefined {
		const duration = this.toSeconds(Number(egressInfo.fileResults?.[0]?.duration ?? 0));
		return duration !== 0 ? duration : undefined;
	}

	/**
	 * Extracts the endedAt value from the given EgressInfo object and converts it to milliseconds.
	 * If the endedAt value is not provided, it defaults to 0.
	 *
	 * @param egressInfo - The EgressInfo object containing the endedAt value.
	 * @returns The endedAt value converted to milliseconds.
	 */
	static extractEndDate(egressInfo: EgressInfo): number | undefined {
		const endDateMs = this.toMilliseconds(Number(egressInfo.endedAt ?? 0));
		return endDateMs !== 0 ? endDateMs : undefined;
	}

	/**
	 * Extracts the creation timestamp from the given EgressInfo object.
	 * If the startedAt property is not defined, it returns 0.
	 * @param egressInfo The EgressInfo object from which to extract the creation timestamp.
	 * @returns The creation timestamp in milliseconds.
	 */
	static extractStartDate(egressInfo: EgressInfo): number {
		const { startedAt, updatedAt } = egressInfo;
		const createdAt = startedAt && Number(startedAt) !== 0 ? startedAt : (updatedAt ?? 0);
		return this.toMilliseconds(Number(createdAt));
	}

	static extractUpdatedDate(egressInfo: EgressInfo): number | undefined {
		const updatedAt = egressInfo.updatedAt;
		return updatedAt ? this.toMilliseconds(Number(updatedAt)) : undefined;
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

	/**
	 * Builds the secrets for public and private access to recordings.
	 * @returns An object containing public and private access secrets.
	 */
	static buildAccessSecrets(): { publicAccessSecret: string; privateAccessSecret: string } {
		return {
			publicAccessSecret: secureUid(10),
			privateAccessSecret: secureUid(10)
		};
	}

	private static toSeconds(nanoseconds: number): number {
		const nanosecondsToSeconds = 1 / 1_000_000_000;
		return nanoseconds * nanosecondsToSeconds;
	}

	private static toMilliseconds(nanoseconds: number): number {
		const nanosecondsToMilliseconds = 1 / 1_000_000;
		return nanoseconds * nanosecondsToMilliseconds;
	}
}
