import { describe, expect, it } from '@jest/globals';
import { MEET_BROADCAST_FIELDS, MeetRecordingAudioCodec, MeetRecordingVideoCodec } from '@openvidu-meet/typings';
import {
	BroadcastConfigSchema,
	BroadcastFieldsQuerySchema,
	BroadcastIdParamsSchema,
	StopBroadcastsReqSchema,
	GetBroadcastsQuerySchema,
	StartBroadcastReqSchema
} from '../../../src/models/zod-schemas/broadcast.schema.js';
import { mergeFieldsHeaderIntoQuery } from '../../../src/models/zod-schemas/field-selection.schema.js';

const issues = (result: { success: boolean; error?: { issues: Array<{ path: unknown[]; message: string }> } }) =>
	result.error!.issues.map(({ path, message }) => `${path.join('.')}: ${message}`);

const destination = (key: string) => ({ name: `Dest ${key}`, url: `rtmp://mtx/live/${key}` });
const roomId = 'room-1';

describe('BroadcastConfigSchema', () => {
	it('accepts the recording layouts and leaves an omitted layout to the stored one', () => {
		expect(BroadcastConfigSchema.safeParse({ enabled: false, destinations: [], layout: 'speaker' }).success).toBe(
			true
		);
		expect(BroadcastConfigSchema.parse({ enabled: false, destinations: [] })).toEqual({
			enabled: false,
			destinations: []
		});
		expect(BroadcastConfigSchema.safeParse({ enabled: false, destinations: [], layout: 'mosaic' }).success).toBe(
			false
		);
	});

	it('accepts the recording encodings, as a preset or as options', () => {
		const options = {
			video: {
				width: 1280,
				height: 720,
				framerate: 30,
				codec: MeetRecordingVideoCodec.H264_MAIN,
				bitrate: 3000,
				keyFrameInterval: 2,
				depth: 24
			},
			audio: { codec: MeetRecordingAudioCodec.AAC, bitrate: 128, frequency: 44100 }
		};

		expect(
			BroadcastConfigSchema.safeParse({ enabled: false, destinations: [], encoding: 'H264_1080P_30' }).success
		).toBe(true);
		expect(BroadcastConfigSchema.safeParse({ enabled: false, destinations: [], encoding: options }).success).toBe(
			true
		);
		expect(
			BroadcastConfigSchema.safeParse({ enabled: false, destinations: [], encoding: { video: options.video } })
				.success
		).toBe(false);
		expect(BroadcastConfigSchema.safeParse({ enabled: false, destinations: [], encoding: 'H264_8K' }).success).toBe(
			false
		);
	});

	it('accepts rtmp and rtmps destinations, with or without a saved id, and trims the name', () => {
		const result = BroadcastConfigSchema.safeParse({
			enabled: true,
			destinations: [
				{ id: 'abc', name: '  YouTube  ', url: 'rtmps://a.rtmp.youtube.com/live2/key' },
				{ name: 'Studio', url: 'rtmp://stream.example.com:1935/live/key?token=1' }
			]
		});

		expect(result.success).toBe(true);
		expect(result.data?.destinations?.[0]).toEqual({
			id: 'abc',
			name: 'YouTube',
			url: 'rtmps://a.rtmp.youtube.com/live2/key'
		});
	});

	it('rejects a URL that is not rtmp(s), an empty name and a switch that is not a boolean', () => {
		const result = BroadcastConfigSchema.safeParse({
			enabled: 'true',
			destinations: [{ name: '', url: 'https://youtube.com/live' }]
		});

		expect(result.success).toBe(false);
		expect(issues(result)).toEqual(
			expect.arrayContaining([
				expect.stringContaining('enabled'),
				'destinations.0.name: Destination name is required',
				'destinations.0.url: Destination url must be an rtmp:// or rtmps:// URL'
			])
		);
	});

	it('leaves the switch out when the request does, for the server to default or keep it', () => {
		expect(BroadcastConfigSchema.parse({ layout: 'speaker' })).toEqual({ layout: 'speaker' });
	});

	it('rejects a URL the media server would refuse: no app, no stream key, or a trailing slash', () => {
		for (const url of ['rtmp://mtx', 'rtmp://mtx/key-without-app', 'rtmp://mtx/live/key/']) {
			expect(
				issues(BroadcastConfigSchema.safeParse({ enabled: true, destinations: [{ name: 'X', url }] }))
			).toEqual([
				'destinations.0.url: Destination url must have the form rtmp(s)://{host}(/{path})/{app}/{stream_key}'
			]);
		}

		expect(
			StartBroadcastReqSchema.safeParse({ roomId, destinations: [{ name: 'X', url: 'rtmp://mtx/key' }] }).success
		).toBe(false);
	});

	it('leaves the destination list out when omitted, since the room decides whether broadcast can be on', () => {
		expect(BroadcastConfigSchema.parse({ enabled: true })).toEqual({ enabled: true });
		expect(BroadcastConfigSchema.safeParse({ enabled: true, destinations: [] }).success).toBe(true);
	});

	it('caps the destinations at five', () => {
		const result = BroadcastConfigSchema.safeParse({
			enabled: true,
			destinations: ['a', 'b', 'c', 'd', 'e', 'f'].map(destination)
		});

		expect(result.success).toBe(false);
		expect(issues(result)).toEqual(['destinations: Cannot have more than 5 destinations']);
	});
});

describe('StartBroadcastReqSchema and StopBroadcastsReqSchema', () => {
	const nothingToStream =
		'destinationIds: At least one destination is required: destinationIds is empty and no destinations are given';

	it('accept a body naming only the room, meaning every room destination not streamed to yet, or every running broadcast', () => {
		expect(StartBroadcastReqSchema.parse({ roomId })).toEqual({ roomId });
		expect(StopBroadcastsReqSchema.parse({ roomId })).toEqual({ roomId });
	});

	it('require the room', () => {
		expect(issues(StartBroadcastReqSchema.safeParse({}))).toEqual([expect.stringContaining('roomId')]);
		expect(issues(StopBroadcastsReqSchema.safeParse({}))).toEqual([expect.stringContaining('roomId')]);
	});

	it('accept room destinations by id and destinations for the meeting by name and url', () => {
		expect(
			StartBroadcastReqSchema.parse({ roomId, destinationIds: ['a'], destinations: [destination('c')] })
		).toEqual({ roomId, destinationIds: ['a'], destinations: [destination('c')] });
	});

	it('keep an empty list of room destinations apart from an omitted one', () => {
		expect(StartBroadcastReqSchema.parse({ roomId, destinationIds: [], destinations: [destination('c')] })).toEqual(
			{ roomId, destinationIds: [], destinations: [destination('c')] }
		);
		expect(StartBroadcastReqSchema.parse({ roomId, destinations: [] })).toEqual({ roomId, destinations: [] });
	});

	it('reject a body that streams to nothing: no room destination and no destination for the meeting', () => {
		expect(issues(StartBroadcastReqSchema.safeParse({ roomId, destinationIds: [] }))).toEqual([nothingToStream]);
		expect(issues(StartBroadcastReqSchema.safeParse({ roomId, destinationIds: [], destinations: [] }))).toEqual([
			nothingToStream
		]);
	});

	it('reject a destination for the meeting without a name and a url, or carrying a destinationId', () => {
		expect(StartBroadcastReqSchema.safeParse({ roomId, destinations: [{ name: 'No url' }] }).success).toBe(false);
		expect(StartBroadcastReqSchema.safeParse({ roomId, destinations: [{ destinationId: 'a' }] }).success).toBe(
			false
		);
		expect(
			StartBroadcastReqSchema.safeParse({ roomId, destinations: [{ destinationId: 'a', ...destination('x') }] })
				.success
		).toBe(false);
	});

	it('reject more than five entries in either list and an empty id', () => {
		expect(
			StartBroadcastReqSchema.safeParse({ roomId, destinations: ['a', 'b', 'c', 'd', 'e', 'f'].map(destination) })
				.success
		).toBe(false);
		expect(
			issues(StartBroadcastReqSchema.safeParse({ roomId, destinationIds: ['a', 'b', 'c', 'd', 'e', 'f'] }))
		).toEqual(['destinationIds: Cannot have more than 5 destinations']);
		expect(StartBroadcastReqSchema.safeParse({ roomId, destinationIds: [' '] }).success).toBe(false);
		expect(issues(StopBroadcastsReqSchema.safeParse({ roomId, broadcastIds: [] }))).toEqual([
			'broadcastIds: At least one broadcast id is required'
		]);
		expect(StopBroadcastsReqSchema.safeParse({ roomId, broadcastIds: [''] }).success).toBe(false);
	});
});

describe('BroadcastIdParamsSchema and GetBroadcastsQuerySchema', () => {
	it('take a broadcast id that names its room, as a recording id does', () => {
		expect(BroadcastIdParamsSchema.parse({ broadcastId: ' room-1--kX9pL2mQ7a ' })).toEqual({
			broadcastId: 'room-1--kX9pL2mQ7a'
		});

		for (const broadcastId of ['kX9pL2mQ7a', '--kX9pL2mQ7a', 'room-1--', 'room-1--a--b']) {
			expect(BroadcastIdParamsSchema.safeParse({ broadcastId }).success).toBe(false);
		}
	});

	it('list the broadcasts of one room, which the query names', () => {
		expect(GetBroadcastsQuerySchema.parse({ roomId: 'room-1' })).toMatchObject({ roomId: 'room-1' });
		expect(GetBroadcastsQuerySchema.safeParse({}).success).toBe(false);
	});
});

describe('BroadcastFieldsQuerySchema', () => {
	const fieldsOf = (fields?: string) => BroadcastFieldsQuerySchema.parse({ fields }).fields;

	it('keeps the broadcast fields asked for, once each, and ignores any other name', () => {
		expect(fieldsOf('status, broadcastId,status,streamKey')).toEqual(['status', 'broadcastId']);
	});

	it('reads a list with no broadcast field, or no list, as every field', () => {
		expect(fieldsOf('streamKey,,')).toBeUndefined();
		expect(fieldsOf(undefined)).toBeUndefined();
	});

	it('adds the fields of the X-Fields header to those of the query', () => {
		const query: Record<string, unknown> = { fields: 'status' };
		mergeFieldsHeaderIntoQuery({ 'x-fields': 'destination,status,bogus' }, query, MEET_BROADCAST_FIELDS);

		expect(fieldsOf(query.fields as string)).toEqual(['status', 'destination']);
	});
});
