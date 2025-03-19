import { EgressInfo } from 'livekit-server-sdk';
import { MeetRecordingInfo, MeetRecordingOutputMode, MeetRecordingStatus } from '@typings-ce';
import { EgressStatus } from '@livekit/protocol';

export class RecordingHelper {
	static toRecordingInfo(egressInfo: EgressInfo): MeetRecordingInfo {
		const status = RecordingHelper.extractOpenViduStatus(egressInfo.status);
		const size = RecordingHelper.extractSize(egressInfo);
		const outputMode = RecordingHelper.extractOutputMode(egressInfo);
		const duration = RecordingHelper.extractDuration(egressInfo);
		const startDateMs = RecordingHelper.extractStartDate(egressInfo);
		const endDateMs = RecordingHelper.extractEndDate(egressInfo);
		const filename = RecordingHelper.extractFilename(egressInfo);
		const { egressId, roomName, errorCode, error, details } = egressInfo;
		return {
			recordingId: egressId,
			roomId: roomName,
			outputMode,
			status,
			filename,
			startDate: startDateMs,
			endDate: endDateMs,
			duration,
			size,
			errorCode,
			error,
			details: details
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
				return MeetRecordingStatus.LIMITED_REACHED;
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
	static extractOutputMode(egressInfo: EgressInfo): MeetRecordingOutputMode {
		// if (egressInfo.request.case === 'roomComposite') {
		// 	return MeetRecordingOutputMode.COMPOSED;
		// } else {
		// 	return MeetRecordingOutputMode.INDIVIDUAL;
		// }
		return MeetRecordingOutputMode.COMPOSED;
	}

	static extractFilename(recordingInfo: MeetRecordingInfo): string | undefined;

	static extractFilename(egressInfo: EgressInfo): string | undefined;

	static extractFilename(info: MeetRecordingInfo | EgressInfo): string | undefined {
		if (!info) return undefined;

		if ('request' in info) {
			// EgressInfo
			return info.fileResults?.[0]?.filename.split('/').pop();
		} else {
			// MeetRecordingInfo
			const { filename, roomId } = info;

			return `${roomId}/${filename}`;
		}
	}

	/**
	 * Extracts the duration from the given egress information.
	 * If the duration is not available, it returns 0.
	 * @param egressInfo The egress information containing the file results.
	 * @returns The duration in milliseconds.
	 */
	static extractDuration(egressInfo: EgressInfo): number {
		return this.toSeconds(Number(egressInfo.fileResults?.[0]?.duration ?? 0));
	}

	/**
	 * Extracts the endedAt value from the given EgressInfo object and converts it to milliseconds.
	 * If the endedAt value is not provided, it defaults to 0.
	 *
	 * @param egressInfo - The EgressInfo object containing the endedAt value.
	 * @returns The endedAt value converted to milliseconds.
	 */
	static extractEndDate(egressInfo: EgressInfo): number {
		return this.toMilliseconds(Number(egressInfo.endedAt ?? 0));
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

	/**
	 * Extracts the size from the given EgressInfo object.
	 * If the size is not available, it returns 0.
	 *
	 * @param egressInfo - The EgressInfo object to extract the size from.
	 * @returns The size extracted from the EgressInfo object, or 0 if not available.
	 */
	static extractSize(egressInfo: EgressInfo): number {
		return Number(egressInfo.fileResults?.[0]?.size ?? 0);
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
