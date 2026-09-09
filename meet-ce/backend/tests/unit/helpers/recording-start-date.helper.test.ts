import { describe, expect, it } from '@jest/globals';
import type { EgressInfo } from 'livekit-server-sdk';
import { RecordingHelper } from '../../../src/helpers/recording.helper.js';

const egressWith = (file?: { startedAt?: bigint; endedAt?: bigint }, startedAt?: bigint): EgressInfo =>
	({
		startedAt,
		fileResults: file ? [file] : []
	}) as unknown as EgressInfo;

describe('RecordingHelper.extractStartDate', () => {
	it('returns the instant the file started, in milliseconds', () => {
		expect(RecordingHelper.extractStartDate(egressWith({ startedAt: 1_788_956_750_295_899_948n }))).toBeCloseTo(
			1_788_956_750_295.9,
			1
		);
	});

	it('ignores the egress start, which is stamped when the request is accepted', () => {
		const egressInfo = egressWith({ startedAt: 2_000_000_000_000_000_000n }, 1_000_000_000_000_000_000n);
		expect(RecordingHelper.extractStartDate(egressInfo)).toBe(2_000_000_000_000);
	});

	it('reports no start date while the recording has not recorded anything', () => {
		expect(RecordingHelper.extractStartDate(egressWith(undefined, 1_000_000_000_000_000_000n))).toBeUndefined();
		expect(RecordingHelper.extractStartDate(egressWith({ startedAt: 0n }))).toBeUndefined();
	});

	it('reports no start date when the file start was backfilled with its end', () => {
		const endedAt = 1_788_959_511_671_644_641n;
		expect(RecordingHelper.extractStartDate(egressWith({ startedAt: endedAt, endedAt }))).toBeUndefined();
	});
});
