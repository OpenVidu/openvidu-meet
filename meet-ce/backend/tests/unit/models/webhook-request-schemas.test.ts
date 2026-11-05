import { beforeAll, describe, expect, it } from '@jest/globals';
import type { z } from 'zod';
import { configureZodErrorMessages } from '../../../src/config/zod-config.js';
import { MeetWebhookOptionsSchema } from '../../../src/models/zod-schemas/webhook.schema.js';

const issues = (schema: z.ZodType, input: unknown): string[] => {
	const result = schema.safeParse(input);

	if (result.success) {
		return [];
	}

	return result.error.issues.map(({ path, message }) =>
		path.length > 0 ? `${path.join('.')}: ${message}` : message
	);
};

const webhook = (overrides: Record<string, unknown> = {}) => ({ url: 'https://example.com/hook', ...overrides });

beforeAll(() => {
	configureZodErrorMessages();
});

describe('MeetWebhookOptionsSchema', () => {
	it('accepts a webhook with only a URL', () => {
		expect(MeetWebhookOptionsSchema.parse(webhook())).toEqual(webhook());
	});

	it('keeps the events, the room and the switch it is given', () => {
		const options = webhook({ events: ['meetingStarted', 'recordingEnded'], roomId: 'room-1', enabled: false });

		expect(MeetWebhookOptionsSchema.parse(options)).toEqual(options);
	});

	it('accepts http and https URLs', () => {
		expect(issues(MeetWebhookOptionsSchema, webhook({ url: 'http://localhost:3000/hook' }))).toEqual([]);
		expect(issues(MeetWebhookOptionsSchema, webhook({ url: 'https://example.com' }))).toEqual([]);
	});

	it('requires a URL', () => {
		expect(issues(MeetWebhookOptionsSchema, {})).toEqual(['url: Must be a valid URL']);
	});

	it('rejects a value that is not a URL', () => {
		expect(issues(MeetWebhookOptionsSchema, webhook({ url: 'not a url' }))).toEqual([
			'url: Must be a valid URL',
			'url: URL must start with http:// or https://'
		]);
	});

	it.each([
		'ftp://example.com/file',
		'ws://example.com',
		'file:///etc/passwd',
		'HTTPS://example.com',
		'ftp://example.com/?next=https://other.com'
	])('rejects the URL %p, which does not start with http:// or https://', (url) => {
		expect(issues(MeetWebhookOptionsSchema, webhook({ url }))).toContain(
			'url: URL must start with http:// or https://'
		);
	});

	it('accepts every event type', () => {
		const events = [
			'meetingStarted',
			'meetingEnded',
			'participantJoined',
			'participantLeft',
			'participantRoleChanged',
			'participantHandChanged',
			'recordingStarted',
			'recordingUpdated',
			'recordingEnded',
			'broadcastStarted',
			'broadcastUpdated',
			'broadcastEnded'
		];

		expect(MeetWebhookOptionsSchema.parse(webhook({ events })).events).toEqual(events);
	});

	it('rejects an empty list of events, which would never fire', () => {
		expect(issues(MeetWebhookOptionsSchema, webhook({ events: [] }))).toEqual([
			'events: Must contain at least one event type (omit the field to receive every event)'
		]);
	});

	it('rejects an event type that does not exist', () => {
		expect(issues(MeetWebhookOptionsSchema, webhook({ events: ['meetingStarted', 'roomCreated'] }))).toEqual([
			expect.stringMatching(
				/^events\.1: Invalid enum value\. Expected 'meetingStarted' \| .*, received 'roomCreated'$/
			)
		]);
	});

	it('trims the room id and rejects one that is empty', () => {
		expect(MeetWebhookOptionsSchema.parse(webhook({ roomId: '  room-1 ' })).roomId).toBe('room-1');
		expect(issues(MeetWebhookOptionsSchema, webhook({ roomId: '' }))).toEqual(['roomId: Room ID cannot be empty']);
		expect(issues(MeetWebhookOptionsSchema, webhook({ roomId: '   ' }))).toEqual([
			'roomId: Room ID cannot be empty'
		]);
	});

	it('rejects a switch that is not a boolean', () => {
		expect(issues(MeetWebhookOptionsSchema, webhook({ enabled: 'yes' }))).toEqual([
			'enabled: Expected boolean, received string'
		]);
	});
});
