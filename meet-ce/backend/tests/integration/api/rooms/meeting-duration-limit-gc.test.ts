import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { MeetRoomStatus } from '@openvidu-meet/typings';
import type { Room } from 'livekit-server-sdk';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MeetRoomHelper } from '../../../../src/helpers/room.helper.js';
import { RoomRepository } from '../../../../src/repositories/room.repository.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { disconnectFakeParticipants } from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRooms,
	executeDurationLimitTimersGC,
	generateRoomMemberToken,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';

const MAX_DURATION_MINUTES = 10;

/**
 * `config.maxDurationMinutes` is enforced by a timer armed for each meeting's own deadline, with a
 * periodic sweep as the safety net: LiveKit has no native duration limit, so both read the deadline
 * Meet writes into the LiveKit room metadata and end the expired meetings by deleting the LiveKit
 * room (the same flow a moderator's meetingEnd triggers). This suite drives the sweep. The timers
 * themselves are armed from the `room_started` webhook, which this in-process suite does not
 * receive, and are covered by the unit suites.
 */
describe('Meeting Duration Limit GC Tests', () => {
	let livekitService: LiveKitService;
	let roomRepository: RoomRepository;
	let realGetRoom: (roomName: string) => Promise<Room>;

	beforeAll(async () => {
		await startTestServer();
		livekitService = container.get(LiveKitService);
		roomRepository = container.get(RoomRepository);
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
	 * Makes every read of this meeting report `remainingMs` left before its deadline, instead of
	 * waiting out real time: the deadline the enforcement reads is the `endDate` Meet writes into
	 * the LiveKit room metadata at room creation, so that is the one thing that has to be moved.
	 * Existence still comes from LiveKit, so a room the enforcement deleted reads as gone.
	 */
	const mockMeetingRemainingTime = (roomId: string, remainingMs: number) => {
		jest.spyOn(livekitService, 'getRoom').mockImplementation(async (roomName: string) => {
			const liveRoom = await realGetRoom(roomName);

			if (roomName !== roomId) {
				return liveRoom;
			}

			return {
				...liveRoom,
				metadata: JSON.stringify({
					...JSON.parse(liveRoom.metadata || '{}'),
					endDate: Date.now() + remainingMs
				})
			} as unknown as Room;
		});
	};

	it('should write the meeting deadline into the LiveKit room metadata', async () => {
		const maxDurationMinutes = 60;
		// No fake participant: the LiveKit CLI joins with LiveKit's own keys, which auto-creates the
		// room unconfigured, and Meet then finds it already there and writes no metadata at all.
		const { room, moderatorSecret } = await setupSingleRoom(false, 'MAX_DURATION_METADATA_ROOM', {
			maxDurationMinutes
		});
		// Minting a token to join is what creates the LiveKit room, metadata included
		await generateRoomMemberToken(room.roomId, {
			secret: moderatorSecret,
			joinMeeting: true,
			participantName: 'TEST_PARTICIPANT'
		});

		const livekitRoom = await livekitService.getRoom(room.roomId);
		const endDate = MeetRoomHelper.extractMeetingEndDateFromMetadata(livekitRoom.metadata);

		expect(endDate).toBeDefined();
		// Written when Meet created the room, which this test's own setup did moments ago
		expect(endDate! - Date.now()).toBeLessThanOrEqual(maxDurationMinutes * 60_000);
		expect(endDate! - Date.now()).toBeGreaterThan(maxDurationMinutes * 60_000 - 30_000);
	});

	it('should not end a meeting before its duration limit', async () => {
		const { room } = await setupSingleRoom(true, 'MAX_DURATION_FRESH_ROOM', {
			maxDurationMinutes: 60
		});
		await markRoomAsActiveMeeting(room.roomId);

		await executeDurationLimitTimersGC();

		expect(await livekitService.roomExists(room.roomId)).toBe(true);
	});

	it('should not touch an active meeting without a duration limit', async () => {
		const { room } = await setupSingleRoom(true, 'NO_DURATION_LIMIT_ROOM');
		await markRoomAsActiveMeeting(room.roomId);

		await executeDurationLimitTimersGC();

		expect(await livekitService.roomExists(room.roomId)).toBe(true);
	});

	it('should end a meeting that exceeded its duration limit', async () => {
		const { room } = await setupSingleRoom(true, 'MAX_DURATION_EXPIRED_ROOM', {
			maxDurationMinutes: MAX_DURATION_MINUTES
		});
		await markRoomAsActiveMeeting(room.roomId);

		expect(await livekitService.roomExists(room.roomId)).toBe(true);

		// Past its deadline by a margin, so the assertion cannot flake on clock rounding
		mockMeetingRemainingTime(room.roomId, -5_000);
		await executeDurationLimitTimersGC();

		expect(await livekitService.roomExists(room.roomId)).toBe(false);
	});
});
