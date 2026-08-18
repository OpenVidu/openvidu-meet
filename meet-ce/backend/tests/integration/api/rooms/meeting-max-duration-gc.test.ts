import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { MeetRoomStatus } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { RoomRepository } from '../../../../src/repositories/room.repository.js';
import { FrontendEventService } from '../../../../src/services/frontend-event.service.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { disconnectFakeParticipants } from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRooms,
	executeMeetingMaxDurationGC,
	sleep,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';

/**
 * `config.maxDurationMinutes` is enforced by a periodic sweep: LiveKit has no native
 * duration limit, so the scheduled task compares each duration-limited active meeting against the
 * LiveKit room's creation time and ends the expired ones by deleting the LiveKit room (the same
 * flow a moderator's meetingEnd triggers). The same sweep warns the meetings that entered the
 * `MEETING_DURATION_WARNING_REMAINING` window before their deadline, once per meeting.
 *
 * The expiry test genuinely waits out a one-minute meeting: the meeting start is LiveKit's room
 * creation time, which cannot be faked from here.
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
		// A fresh one-minute meeting is already inside the default 5-minute warning threshold
		const { room } = await setupSingleRoom(true, 'MAX_DURATION_WARNING_ROOM', {
			maxDurationMinutes: 1
		});
		await markRoomAsActiveMeeting(room.roomId);

		await executeMeetingMaxDurationGC();
		// The warning must not repeat on the next sweep (once-only Redis guard)
		await executeMeetingMaxDurationGC();

		const warningCalls = sendWarningSpy.mock.calls.filter(([roomId]) => roomId === room.roomId);
		expect(warningCalls).toHaveLength(1);
		expect(warningCalls[0][1]).toBe(1);

		// The meeting was warned, not ended
		expect(await livekitService.roomExists(room.roomId)).toBe(true);
	});

	it('should end a meeting that exceeded its duration limit', async () => {
		const { room } = await setupSingleRoom(true, 'MAX_DURATION_EXPIRED_ROOM', {
			maxDurationMinutes: 1
		});
		await markRoomAsActiveMeeting(room.roomId);

		expect(await livekitService.roomExists(room.roomId)).toBe(true);

		// Wait out the one-minute limit (plus a margin over LiveKit's second-granularity clock)
		await sleep('65s');
		await executeMeetingMaxDurationGC();

		expect(await livekitService.roomExists(room.roomId)).toBe(false);
	}, 120_000);
});
