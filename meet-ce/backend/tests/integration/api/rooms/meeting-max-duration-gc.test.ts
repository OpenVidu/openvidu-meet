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
 * `config.maxDurationMinutes` is enforced by a timer armed for each meeting's own deadline, with a
 * periodic sweep as the safety net: LiveKit has no native duration limit, so both compare the
 * LiveKit room's creation time against the limit and end the expired meetings by deleting the
 * LiveKit room (the same flow a moderator's meetingEnd triggers). This suite drives the sweep,
 * which is also what warns the meetings that entered the `MEETING_DURATION_WARNING_REMAINING`
 * window before their deadline, once per meeting. The timers themselves are armed from the
 * `room_started` webhook, which this in-process suite does not receive, and are covered by the
 * unit suites.
 */
describe('Meeting Max Duration GC Tests', () => {
	let livekitService: LiveKitService;
	let roomRepository: RoomRepository;
	let frontendEventService: FrontendEventService;
	let realGetRoom: (roomName: string) => Promise<Room>;

	beforeAll(async () => {
		await startTestServer();
		livekitService = container.get(LiveKitService);
		roomRepository = container.get(RoomRepository);
		frontendEventService = container.get(FrontendEventService);
		realGetRoom = livekitService.getRoom.bind(livekitService);
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
	 * Makes every read of this meeting report it as having started `elapsedSeconds` ago, instead of
	 * waiting out real time: the only clock the enforcement has is LiveKit's own room creation
	 * time, so that is the one thing that has to be faked. Existence still comes from LiveKit, so a
	 * room the enforcement deleted reads as gone.
	 */
	const mockMeetingElapsedTime = (roomId: string, elapsedSeconds: number) => {
		jest.spyOn(livekitService, 'getRoom').mockImplementation(async (roomName: string) => {
			const liveRoom = await realGetRoom(roomName);

			if (roomName !== roomId) {
				return liveRoom;
			}

			return {
				...liveRoom,
				creationTime: BigInt(Math.floor(Date.now() / 1000) - elapsedSeconds)
			} as unknown as Room;
		});
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

		mockMeetingElapsedTime(room.roomId, elapsedSeconds);
		await executeMeetingMaxDurationGC();
		// The warning must not repeat on the next sweep (once-only Redis guard), still inside the
		// same warning window
		mockMeetingElapsedTime(room.roomId, elapsedSeconds);
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
		mockMeetingElapsedTime(room.roomId, MEETING_MIN_DURATION_MINUTES_LIMIT * 60 + 5);
		await executeMeetingMaxDurationGC();

		expect(await livekitService.roomExists(room.roomId)).toBe(false);
	});
});
