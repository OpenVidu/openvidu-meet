import { beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRecordingAudioCodec, MeetRecordingEncodingPreset, MeetRecordingVideoCodec } from '@openvidu-meet/typings';
import { configureZodErrorMessages } from '../../../src/config/zod-config.js';
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

beforeAll(() => {
	configureZodErrorMessages();
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

	it('accepts a value that is not there, since the encoding is optional', () => {
		expect(issues(undefined)).toEqual([]);
	});

	it('names the presets when it refuses a string that is not one', () => {
		const message = `Invalid encoding preset. Must be one of: ${Object.values(MeetRecordingEncodingPreset).join(', ')}`;

		expect(issues('H264_8K')).toEqual([message]);
		expect(issues('h264_720p_30')).toEqual([message]);
		expect(issues('')).toEqual([message]);
	});

	it.each([5, true, null])('refuses %p, which is neither a preset nor an object', (value) => {
		expect(issues(value)).toEqual(['Encoding must be either a preset string or an encoding configuration object']);
	});

	it('refuses options that lack the video or the audio', () => {
		const message = 'Both video and audio configuration must be provided when using encoding options';

		expect(issues({})).toEqual([message]);
		expect(issues([])).toEqual([message]);
		expect(issues({ video: options().video })).toEqual([message]);
		expect(issues({ audio: options().audio })).toEqual([message]);
	});

	it('refuses a video or an audio that is not an object', () => {
		expect(issues({ video: 'x', audio: options().audio })).toEqual(['Video encoding must be a valid object']);
		expect(issues({ video: options().video, audio: 5 })).toEqual(['Audio encoding must be a valid object']);
	});

	const pathAndMessage = (value: unknown) =>
		encodingValidator.safeParse(value).error?.issues.map(({ path, message }) => `${path.join('.')}: ${message}`) ??
		[];

	it('lists the video fields that are missing, in the order they are documented', () => {
		const { codec: _codec, depth: _depth, width: _width, ...rest } = options().video;

		expect(pathAndMessage({ video: rest, audio: options().audio })).toContain(
			'video: When video encoding is provided, required fields are missing: width, codec, depth'
		);
	});

	it('lists the audio fields that are missing, in the order they are documented', () => {
		expect(pathAndMessage({ video: options().video, audio: { bitrate: 128 } })).toContain(
			'audio: When audio encoding is provided, required fields are missing: codec, frequency'
		);
	});

	it('keeps the path of the field that is refused', () => {
		expect(pathAndMessage(options({ framerate: 0 }))).toEqual([
			'video.framerate: Video framerate must be a positive number'
		]);
		expect(pathAndMessage(options({ bitrate: -1 }))).toEqual([
			'video.bitrate: Video bitrate must be a positive number'
		]);
		expect(pathAndMessage(options({ keyFrameInterval: 0 }))).toEqual([
			'video.keyFrameInterval: Video keyFrameInterval must be a positive number'
		]);
		expect(pathAndMessage(options({ height: 15 }))).toEqual([
			'video.height: Video height must be at least 16',
			'video.height: Video height must be an even number'
		]);
		expect(pathAndMessage(options({ codec: 'AV1' }))).toEqual([
			"video.codec: Invalid enum value. Expected 'DEFAULT_VC' | 'H264_BASELINE' | 'H264_MAIN' | 'H264_HIGH' | 'VP8', received 'AV1'"
		]);
		expect(pathAndMessage(options({ width: 'wide' }))).toEqual(['video.width: Expected number, received string']);
	});

	it.each([8, 16, 24])('accepts a depth of %i', (depth) => {
		expect(issues(options({ depth }))).toEqual([]);
	});

	it.each([0, 12, 32, '24'])('refuses a depth of %p', (depth) => {
		expect(issues(options({ depth }))).toEqual(['Video depth must be 8, 16 or 24']);
	});

	it('refuses an audio that cannot be encoded', () => {
		const withAudio = (audio: Record<string, unknown>) => ({
			video: options().video,
			audio: { ...options().audio, ...audio }
		});

		expect(pathAndMessage(withAudio({ bitrate: 0 }))).toEqual([
			'audio.bitrate: Audio bitrate must be a positive number'
		]);
		expect(pathAndMessage(withAudio({ frequency: -48000 }))).toEqual([
			'audio.frequency: Audio frequency must be a positive number'
		]);
		expect(pathAndMessage(withAudio({ codec: 'FLAC' }))).toEqual([
			"audio.codec: Invalid enum value. Expected 'DEFAULT_AC' | 'OPUS' | 'AAC' | 'AC_MP3', received 'FLAC'"
		]);
	});

	it('accepts every codec', () => {
		for (const codec of Object.values(MeetRecordingVideoCodec)) {
			expect(issues(options({ codec }))).toEqual([]);
		}
	});
});
