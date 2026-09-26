import { describe, expect, it } from '@jest/globals';
import type { MeetBroadcastInfo } from '@openvidu-meet/typings';
import { MeetReaction, MeetSignalType } from '@openvidu-meet/typings';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { FrontendEventService } from '../../../src/services/frontend-event.service.js';

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };

class UnreachableLiveKitService {
	async sendData(): Promise<void> {
		throw new Error('LiveKit unreachable');
	}
}

/**
 * A signal reports a change the server has already applied, so failing to deliver it must not turn
 * that change into an error for whoever made it.
 */
describe('FrontendEventService signals that cannot be delivered', () => {
	const service = new FrontendEventService(
		...([noopLogger, new UnreachableLiveKitService()] as unknown as ConstructorParameters<
			typeof FrontendEventService
		>)
	);

	it('resolves the permissions updated signal', async () => {
		await expect(
			service.sendParticipantPermissionsUpdatedSignal('room-1', 'participant-1')
		).resolves.toBeUndefined();
	});

	it('resolves the media muted signal', async () => {
		await expect(
			service.sendParticipantMediaMutedSignal('room-1', ['participant-1'], { audioActive: false })
		).resolves.toBeUndefined();
	});
});

describe('FrontendEventService reaction signal', () => {
	it('sends the reaction to the whole meeting, sender included, naming who sent it', async () => {
		const sent: { roomName: string; data: object; options: object }[] = [];
		const livekit = {
			sendData: async (roomName: string, data: object, options: object) => {
				sent.push({ roomName, data, options });
			}
		};
		const service = new FrontendEventService(
			...([noopLogger, livekit] as unknown as ConstructorParameters<typeof FrontendEventService>)
		);

		await service.sendParticipantReactionSentSignal('room-1', 'participant-1', MeetReaction.CLAPPING_HANDS);

		expect(sent).toEqual([
			{
				roomName: 'room-1',
				data: {
					roomId: 'room-1',
					participantIdentity: 'participant-1',
					reaction: MeetReaction.CLAPPING_HANDS,
					timestamp: expect.any(Number)
				},
				options: { topic: MeetSignalType.MEET_PARTICIPANT_REACTION_SENT }
			}
		]);
	});
});

/**
 * The broadcast state goes to the whole room when it changes, and to one participant alone when
 * they join a meeting that is already live.
 */
describe('FrontendEventService.sendBroadcastUpdatedSignal', () => {
	const broadcast = { broadcastId: 'EG_1', roomId: 'room-1', status: 'active' } as MeetBroadcastInfo;

	it('broadcasts to every participant by default', async () => {
		const sent: { roomName: string; data: object; options: object }[] = [];
		const livekit = {
			sendData: async (roomName: string, data: object, options: object) => {
				sent.push({ roomName, data, options });
			}
		};
		const service = new FrontendEventService(
			...([noopLogger, livekit] as unknown as ConstructorParameters<typeof FrontendEventService>)
		);

		await service.sendBroadcastUpdatedSignal('room-1', broadcast);

		expect(sent).toEqual([
			{
				roomName: 'room-1',
				data: { roomId: 'room-1', broadcast, timestamp: expect.any(Number) },
				options: { topic: MeetSignalType.MEET_BROADCAST_UPDATED }
			}
		]);
	});

	it('addresses a joining participant alone when given their sid', async () => {
		const calls: { destinationSids?: string[] }[] = [];
		const livekit = {
			sendData: async (_room: string, _data: unknown, options: { destinationSids?: string[] }) => {
				calls.push(options);
			}
		};
		const service = new FrontendEventService(
			...([noopLogger, livekit] as unknown as ConstructorParameters<typeof FrontendEventService>)
		);

		await service.sendBroadcastUpdatedSignal('room-1', broadcast, 'PA_late');

		expect(calls).toEqual([expect.objectContaining({ destinationSids: ['PA_late'] })]);
	});
});
