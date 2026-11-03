import { describe, expect, it } from '@jest/globals';
import { MeetRecordingAudioCodec, MeetRecordingEncodingPreset, MeetRecordingVideoCodec } from '@openvidu-meet/typings';
import { encodingValidator } from '../../../src/models/zod-schemas/recording-encoding.schema.js';

const options = (video: Record<string, unknown> = {}) => ({
	video: {
		width: 1280,
		height: 720,
		framerate: 30,
		codec: MeetRecordingVideoCodec.H264_MAIN,
		bitrate: 3000,
		keyFrameInterval: 2,
		depth: 24,
		...video
	},
	audio: { codec: MeetRecordingAudioCodec.OPUS, bitrate: 128, frequency: 48000 }
});

const issues = (value: unknown) => encodingValidator.safeParse(value).error?.issues.map(({ message }) => message) ?? [];

/**
 * A room's `recording.encoding` and the `config.encoding` of a start reach the egress as they are, so a
 * value the egress cannot use has to be refused with a 422 before it gets there: stored in a room, it
 * would fail every start of that room.
 */
describe('encodingValidator', () => {
	it('accepts every preset and a valid set of options', () => {
		Object.values(MeetRecordingEncodingPreset).forEach((preset) => expect(issues(preset)).toEqual([]));
		expect(issues(options())).toEqual([]);
		expect(issues(options({ width: 16, height: 16, depth: 8 }))).toEqual([]);
	});

	it('refuses a width or height the egress cannot use', () => {
		expect(issues(options({ width: 1281 }))).toEqual(['Video width must be an even number']);
		expect(issues(options({ width: 14 }))).toEqual(['Video width must be at least 16']);
		expect(issues(options({ height: 720.5 }))).toEqual(['Video height must be a whole number']);
	});

	it('refuses a depth other than 8, 16 or 24', () => {
		expect(issues(options({ depth: 32 }))).toEqual(['Video depth must be 8, 16 or 24']);
	});
});
