import { describe, expect, it } from '@jest/globals';
import {
	AddBroadcastDestinationReqSchema,
	BroadcastConfigSchema,
	StartBroadcastReqSchema,
	UpdateBroadcastDestinationReqSchema
} from '../../../src/models/zod-schemas/broadcast.schema.js';

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

	it('accepts rtmp and rtmps destinations, with or without a saved id, and trims the name', () => {
		const result = BroadcastConfigSchema.safeParse({
			enabled: true,
			destinations: [
				{ id: 'abc', name: '  YouTube  ', url: 'rtmps://a.rtmp.youtube.com/live2/key' },
				{ name: 'Studio', url: 'rtmp://stream.example.com:1935/live/key?token=1' }
			]
		});

		expect(result.success).toBe(true);
		expect(result.data?.destinations[0]).toEqual({
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

	it('requires at least one destination while enabled, and allows none while disabled', () => {
		expect(BroadcastConfigSchema.safeParse({ enabled: false, destinations: [] }).success).toBe(true);

		const result = BroadcastConfigSchema.safeParse({ enabled: true, destinations: [] });
		expect(result.success).toBe(false);
		expect(issues(result)).toEqual([
			'destinations: At least one destination is required while broadcast is enabled'
		]);
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

	it('accepts room destinations by id, edited ones and new ones', () => {
		const result = StartBroadcastReqSchema.safeParse({
			destinations: [{ id: 'a' }, { id: 'b', name: 'B for this meeting' }, destination('c')]
		});

		expect(result.success).toBe(true);
	});

	it('rejects an empty list, more than five entries and an entry naming neither an id nor a url', () => {
		expect(issues(StartBroadcastReqSchema.safeParse({ destinations: [] }))).toEqual([
			'destinations: At least one destination is required'
		]);
		expect(
			StartBroadcastReqSchema.safeParse({ destinations: ['a', 'b', 'c', 'd', 'e', 'f'].map(destination) }).success
		).toBe(false);
		expect(issues(StartBroadcastReqSchema.safeParse({ destinations: [{ name: 'No url' }] }))).toEqual([
			'destinations.0: A destination needs the id of a room destination, or a name and a url'
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
