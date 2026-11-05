import { describe, expect, it, jest } from '@jest/globals';
import type { MeetBroadcastInfo, MeetRecordingInfo } from '@openvidu-meet/typings';
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

describe('FrontendEventService recording updated signal', () => {
	const buildService = (roomExists: boolean) => {
		const sendData = jest.fn(async () => {});
		const livekit = { roomExists: async () => roomExists, sendData };
		const service = new FrontendEventService(
			...([noopLogger, livekit] as unknown as ConstructorParameters<typeof FrontendEventService>)
		);
		return { service, sendData };
	};
	const recording = { recordingId: 'room-1--EG_1--abc', roomId: 'room-1' } as MeetRecordingInfo;

	it('is not sent to a room the media server no longer has', async () => {
		const { service, sendData } = buildService(false);

		await service.sendRecordingUpdatedSignal('room-1', recording);

		expect(sendData).not.toHaveBeenCalled();
	});

	it('is sent to a room the media server has', async () => {
		const { service, sendData } = buildService(true);

		await service.sendRecordingUpdatedSignal('room-1', recording);

		expect(sendData).toHaveBeenCalledTimes(1);
	});

	it('resolves when the media server cannot say whether the room exists', async () => {
		const livekit = { roomExists: async () => Promise.reject(new Error('LiveKit unreachable')) };
		const service = new FrontendEventService(
			...([noopLogger, livekit] as unknown as ConstructorParameters<typeof FrontendEventService>)
		);

		await expect(service.sendRecordingUpdatedSignal('room-1', recording)).resolves.toBeUndefined();
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

/** The payload and its addressing are the contract the frontend reads every signal by. */
describe('FrontendEventService signal payloads', () => {
	const buildService = () => {
		const sent: { roomName: string; data: object; options: object }[] = [];
		const livekit = {
			roomExists: async () => true,
			sendData: async (roomName: string, data: object, options: object) => {
				sent.push({ roomName, data, options });
			}
		};
		const service = new FrontendEventService(
			...([noopLogger, livekit] as unknown as ConstructorParameters<typeof FrontendEventService>)
		);
		return { service, sent };
	};
	const recording = { recordingId: 'room-1--EG_1--abc', roomId: 'room-1' } as MeetRecordingInfo;

	it('sends the recording state to the whole room, or to one participant given their sid', async () => {
		const { service, sent } = buildService();

		await service.sendRecordingUpdatedSignal('room-1', recording);
		await service.sendRecordingUpdatedSignal('room-1', recording, 'PA_late');

		const data = { roomId: 'room-1', recording, timestamp: expect.any(Number) };
		expect(sent).toEqual([
			{ roomName: 'room-1', data, options: { topic: MeetSignalType.MEET_RECORDING_UPDATED } },
			{
				roomName: 'room-1',
				data,
				options: { topic: MeetSignalType.MEET_RECORDING_UPDATED, destinationSids: ['PA_late'] }
			}
		]);
	});

	it('tells only the participant whose permissions changed', async () => {
		const { service, sent } = buildService();

		await service.sendParticipantPermissionsUpdatedSignal('room-1', 'participant-1');

		expect(sent).toEqual([
			{
				roomName: 'room-1',
				data: { roomId: 'room-1', participantIdentity: 'participant-1', timestamp: expect.any(Number) },
				options: {
					topic: MeetSignalType.MEET_PARTICIPANT_PERMISSIONS_UPDATED,
					destinationIdentities: ['participant-1']
				}
			}
		]);
	});

	it('tells every muted participant in one signal which devices were turned off', async () => {
		const { service, sent } = buildService();

		await service.sendParticipantMediaMutedSignal('room-1', ['participant-1', 'participant-2'], {
			audioActive: false
		});

		expect(sent).toEqual([
			{
				roomName: 'room-1',
				data: { roomId: 'room-1', media: { audioActive: false }, timestamp: expect.any(Number) },
				options: {
					topic: MeetSignalType.MEET_PARTICIPANT_MEDIA_MUTED,
					destinationIdentities: ['participant-1', 'participant-2']
				}
			}
		]);
	});
});
