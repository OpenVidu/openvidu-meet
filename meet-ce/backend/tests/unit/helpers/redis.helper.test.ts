import { describe, expect, it } from '@jest/globals';
import type { WebhookEvent } from 'livekit-server-sdk';
import { MeetLock } from '../../../src/helpers/redis.helper.js';

const roomLocks = {
	recordingActive: MeetLock.getRecordingActiveLock,
	recordingStop: MeetLock.getRecordingStopLock,
	broadcast: MeetLock.getBroadcastLock,
	durationLimitEnd: MeetLock.getDurationLimitEndLock
};

const pairLocks = {
	aiAssistant: MeetLock.getAiAssistantLock,
	participantMetadata: MeetLock.getParticipantMetadataLock,
	hand: MeetLock.getHandLock
};

describe('MeetLock', () => {
	it('gives every lock of every room its own key', () => {
		const keys = [
			...Object.values(roomLocks).flatMap((lock) => [lock('room-1'), lock('room-2')]),
			...Object.values(pairLocks).flatMap((lock) => [
				lock('room-1', 'a'),
				lock('room-1', 'b'),
				lock('room-2', 'a')
			]),
			MeetLock.getRegistryLock(MeetLock.getRecordingActiveLock('room-1')),
			MeetLock.getScheduledTaskLock('expiredRoomsGC'),
			MeetLock.getStorageInitializationLock(),
			MeetLock.getMigrationLock(),
			MeetLock.getWebhookLock({ event: 'room_started', id: 'EV_1' } as WebhookEvent),
			MeetLock.getWebhookLock({ event: 'room_started', id: 'EV_2' } as WebhookEvent),
			MeetLock.getWebhookRegistrationLock(),
			MeetLock.getApiKeyLock()
		];

		expect(new Set(keys).size).toBe(keys.length);
		expect(keys.every((key) => key.startsWith('ov_meet'))).toBe(true);
	});

	it.each(Object.entries(roomLocks))('refuses a %s lock without a room', (_name, lock) => {
		expect(() => lock('')).toThrow('roomId must be a non-empty string');
	});

	it.each(Object.entries(pairLocks))('refuses a %s lock without a room or without its second key', (_name, lock) => {
		expect(() => lock('', 'a')).toThrow('roomId must be a non-empty string');
		expect(() => lock('room-1', '')).toThrow('must be a non-empty string');
	});

	it('refuses the other locks without the name they are keyed by', () => {
		expect(() => MeetLock.getRegistryLock('')).toThrow('lockName must be a non-empty string');
		expect(() => MeetLock.getScheduledTaskLock('')).toThrow('taskName must be a non-empty string');
		expect(() => MeetLock.getWebhookLock({} as WebhookEvent)).toThrow('event must be a non-empty string');
	});
});
