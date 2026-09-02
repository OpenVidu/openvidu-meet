import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { MeetRoomStatus } from '@openvidu-meet/typings';
import type { Room } from 'livekit-server-sdk';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { RoomRepository } from '../../../../src/repositories/room.repository.js';
import { FrontendEventService } from '../../../../src/services/frontend-event.service.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { disconnectFakeParticipants } from '../../../helpers/livekit-cli-helpers.js';
import { deleteAllRooms, executeMeetingMaxDurationGC, startTestServer } from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';

const { MEETING_MIN_DURATION_MINUTES_LIMIT } = INTERNAL_CONFIG;

/**
 * `config.maxDurationMinutes` is enforced by a periodic sweep: LiveKit has no native
 * duration limit, so the scheduled task compares each duration-limited active meeting against the
 * LiveKit room's creation time and ends the expired ones by deleting the LiveKit room (the same
 * flow a moderator's meetingEnd triggers). The same sweep warns the meetings that entered the
 * `MEETING_DURATION_WARNING_REMAINING` window before their deadline, once per meeting.
 */
describe('Meeting Max Duration GC Tests', () => {
	let livekitService: LiveKitService;
	let roomRepository: RoomRepository;
	let frontendEventService: FrontendEventService;

	beforeAll(async () => {
		await startTestServer();
		livekitService = container.get(LiveKitService);
		roomRepository = container.get(RoomRepository);
		frontendEventService = container.get(FrontendEventService);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	/**
	 * The ACTIVE_MEETING status normally flips on the LiveKit room_started webhook, which this
	 * in-process suite does not receive; the sweep selects its candidates by that status, so it is
	 * forced directly (same technique as the active-status GC suite).
	 */
	const markRoomAsActiveMeeting = async (roomId: string) => {
		await roomRepository.updatePartial(roomId, { status: MeetRoomStatus.ACTIVE_MEETING });
	};

	/**
	 * Makes the next sweep see this meeting as having started `elapsedSeconds` ago, instead of
	 * waiting out real time: the sweep's only clock is LiveKit's own room creation time, so that is
	 * the one thing that has to be faked.
	 */
	const mockMeetingElapsedTime = async (roomId: string, elapsedSeconds: number) => {
		const liveRoom = await livekitService.getRoom(roomId);
		const pastCreationTime = BigInt(Math.floor(Date.now() / 1000) - elapsedSeconds);
		jest.spyOn(livekitService, 'getRoom').mockResolvedValueOnce({
			...liveRoom,
			creationTime: pastCreationTime
		} as unknown as Room);
	};

	it('should not end a meeting before its duration limit', async () => {
		const { room } = await setupSingleRoom(true, 'MAX_DURATION_FRESH_ROOM', {
			maxDurationMinutes: 60
		});
		await markRoomAsActiveMeeting(room.roomId);

		await executeMeetingMaxDurationGC();

		expect(await livekitService.roomExists(room.roomId)).toBe(true);
	});

	it('should not touch an active meeting without a duration limit', async () => {
		const { room } = await setupSingleRoom(true, 'NO_DURATION_LIMIT_ROOM');
		await markRoomAsActiveMeeting(room.roomId);

		await executeMeetingMaxDurationGC();

		expect(await livekitService.roomExists(room.roomId)).toBe(true);
	});

	it('should not warn a meeting still outside its end-warning window', async () => {
		const sendWarningSpy = jest.spyOn(frontendEventService, 'sendMeetingEndingSoonSignal');
		// 60-minute limit, freshly started: far from the default 5-minute warning threshold
		const { room } = await setupSingleRoom(true, 'MAX_DURATION_NO_WARNING_ROOM', {
			maxDurationMinutes: 60
		});
		await markRoomAsActiveMeeting(room.roomId);

		await executeMeetingMaxDurationGC();

		const warnedRooms = sendWarningSpy.mock.calls.map(([roomId]) => roomId);
		expect(warnedRooms).not.toContain(room.roomId);
	});

	it('should warn a meeting inside its end-warning window exactly once', async () => {
		const sendWarningSpy = jest.spyOn(frontendEventService, 'sendMeetingEndingSoonSignal');
		const { room } = await setupSingleRoom(true, 'MAX_DURATION_WARNING_ROOM', {
			maxDurationMinutes: MEETING_MIN_DURATION_MINUTES_LIMIT
		});
		await markRoomAsActiveMeeting(room.roomId);
		// 1 minute left out of the floor's 10: inside the default 5-minute warning threshold
		const remainingMinutes = 1;
		const elapsedSeconds = (MEETING_MIN_DURATION_MINUTES_LIMIT - remainingMinutes) * 60;

		await mockMeetingElapsedTime(room.roomId, elapsedSeconds);
		await executeMeetingMaxDurationGC();
		// The warning must not repeat on the next sweep (once-only Redis guard), still inside the
		// same warning window
		await mockMeetingElapsedTime(room.roomId, elapsedSeconds);
		await executeMeetingMaxDurationGC();

		const warningCalls = sendWarningSpy.mock.calls.filter(([roomId]) => roomId === room.roomId);
		expect(warningCalls).toHaveLength(1);

		// remainingMs is exact, not rounded: it must be at most the requested 1 minute, and no more
		// than a few seconds under it (the time this test itself took to reach the assertion)
		const remainingMs = warningCalls[0][1];
		expect(remainingMs).toBeLessThanOrEqual(remainingMinutes * 60_000);
		expect(remainingMs).toBeGreaterThan(remainingMinutes * 60_000 - 5_000);

		// The meeting was warned, not ended
		expect(await livekitService.roomExists(room.roomId)).toBe(true);
	});

	it('should end a meeting that exceeded its duration limit', async () => {
		const { room } = await setupSingleRoom(true, 'MAX_DURATION_EXPIRED_ROOM', {
			maxDurationMinutes: MEETING_MIN_DURATION_MINUTES_LIMIT
		});
		await markRoomAsActiveMeeting(room.roomId);

		expect(await livekitService.roomExists(room.roomId)).toBe(true);

		// Past its deadline by a margin, so the assertion cannot flake on clock rounding
		await mockMeetingElapsedTime(room.roomId, MEETING_MIN_DURATION_MINUTES_LIMIT * 60 + 5);
		await executeMeetingMaxDurationGC();

		expect(await livekitService.roomExists(room.roomId)).toBe(false);
	});
});
