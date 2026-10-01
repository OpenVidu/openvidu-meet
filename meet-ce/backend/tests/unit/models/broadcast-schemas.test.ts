import { describe, expect, it } from '@jest/globals';
import { MEET_BROADCAST_FIELDS } from '@openvidu-meet/typings';
import {
	AddBroadcastDestinationReqSchema,
	BroadcastConfigSchema,
	BroadcastFieldsQuerySchema,
	StartBroadcastReqSchema,
	UpdateBroadcastDestinationReqSchema
} from '../../../src/models/zod-schemas/broadcast.schema.js';
import { mergeFieldsHeaderIntoQuery } from '../../../src/models/zod-schemas/field-selection.schema.js';

const issues = (result: { success: boolean; error?: { issues: Array<{ path: unknown[]; message: string }> } }) =>
	result.error!.issues.map(({ path, message }) => `${path.join('.')}: ${message}`);

const destination = (key: string) => ({ name: `Dest ${key}`, url: `rtmp://mtx/live/${key}` });

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
		expect(
			BroadcastConfigSchema.safeParse({ enabled: false, destinations: [], encoding: 'H264_1080P_30' }).success
		).toBe(true);
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

	it('rejects a URL that is not rtmp(s), an empty name and a missing enabled flag', () => {
		const result = BroadcastConfigSchema.safeParse({
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

describe('StartBroadcastReqSchema', () => {
	it('accepts an empty body, meaning every room destination', () => {
		expect(StartBroadcastReqSchema.safeParse({}).success).toBe(true);
	});

	it('accepts room destinations by id and new ones by name and url', () => {
		const result = StartBroadcastReqSchema.safeParse({ destinations: [{ id: 'a' }, destination('c')] });

		expect(result.success).toBe(true);
	});

	it('rejects a room destination sent with a name or a url, since a meeting cannot change it', () => {
		const message = 'A destination is either the id of a room destination alone, or a name and a url';

		expect(issues(StartBroadcastReqSchema.safeParse({ destinations: [{ id: 'a', name: 'Renamed' }] }))).toEqual([
			`destinations.0: ${message}`
		]);
		expect(issues(StartBroadcastReqSchema.safeParse({ destinations: [{ id: 'a', ...destination('x') }] }))).toEqual(
			[`destinations.0: ${message}`]
		);
	});

	it('rejects an empty list, more than five entries and an entry naming neither an id nor a url', () => {
		expect(issues(StartBroadcastReqSchema.safeParse({ destinations: [] }))).toEqual([
			'destinations: At least one destination is required'
		]);
		expect(
			StartBroadcastReqSchema.safeParse({ destinations: ['a', 'b', 'c', 'd', 'e', 'f'].map(destination) }).success
		).toBe(false);
		expect(issues(StartBroadcastReqSchema.safeParse({ destinations: [{ name: 'No url' }] }))).toEqual([
			'destinations.0: A destination is either the id of a room destination alone, or a name and a url'
		]);
	});
});

describe('AddBroadcastDestinationReqSchema and UpdateBroadcastDestinationReqSchema', () => {
	it('need a name and an rtmp(s) url to add, and a boolean active flag to update', () => {
		expect(AddBroadcastDestinationReqSchema.safeParse(destination('x')).success).toBe(true);
		expect(AddBroadcastDestinationReqSchema.safeParse({ url: 'rtmp://mtx/live/x' }).success).toBe(false);
		expect(UpdateBroadcastDestinationReqSchema.safeParse({ active: false }).success).toBe(true);
		expect(UpdateBroadcastDestinationReqSchema.safeParse({ active: 'yes' }).success).toBe(false);
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
		mergeFieldsHeaderIntoQuery({ 'x-fields': 'destinations,status,bogus' }, query, MEET_BROADCAST_FIELDS);

		expect(fieldsOf(query.fields as string)).toEqual(['status', 'destinations']);
	});
});
