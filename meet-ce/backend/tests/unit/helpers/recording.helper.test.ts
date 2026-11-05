import { describe, expect, it } from '@jest/globals';
import type { MeetRecordingInfo } from '@openvidu-meet/typings';
import { MeetRecordingEncodingPreset, MeetRecordingLayout } from '@openvidu-meet/typings';
import { EgressInfo, EncodingOptions, EncodingOptionsPreset, RoomCompositeEgressRequest } from 'livekit-server-sdk';
import { EncodingConverter } from '../../../src/helpers/encoding-converter.helper.js';
import { RecordingHelper } from '../../../src/helpers/recording.helper.js';

const recordingEgress = (request?: Partial<RoomCompositeEgressRequest>, file: object = {}) =>
	new EgressInfo({
		egressId: 'EG_1',
		roomName: 'room-1',
		request: request
			? { case: 'roomComposite', value: new RoomCompositeEgressRequest({ roomName: 'room-1', ...request }) }
			: { case: undefined },
		fileResults: [{ filename: 'openvidu-meet/recordings/room-1/room-1--uid1.mp4', ...file }]
	});

describe('RecordingHelper reading a recording egress', () => {
	it('names the recording after its room, its egress and the uid of its file', () => {
		const egress = recordingEgress({ layout: 'grid' });

		expect(RecordingHelper.extractFilename(egress)).toBe('room-1--uid1.mp4');
		expect(RecordingHelper.extractRecordingIdFromEgress(egress)).toBe('room-1--EG_1--uid1');
	});

	it('stores a recording under its room', () => {
		const recording = { roomId: 'room-1', filename: 'room-1--uid1.mp4' } as MeetRecordingInfo;

		expect(RecordingHelper.extractFilename(recording)).toBe('room-1/room-1--uid1.mp4');
	});

	it.each([
		['grid', MeetRecordingLayout.GRID],
		['speaker', MeetRecordingLayout.SPEAKER],
		['single-speaker', MeetRecordingLayout.SINGLE_SPEAKER],
		['some-future-layout', MeetRecordingLayout.GRID]
	])('reads the LiveKit layout %s as %s', (layout, expected) => {
		expect(RecordingHelper.extractRecordingLayout(recordingEgress({ layout }))).toBe(expected);
	});

	it('reads the encoding preset the recording was started with', () => {
		const egress = recordingEgress({
			layout: 'grid',
			options: { case: 'preset', value: EncodingOptionsPreset.H264_720P_30 }
		});

		expect(RecordingHelper.extractRecordingEncoding(egress)).toBe(MeetRecordingEncodingPreset.H264_720P_30);
	});

	it('reads the advanced encoding options the recording was started with', () => {
		const options = new EncodingOptions({ width: 640, height: 360, framerate: 15, videoBitrate: 800 });
		const egress = recordingEgress({ layout: 'grid', options: { case: 'advanced', value: options } });

		expect(RecordingHelper.extractRecordingEncoding(egress)).toEqual(EncodingConverter.fromLivekit(options));
		expect(RecordingHelper.extractRecordingEncoding(egress)).toMatchObject({ video: { width: 640, height: 360 } });
	});

	it('reads the default preset from a room composite started without encoding options', () => {
		expect(RecordingHelper.extractRecordingEncoding(recordingEgress({ layout: 'grid' }))).toBe(
			MeetRecordingEncodingPreset.H264_720P_30
		);
	});

	it('reads no layout or encoding from an egress that is not a room composite', () => {
		const egress = recordingEgress();

		expect(RecordingHelper.extractRecordingLayout(egress)).toBeUndefined();
		expect(RecordingHelper.extractRecordingEncoding(egress)).toBeUndefined();
	});

	it('reads the size, duration and end of a finished file, and none of an unfinished one', () => {
		const finished = recordingEgress({}, { size: 2048n, duration: 3_500_000_000n });
		finished.endedAt = 1_700_000_000_123_456_789n;

		expect(RecordingHelper.extractSize(finished)).toBe(2048);
		expect(RecordingHelper.extractDuration(finished)).toBe(3.5);
		expect(RecordingHelper.extractEndDate(finished)).toBe(1_700_000_000_123);

		const unfinished = recordingEgress({});
		expect(RecordingHelper.extractSize(unfinished)).toBeUndefined();
		expect(RecordingHelper.extractDuration(unfinished)).toBeUndefined();
		expect(RecordingHelper.extractEndDate(unfinished)).toBeUndefined();
		expect(RecordingHelper.extractSize(new EgressInfo({}))).toBeUndefined();
	});
});

describe('RecordingHelper.extractInfoFromRecordingId', () => {
	it('splits a recording id into its room, egress and uid', () => {
		expect(RecordingHelper.extractInfoFromRecordingId('room-1--EG_1--uid1')).toEqual({
			roomId: 'room-1',
			egressId: 'EG_1',
			uid: 'uid1'
		});
	});

	it.each(['room-1', 'room-1--EG_1', '--EG_1--uid1', 'room-1----uid1', 'room-1--EG_1--'])(
		'refuses the malformed recording id %j',
		(recordingId) => {
			expect(() => RecordingHelper.extractInfoFromRecordingId(recordingId)).toThrow(
				`Invalid recordingId format: ${recordingId}`
			);
		}
	);
});
