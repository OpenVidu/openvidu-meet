import { beforeAll, describe, expect, it } from '@jest/globals';
import { MEET_BROADCAST_FIELDS, MeetRecordingAudioCodec, MeetRecordingVideoCodec } from '@openvidu-meet/typings';
import {
	BroadcastConfigSchema,
	BroadcastFieldsQuerySchema,
	BroadcastIdParamsSchema,
	StopBroadcastsReqSchema,
	GetBroadcastsQuerySchema,
	StartBroadcastReqSchema
} from '../../../src/models/zod-schemas/broadcast.schema.js';
import { configureZodErrorMessages } from '../../../src/config/zod-config.js';
import { fieldListSchema, mergeFieldsHeaderIntoQuery } from '../../../src/models/zod-schemas/field-selection.schema.js';

beforeAll(() => {
	configureZodErrorMessages();
});

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

	it('takes any number of destinations', () => {
		const destinations = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(destination);

		expect(BroadcastConfigSchema.safeParse({ enabled: true, destinations }).success).toBe(true);
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

	it('take any number of entries in either list, and reject an empty id', () => {
		const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

		expect(StartBroadcastReqSchema.safeParse({ roomId, destinations: names.map(destination) }).success).toBe(true);
		expect(StartBroadcastReqSchema.safeParse({ roomId, destinationIds: names }).success).toBe(true);
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

describe('broadcast destinations', () => {
	const configIssues = (destinations: unknown[]) => {
		const result = BroadcastConfigSchema.safeParse({ enabled: true, destinations });
		return result.success ? [] : issues(result);
	};
	const urlOfLength = (length: number) => `rtmp://mtx/live/${'k'.repeat(length - 'rtmp://mtx/live/'.length)}`;

	it('accepts a name of 1 to 50 characters, counted after trimming', () => {
		expect(configIssues([{ name: 'a', url: 'rtmp://mtx/live/k' }])).toEqual([]);
		expect(configIssues([{ name: 'a'.repeat(50), url: 'rtmp://mtx/live/k' }])).toEqual([]);
		expect(configIssues([{ name: `  ${'a'.repeat(50)}  `, url: 'rtmp://mtx/live/k' }])).toEqual([]);
	});

	it('rejects a name over 50 characters and a name that is only whitespace', () => {
		expect(configIssues([{ name: 'a'.repeat(51), url: 'rtmp://mtx/live/k' }])).toEqual([
			'destinations.0.name: Destination name cannot exceed 50 characters'
		]);
		expect(configIssues([{ name: '   ', url: 'rtmp://mtx/live/k' }])).toEqual([
			'destinations.0.name: Destination name is required'
		]);
		expect(configIssues([{ url: 'rtmp://mtx/live/k' }])).toEqual(['destinations.0.name: Required']);
	});

	it('requires a URL', () => {
		expect(configIssues([{ name: 'X' }])).toEqual([expect.stringMatching(/^destinations\.0\.url: /)]);
	});

	it.each(['rtmp://mtx/live/key\nsecond', 'rtmp://mtx/live/ke\ty', 'rtmp://mtx/li\r\nve/key'])(
		'rejects a URL with a line break or tab inside, instead of streaming to it without them: %j',
		(url) => {
			expect(configIssues([{ name: 'X', url }])).toEqual([
				'destinations.0.url: Destination url must have the form rtmp(s)://{host}(/{path})/{app}/{stream_key}'
			]);
			expect(
				StartBroadcastReqSchema.safeParse({ roomId, destinationIds: [], destinations: [{ name: 'X', url }] })
					.success
			).toBe(false);
		}
	);

	it('keeps a valid URL exactly as sent, only trimming the whitespace around it', () => {
		const url = 'rtmps://live.example.com:443/app/key%2Fpart?token=abc/def live=1';

		expect(BroadcastConfigSchema.parse({ destinations: [{ name: 'X', url: `  ${url}\n` }] })).toEqual({
			destinations: [{ name: 'X', url }]
		});
	});

	it('accepts a URL of exactly 2048 characters and rejects one more', () => {
		expect(configIssues([{ name: 'X', url: urlOfLength(2048) }])).toEqual([]);
		expect(configIssues([{ name: 'X', url: urlOfLength(2049) }])).toEqual([
			'destinations.0.url: Destination url cannot exceed 2048 characters'
		]);
	});

	it.each([
		'http://mtx/live/k',
		'https://mtx/live/k',
		'srt://mtx/live/k',
		'rtmpx://mtx/live/k',
		'xrtmp://mtx/live/k'
	])('rejects the URL %s, which is not rtmp or rtmps', (url) => {
		expect(configIssues([{ name: 'X', url }])).toContain(
			'destinations.0.url: Destination url must be an rtmp:// or rtmps:// URL'
		);
	});

	it('trims the id of a saved destination and rejects an empty one', () => {
		const parsed = BroadcastConfigSchema.parse({
			destinations: [{ id: ' d1 ', name: 'X', url: 'rtmp://mtx/live/k' }]
		});

		expect(parsed.destinations?.[0].id).toBe('d1');
		expect(configIssues([{ id: ' ', name: 'X', url: 'rtmp://mtx/live/k' }])).toEqual([
			'destinations.0.id: Destination id cannot be empty'
		]);
	});
});

describe('start and stop broadcast requests', () => {
	it('sanitize the room id', () => {
		expect(StartBroadcastReqSchema.parse({ roomId: 'ro om!1' })).toEqual({ roomId: 'room1' });
		expect(StopBroadcastsReqSchema.parse({ roomId: 'ro om!1' })).toEqual({ roomId: 'room1' });
		expect(GetBroadcastsQuerySchema.parse({ roomId: 'ro om!1' }).roomId).toBe('room1');
	});

	it('reject an empty room id, and one that sanitizes to nothing', () => {
		for (const schema of [StartBroadcastReqSchema, StopBroadcastsReqSchema, GetBroadcastsQuerySchema]) {
			expect(issues(schema.safeParse({ roomId: '' }))).toEqual([
				'roomId: roomId is required and cannot be empty'
			]);
			expect(issues(schema.safeParse({ roomId: '!!' }))).toEqual([
				'roomId: roomId cannot be empty after sanitization'
			]);
		}
	});

	it('Start accepts room destinations with the destinations of the meeting empty, and the other way round', () => {
		expect(StartBroadcastReqSchema.safeParse({ roomId, destinationIds: ['a'], destinations: [] }).success).toBe(
			true
		);
		expect(
			StartBroadcastReqSchema.safeParse({ roomId, destinationIds: [], destinations: [destination('a')] }).success
		).toBe(true);
	});

	it('Start names the empty room destination id', () => {
		expect(issues(StartBroadcastReqSchema.safeParse({ roomId, destinationIds: [' '] }))).toEqual([
			'destinationIds.0: Destination id cannot be empty'
		]);
	});

	it('Start rejects a destination of the meeting that carries anything but a name and a url', () => {
		expect(
			issues(StartBroadcastReqSchema.safeParse({ roomId, destinations: [{ ...destination('a'), id: 'x' }] }))
		).toEqual([expect.stringContaining('destinations.0')]);
	});

	it('Start validates the destinations of the meeting', () => {
		expect(
			issues(StartBroadcastReqSchema.safeParse({ roomId, destinations: [{ name: '', url: 'http://x/y/z' }] }))
		).toEqual([
			'destinations.0.name: Destination name is required',
			'destinations.0.url: Destination url must be an rtmp:// or rtmps:// URL',
			'destinations.0.url: Destination url must have the form rtmp(s)://{host}(/{path})/{app}/{stream_key}'
		]);
	});

	it('Stop trims the broadcast ids it is given and names the one that is malformed', () => {
		expect(StopBroadcastsReqSchema.parse({ roomId, broadcastIds: [' room-1--abc '] }).broadcastIds).toEqual([
			'room-1--abc'
		]);
		expect(issues(StopBroadcastsReqSchema.safeParse({ roomId, broadcastIds: ['room-1--abc', 'abc'] }))).toEqual([
			'broadcastIds.1: Broadcast id must have the form {roomId}--{id}'
		]);
	});

	it('Get reads the fields of the broadcasts', () => {
		expect(GetBroadcastsQuerySchema.parse({ roomId, fields: 'status,bogus' }).fields).toEqual(['status']);
	});

	it('Broadcast id names the part it lacks', () => {
		for (const broadcastId of ['', ' ', '--', 'room-1--', '--id', 'a--b--c', 'abc']) {
			expect(issues(BroadcastIdParamsSchema.safeParse({ broadcastId }))).toEqual([
				'broadcastId: Broadcast id must have the form {roomId}--{id}'
			]);
		}

		expect(BroadcastIdParamsSchema.safeParse({}).success).toBe(false);
	});
});

describe('fieldListSchema', () => {
	const schema = fieldListSchema(['a', 'b', 'c'] as const);

	it('reads a comma-separated list into the allowed fields, once each, in the order asked', () => {
		expect(schema.parse(' c, a ,c,x, ')).toEqual(['c', 'a']);
	});

	it('reads a list with no allowed field, an empty list and no list as every field', () => {
		expect(schema.parse('x,y')).toBeUndefined();
		expect(schema.parse(' , ')).toBeUndefined();
		expect(schema.parse('')).toBeUndefined();
		expect(schema.parse(undefined)).toBeUndefined();
	});

	it('is case sensitive', () => {
		expect(schema.parse('A,b')).toEqual(['b']);
	});

	it('rejects a value that is not a string', () => {
		expect(issues(schema.safeParse(5))).toEqual([': Expected string, received number']);
	});
});

describe('mergeFieldsHeaderIntoQuery', () => {
	const allowed = ['a', 'b', 'c'] as const;
	const merge = (headers: Record<string, unknown>, query: Record<string, unknown>) => {
		mergeFieldsHeaderIntoQuery(headers, query, allowed);
		return query;
	};

	it('puts the header fields after the ones of the query, once each', () => {
		expect(merge({ 'x-fields': 'c, a,x' }, { fields: ' b ,, a' })).toEqual({ fields: 'b,a,c' });
	});

	it('keeps the names of the query that are not allowed, for the query schema to drop', () => {
		expect(merge({ 'x-fields': 'a' }, { fields: 'zzz' })).toEqual({ fields: 'zzz,a' });
	});

	it('sets the fields when the query has none or has something other than a string', () => {
		expect(merge({ 'x-fields': 'a,b' }, {})).toEqual({ fields: 'a,b' });
		expect(merge({ 'x-fields': 'a' }, { fields: ['b'] })).toEqual({ fields: 'a' });
		expect(merge({ 'x-fields': 'a' }, { fields: '' })).toEqual({ fields: 'a' });
	});

	it('leaves the query alone when the header names no allowed field or is not a string', () => {
		expect(merge({ 'x-fields': 'x' }, { fields: 'b' })).toEqual({ fields: 'b' });
		expect(merge({ 'x-fields': 5 }, { fields: 'b' })).toEqual({ fields: 'b' });
		expect(merge({}, { fields: 'b' })).toEqual({ fields: 'b' });
	});
});
