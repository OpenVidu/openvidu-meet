import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
	MEET_PERMISSION_KEYS,
	MeetRecordingAutoStartMode,
	MeetRecordingStatus,
	MeetRoomMemberPermissions,
	MeetRoomMemberUIBadge
} from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { RecordingRepository } from '../../../../src/repositories/recording.repository.js';
import { LivekitWebhookService } from '../../../../src/services/livekit-webhook.service.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { RecordingService } from '../../../../src/services/recording.service.js';
import {
	disconnectFakeParticipants,
	joinFakeParticipant,
	updateParticipantMetadata
} from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRecordings,
	deleteAllRooms,
	sleep,
	startTestServer,
	stopRecording
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';

/**
 * `config.recording.autoStart`: the recording starts by itself once the configured participant
 * threshold is reached, attributed to the system. The trigger lives in the LiveKit
 * participant_joined webhook handler, which these tests invoke directly — the same technique the
 * webhook suite uses — because the in-process app is not the deployment LiveKit delivers its
 * webhooks to.
 */
describe('Recording Auto-Start Tests', () => {
	let livekitService: LiveKitService;
	let livekitWebhookService: LivekitWebhookService;
	let recordingRepository: RecordingRepository;
	let recordingService: RecordingService;

	beforeAll(async () => {
		await startTestServer();
		livekitService = container.get(LiveKitService);
		livekitWebhookService = container.get(LivekitWebhookService);
		recordingRepository = container.get(RecordingRepository);
		recordingService = container.get(RecordingService);
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllRecordings();
	});

	/**
	 * Simulates LiveKit delivering the `participant_joined` webhook for a participant already
	 * connected to the room. Defaults to the first participant `listRoomParticipants` returns
	 * (order-agnostic scenarios); pass `identity` when a test needs to simulate a specific
	 * participant's join, e.g. distinguishing the first join from the second.
	 */
	const simulateParticipantJoined = async (roomId: string, identity?: string) => {
		const room = await livekitService.getRoom(roomId);
		const participants = await livekitService.listRoomParticipants(roomId);
		const participant = identity ? participants.find((p) => p.identity === identity) : participants[0];

		if (!participant) {
			throw new Error(`Participant '${identity}' not found in room '${roomId}'`);
		}

		await livekitWebhookService.handleParticipantJoined(room, participant);
	};

	const findRoomRecordings = async (roomId: string) => {
		const { recordings } = await recordingRepository.find({ roomId });
		return recordings;
	};

	it('should auto-start the recording when the first participant joins', async () => {
		const { room } = await setupSingleRoom(false, 'AUTO_START_ROOM', {
			recording: { enabled: true, autoStart: MeetRecordingAutoStartMode.WHEN_FIRST_PARTICIPANT_JOINS }
		});

		await joinFakeParticipant(room.roomId, 'FIRST_PARTICIPANT');
		await simulateParticipantJoined(room.roomId);

		// The handler fires the start in the background; poll until the recording shows up
		let recordings = await findRoomRecordings(room.roomId);
		const deadline = Date.now() + 30_000;

		while (recordings.length === 0 && Date.now() < deadline) {
			await sleep('1s');
			recordings = await findRoomRecordings(room.roomId);
		}

		expect(recordings.length).toBe(1);
		expect([MeetRecordingStatus.STARTING, MeetRecordingStatus.ACTIVE]).toContain(recordings[0].status);

		// A second join must not start a second recording (the recording-active lock dedupes)
		await joinFakeParticipant(room.roomId, 'SECOND_PARTICIPANT');
		await simulateParticipantJoined(room.roomId);
		await sleep('3s');

		expect((await findRoomRecordings(room.roomId)).length).toBe(1);

		await stopRecording(recordings[0].recordingId);
	}, 90_000);

	it('should not auto-start the recording when autoStart is not set', async () => {
		const { room } = await setupSingleRoom(false, 'NO_AUTO_START_ROOM', {
			recording: { enabled: true }
		});

		await joinFakeParticipant(room.roomId, 'ONLY_PARTICIPANT');
		await simulateParticipantJoined(room.roomId);
		await sleep('3s');

		expect((await findRoomRecordings(room.roomId)).length).toBe(0);
	});

	it('should not auto-start the recording when autoStart is explicitly null', async () => {
		// This is the value the room wizard actually stores when the user picks "manual start",
		// as opposed to the field being absent entirely (covered by the test above).
		const { room } = await setupSingleRoom(false, 'NULL_AUTO_START_ROOM', {
			recording: { enabled: true, autoStart: null }
		});

		await joinFakeParticipant(room.roomId, 'ONLY_PARTICIPANT');
		await simulateParticipantJoined(room.roomId);
		await sleep('3s');

		expect((await findRoomRecordings(room.roomId)).length).toBe(0);
	});

	it('should auto-start the recording only when a moderator joins', async () => {
		const { room } = await setupSingleRoom(false, 'AUTO_START_MODERATOR_ROOM', {
			recording: { enabled: true, autoStart: MeetRecordingAutoStartMode.WHEN_MODERATOR_JOINS }
		});

		await joinFakeParticipant(room.roomId, 'SPEAKER_PARTICIPANT');
		// No metadata stamped: `MeetParticipantHelper.extractRole` falls back to SPEAKER, exactly
		// like a fake participant that never went through Meet's own join flow.
		await simulateParticipantJoined(room.roomId, 'SPEAKER_PARTICIPANT');
		await sleep('3s');

		// A speaker joining must not reach the moderator-only threshold
		expect((await findRoomRecordings(room.roomId)).length).toBe(0);

		await joinFakeParticipant(room.roomId, 'MODERATOR_PARTICIPANT');
		await updateParticipantMetadata(room.roomId, 'MODERATOR_PARTICIPANT', {
			iat: Date.now(),
			roomId: room.roomId,
			permissions: Object.fromEntries(
				MEET_PERMISSION_KEYS.map((key) => [key, true])
			) as unknown as MeetRoomMemberPermissions,
			badge: MeetRoomMemberUIBadge.MODERATOR
		});
		await simulateParticipantJoined(room.roomId, 'MODERATOR_PARTICIPANT');

		// The handler fires the start in the background; poll until the recording shows up
		let recordings = await findRoomRecordings(room.roomId);
		const deadline = Date.now() + 30_000;

		while (recordings.length === 0 && Date.now() < deadline) {
			await sleep('1s');
			recordings = await findRoomRecordings(room.roomId);
		}

		expect(recordings.length).toBe(1);
		expect([MeetRecordingStatus.STARTING, MeetRecordingStatus.ACTIVE]).toContain(recordings[0].status);

		await stopRecording(recordings[0].recordingId);
	}, 90_000);

	it('should auto-start the recording only when the second participant joins', async () => {
		const { room } = await setupSingleRoom(false, 'AUTO_START_SECOND_ROOM', {
			recording: { enabled: true, autoStart: MeetRecordingAutoStartMode.WHEN_SECOND_PARTICIPANT_JOINS }
		});

		await joinFakeParticipant(room.roomId, 'FIRST_PARTICIPANT');
		await simulateParticipantJoined(room.roomId, 'FIRST_PARTICIPANT');
		await sleep('3s');

		// Only one participant so far: the second-participant threshold must not have been reached
		expect((await findRoomRecordings(room.roomId)).length).toBe(0);

		await joinFakeParticipant(room.roomId, 'SECOND_PARTICIPANT');
		await simulateParticipantJoined(room.roomId, 'SECOND_PARTICIPANT');

		// The handler fires the start in the background; poll until the recording shows up
		let recordings = await findRoomRecordings(room.roomId);
		const deadline = Date.now() + 30_000;

		while (recordings.length === 0 && Date.now() < deadline) {
			await sleep('1s');
			recordings = await findRoomRecordings(room.roomId);
		}

		expect(recordings.length).toBe(1);
		expect([MeetRecordingStatus.STARTING, MeetRecordingStatus.ACTIVE]).toContain(recordings[0].status);

		// A third join must not start a second recording (the recording-active lock dedupes)
		await joinFakeParticipant(room.roomId, 'THIRD_PARTICIPANT');
		await simulateParticipantJoined(room.roomId, 'THIRD_PARTICIPANT');
		await sleep('3s');

		expect((await findRoomRecordings(room.roomId)).length).toBe(1);

		await stopRecording(recordings[0].recordingId);
	}, 90_000);

	it('should not restart the recording when a participant joins after a manual stop', async () => {
		const { room } = await setupSingleRoom(false, 'NO_RESTART_AFTER_STOP_ROOM', {
			recording: { enabled: true, autoStart: MeetRecordingAutoStartMode.WHEN_FIRST_PARTICIPANT_JOINS }
		});

		await joinFakeParticipant(room.roomId, 'FIRST_PARTICIPANT');
		await simulateParticipantJoined(room.roomId, 'FIRST_PARTICIPANT');

		// The handler fires the start in the background; poll until the recording shows up
		let recordings = await findRoomRecordings(room.roomId);
		const startDeadline = Date.now() + 30_000;

		while (recordings.length === 0 && Date.now() < startDeadline) {
			await sleep('1s');
			recordings = await findRoomRecordings(room.roomId);
		}

		expect(recordings.length).toBe(1);

		await stopRecording(recordings[0].recordingId);

		// The 'egress_ended' webhook that releases the recording-active lock is delivered to the
		// real deployment, not to this in-process app (see file docstring above), so poll LiveKit
		// directly for the egress to actually end, then release the lock the same way the webhook
		// handler would — the same direct-invocation technique `simulateParticipantJoined` uses.
		let activeEgress = await livekitService.getActiveEgress(room.roomId);
		const stopDeadline = Date.now() + 30_000;

		while (activeEgress.length > 0 && Date.now() < stopDeadline) {
			await sleep('1s');
			activeEgress = await livekitService.getActiveEgress(room.roomId);
		}

		expect(activeEgress.length).toBe(0);
		await recordingService.releaseRecordingLockIfNoEgress(room.roomId);

		// A manual stop is a deliberate decision: a later join reaching the same threshold again
		// must not auto-restart the recording.
		await joinFakeParticipant(room.roomId, 'SECOND_PARTICIPANT');
		await simulateParticipantJoined(room.roomId, 'SECOND_PARTICIPANT');
		await sleep('5s');

		expect((await findRoomRecordings(room.roomId)).length).toBe(1);
	}, 90_000);
});
