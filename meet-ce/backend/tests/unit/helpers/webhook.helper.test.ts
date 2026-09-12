import { describe, expect, it } from '@jest/globals';
import type { MeetRoom, MeetWebhook } from '@openvidu-meet/typings';
import { MeetWebhookEventType } from '@openvidu-meet/typings';
import { extractWebhookRoomId, webhookMatchesEvent } from '../../../src/helpers/webhook.helper.js';

const buildWebhook = (overrides: Partial<MeetWebhook> = {}): MeetWebhook => ({
	webhookId: 'wh-test',
	url: 'https://example.com/hook',
	enabled: true,
	creationDate: 1700000000000,
	...overrides
});

describe('webhookMatchesEvent', () => {
	it('should match an enabled webhook without filters for every event', () => {
		const webhook = buildWebhook();

		for (const event of Object.values(MeetWebhookEventType)) {
			expect(webhookMatchesEvent(webhook, event, 'room-1')).toBe(true);
			expect(webhookMatchesEvent(webhook, event)).toBe(true);
		}
	});

	it('should never match a disabled webhook', () => {
		const webhook = buildWebhook({ enabled: false });

		expect(webhookMatchesEvent(webhook, MeetWebhookEventType.MEETING_STARTED, 'room-1')).toBe(false);
	});

	it('should honor the event type filter', () => {
		const webhook = buildWebhook({
			events: [MeetWebhookEventType.RECORDING_STARTED, MeetWebhookEventType.RECORDING_ENDED]
		});

		expect(webhookMatchesEvent(webhook, MeetWebhookEventType.RECORDING_STARTED, 'room-1')).toBe(true);
		expect(webhookMatchesEvent(webhook, MeetWebhookEventType.RECORDING_ENDED, 'room-1')).toBe(true);
		expect(webhookMatchesEvent(webhook, MeetWebhookEventType.MEETING_STARTED, 'room-1')).toBe(false);
		expect(webhookMatchesEvent(webhook, MeetWebhookEventType.PARTICIPANT_JOINED, 'room-1')).toBe(false);
	});

	it('should honor the room scope', () => {
		const webhook = buildWebhook({ roomId: 'room-1' });

		expect(webhookMatchesEvent(webhook, MeetWebhookEventType.MEETING_STARTED, 'room-1')).toBe(true);
		expect(webhookMatchesEvent(webhook, MeetWebhookEventType.MEETING_STARTED, 'room-2')).toBe(false);
	});

	it('should not deliver a room-less event to a room-scoped webhook', () => {
		const webhook = buildWebhook({ roomId: 'room-1' });

		expect(webhookMatchesEvent(webhook, MeetWebhookEventType.MEETING_STARTED, undefined)).toBe(false);
	});

	it('should require every filter to match at once', () => {
		const webhook = buildWebhook({
			events: [MeetWebhookEventType.PARTICIPANT_JOINED],
			roomId: 'room-1'
		});

		expect(webhookMatchesEvent(webhook, MeetWebhookEventType.PARTICIPANT_JOINED, 'room-1')).toBe(true);
		expect(webhookMatchesEvent(webhook, MeetWebhookEventType.PARTICIPANT_JOINED, 'room-2')).toBe(false);
		expect(webhookMatchesEvent(webhook, MeetWebhookEventType.PARTICIPANT_LEFT, 'room-1')).toBe(false);
	});
});

describe('extractWebhookRoomId', () => {
	it('should read the roomId every current payload carries', () => {
		const room = { roomId: 'room-1', roomName: 'Room 1' } as MeetRoom;

		expect(extractWebhookRoomId(room)).toBe('room-1');
	});

	it('should degrade to undefined when a payload carries no room', () => {
		const payload = { message: 'room-less payload' } as unknown as MeetRoom;

		expect(extractWebhookRoomId(payload)).toBeUndefined();
	});
});
