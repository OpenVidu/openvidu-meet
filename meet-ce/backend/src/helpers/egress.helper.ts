import { EgressStatus } from '@livekit/protocol';
import type { EgressInfo } from 'livekit-server-sdk';
import type { EgressError } from '../models/egress.model.js';

const NS_PER_MS = 1_000_000n;
const NS_PER_SECOND = 1_000_000_000;

type EgressStatusName = 'STARTING' | 'ACTIVE' | 'ENDING' | 'COMPLETE' | 'FAILED' | 'ABORTED' | 'LIMIT_REACHED';

/**
 * What a recording and a broadcast read alike from the LiveKit egress that runs them. Each reads
 * its own output (a file, streams) in its own helper.
 */
export class EgressHelper {
	private constructor() {
		// Prevent instantiation of this utility class
	}

	static isStreamEgress(egress: EgressInfo): boolean {
		return EgressHelper.outputOf(egress) === 'stream';
	}

	static isFileEgress(egress: EgressInfo): boolean {
		return EgressHelper.outputOf(egress) === 'file';
	}

	/**
	 * The egress status as one of the given statuses, which a recording and a broadcast name alike.
	 * A status LiveKit adds later reads as failed.
	 */
	static toStatus<T>(status: EgressStatus | undefined, statuses: Record<EgressStatusName, T>): T {
		switch (status) {
			case EgressStatus.EGRESS_STARTING:
				return statuses.STARTING;
			case EgressStatus.EGRESS_ACTIVE:
				return statuses.ACTIVE;
			case EgressStatus.EGRESS_ENDING:
				return statuses.ENDING;
			case EgressStatus.EGRESS_COMPLETE:
				return statuses.COMPLETE;
			case EgressStatus.EGRESS_ABORTED:
				return statuses.ABORTED;
			case EgressStatus.EGRESS_LIMIT_REACHED:
				return statuses.LIMIT_REACHED;
			default:
				return statuses.FAILED;
		}
	}

	static extractError({ errorCode, error, details }: EgressInfo): EgressError {
		return {
			errorCode: errorCode || undefined,
			error: error || undefined,
			details: details || undefined
		};
	}

	/** A LiveKit instant as milliseconds since the epoch, or none while LiveKit has not stamped it. */
	static nsToMs(value: bigint | undefined): number | undefined {
		return value ? Number(value / NS_PER_MS) : undefined;
	}

	/** A LiveKit duration as seconds, or none while LiveKit has not measured it. */
	static nsToSeconds(value: bigint | undefined): number | undefined {
		return value ? Number(value) / NS_PER_SECOND : undefined;
	}

	private static outputOf({ streamResults = [], fileResults = [] }: EgressInfo): 'stream' | 'file' | undefined {
		if (streamResults.length > 0 && fileResults.length === 0) return 'stream';

		if (fileResults.length > 0 && streamResults.length === 0) return 'file';

		return undefined;
	}
}
