import { describe, expect, it } from '@jest/globals';
import { EgressStatus } from '@livekit/protocol';
import { MeetBroadcastStatus, MeetRecordingStatus } from '@openvidu-meet/typings';
import type { EgressInfo } from 'livekit-server-sdk';
import { EgressHelper } from '../../../src/helpers/egress.helper.js';

const egress = (overrides: Partial<EgressInfo>): EgressInfo =>
	({
		egressId: 'EG_1',
		status: EgressStatus.EGRESS_ACTIVE,
		errorCode: 0,
		error: '',
		details: '',
		streamResults: [],
		fileResults: [],
		...overrides
	}) as unknown as EgressInfo;

describe('EgressHelper output', () => {
	it('tells a stream-only egress (a broadcast) from a file-only one (a recording)', () => {
		const streaming = egress({ streamResults: [{}] } as Partial<EgressInfo>);
		const recording = egress({ fileResults: [{}] } as Partial<EgressInfo>);

		expect(EgressHelper.isStreamEgress(streaming)).toBe(true);
		expect(EgressHelper.isFileEgress(streaming)).toBe(false);
		expect(EgressHelper.isFileEgress(recording)).toBe(true);
		expect(EgressHelper.isStreamEgress(recording)).toBe(false);
	});

	it('is neither for an egress with no output yet, or with both', () => {
		const empty = egress({});
		const both = egress({ streamResults: [{}], fileResults: [{}] } as Partial<EgressInfo>);

		expect([EgressHelper.isStreamEgress(empty), EgressHelper.isFileEgress(empty)]).toEqual([false, false]);
		expect([EgressHelper.isStreamEgress(both), EgressHelper.isFileEgress(both)]).toEqual([false, false]);
	});
});

describe('EgressHelper.toStatus', () => {
	it('maps every LiveKit status onto the statuses of the given domain', () => {
		const mapped = [
			EgressStatus.EGRESS_STARTING,
			EgressStatus.EGRESS_ACTIVE,
			EgressStatus.EGRESS_ENDING,
			EgressStatus.EGRESS_COMPLETE,
			EgressStatus.EGRESS_FAILED,
			EgressStatus.EGRESS_ABORTED,
			EgressStatus.EGRESS_LIMIT_REACHED
		].map((status) => EgressHelper.toStatus(status, MeetRecordingStatus));

		expect(mapped).toEqual(['starting', 'active', 'ending', 'complete', 'failed', 'aborted', 'limit_reached']);
		expect(EgressHelper.toStatus(EgressStatus.EGRESS_ENDING, MeetBroadcastStatus)).toBe(MeetBroadcastStatus.ENDING);
	});

	it('reads a status it does not know as failed', () => {
		expect(EgressHelper.toStatus(undefined, MeetRecordingStatus)).toBe(MeetRecordingStatus.FAILED);
		expect(EgressHelper.toStatus(99 as EgressStatus, MeetBroadcastStatus)).toBe(MeetBroadcastStatus.FAILED);
	});
});

describe('EgressHelper.extractError', () => {
	it('carries what LiveKit reports of a failure and nothing when there is none', () => {
		expect(EgressHelper.extractError(egress({ errorCode: 500, error: 'boom', details: 'more' }))).toEqual({
			errorCode: 500,
			error: 'boom',
			details: 'more'
		});
		expect(EgressHelper.extractError(egress({}))).toEqual({
			errorCode: undefined,
			error: undefined,
			details: undefined
		});
	});
});

describe('EgressHelper time conversions', () => {
	it('turns LiveKit nanoseconds into whole milliseconds and into seconds', () => {
		expect(EgressHelper.nsToMs(1_788_956_750_295_899_948n)).toBe(1_788_956_750_295);
		expect(EgressHelper.nsToSeconds(145_400_000_000n)).toBe(145.4);
	});

	it('reads an instant or a duration LiveKit has not stamped as none', () => {
		expect(EgressHelper.nsToMs(0n)).toBeUndefined();
		expect(EgressHelper.nsToMs(undefined)).toBeUndefined();
		expect(EgressHelper.nsToSeconds(0n)).toBeUndefined();
	});
});
