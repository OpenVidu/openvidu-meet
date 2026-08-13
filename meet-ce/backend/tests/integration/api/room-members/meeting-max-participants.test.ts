import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MeetingService } from '../../../../src/services/meeting.service.js';
import { disconnectFakeParticipants, joinFakeParticipant } from '../../../helpers/livekit-cli-helpers.js';
import { deleteAllRooms, generateRoomMemberTokenRequest, startTestServer } from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';

/**
 * `config.maxParticipants` gates the generation of joining tokens: once the meeting holds
 * that many standard participants, further joins are rejected with a 409.
 */
describe('Meeting Max Participants Tests', () => {
	let meetingService: MeetingService;

	beforeAll(async () => {
		await startTestServer();
		meetingService = container.get(MeetingService);
	});

	afterEach(async () => {
		jest.restoreAllMocks();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	it('should reject a join once the meeting holds maxParticipants standard participants', async () => {
		const { room, speakerSecret } = await setupSingleRoom(false, 'MAX_PARTICIPANTS_ROOM', {
			maxParticipants: 1
		});

		// Nobody is in the meeting yet: the first joining token is granted (and creates the
		// LiveKit room as a side effect)
		const firstJoinResponse = await generateRoomMemberTokenRequest(room.roomId, {
			secret: speakerSecret,
			joinMeeting: true,
			participantName: 'First Participant'
		});
		expect(firstJoinResponse.status).toBe(200);

		// Fill the only seat with a connected participant. joinFakeParticipant resolves once the
		// participant is connected in LiveKit, which is exactly what the join gate counts — the
		// Meet room status flip rides the LiveKit webhook and is irrelevant (and environment-
		// dependent) here.
		await joinFakeParticipant(room.roomId, 'SEAT_FILLER');

		const secondJoinResponse = await generateRoomMemberTokenRequest(room.roomId, {
			secret: speakerSecret,
			joinMeeting: true,
			participantName: 'Second Participant'
		});
		expect(secondJoinResponse.status).toBe(409);
		expect(secondJoinResponse.body.message).toContain('maximum number of participants');
	});

	it('should reject a join with a server error when counting participants fails, instead of treating the room as empty', async () => {
		const { room, speakerSecret } = await setupSingleRoom(false, 'MAX_PARTICIPANTS_COUNT_FAILURE_ROOM', {
			maxParticipants: 1
		});

		// Simulate a LiveKit-side failure while listing participants (e.g. an outage or
		// misconfigured credentials — verified against a real deployment: listParticipants never
		// throws for a room LiveKit doesn't know about, so any error here is a genuine failure).
		jest.spyOn(meetingService['livekitService'], 'listRoomParticipants').mockRejectedValueOnce(
			new Error('Simulated LiveKit outage')
		);

		const joinResponse = await generateRoomMemberTokenRequest(room.roomId, {
			secret: speakerSecret,
			joinMeeting: true,
			participantName: 'First Participant'
		});
		expect(joinResponse.status).toBe(500);
		expect(joinResponse.body.error).toContain('Internal Server Error');
	});

	it('should reject a connection at the LiveKit level when a token issued while the meeting was empty is redeemed too late', async () => {
		const { room, speakerSecret } = await setupSingleRoom(false, 'MAX_PARTICIPANTS_TOKEN_BYPASS_ROOM', {
			maxParticipants: 1
		});

		// The meeting is empty: Meet's own count-based check grants both tokens, exactly the
		// bypass a client could exploit by requesting (and holding onto) tokens ahead of time. A
		// token remains a valid LiveKit credential for its own lifetime, independent of this count.
		const firstJoinResponse = await generateRoomMemberTokenRequest(room.roomId, {
			secret: speakerSecret,
			joinMeeting: true,
			participantName: 'First Participant'
		});
		const secondJoinResponse = await generateRoomMemberTokenRequest(room.roomId, {
			secret: speakerSecret,
			joinMeeting: true,
			participantName: 'Second Participant'
		});
		expect(firstJoinResponse.status).toBe(200);
		expect(secondJoinResponse.status).toBe(200);

		// The first credential is redeemed, filling the only native LiveKit seat.
		await joinFakeParticipant(room.roomId, 'FIRST_CONNECTS');

		// The second, equally valid credential is redeemed later. Meet's token-issuance check is
		// not in this path at all — only LiveKit's native `maxParticipants` (room.service.ts) can
		// still catch this, by rejecting the connection itself.
		await expect(joinFakeParticipant(room.roomId, 'SECOND_CONNECTS')).rejects.toThrow();
	});

	it('should keep granting non-joining tokens while the meeting is full', async () => {
		const { room, speakerSecret } = await setupSingleRoom(false, 'MAX_PARTICIPANTS_OBSERVER_ROOM', {
			maxParticipants: 1
		});

		await joinFakeParticipant(room.roomId, 'ONLY_SEAT');

		// A token that does not join the meeting (recordings view, introspection) takes no seat
		const response = await generateRoomMemberTokenRequest(room.roomId, {
			secret: speakerSecret,
			joinMeeting: false
		});
		expect(response.status).toBe(200);
	});

	it('should not limit joins in a room without maxParticipants', async () => {
		const { room, speakerSecret } = await setupSingleRoom(true, 'UNLIMITED_ROOM');

		const response = await generateRoomMemberTokenRequest(room.roomId, {
			secret: speakerSecret,
			joinMeeting: true,
			participantName: 'Anyone'
		});
		expect(response.status).toBe(200);
	});
});
