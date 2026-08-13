import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { MeetMeetingInfo, MeetParticipantInfo, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { MEET_PERMISSION_KEYS, MeetRoomMemberRole, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import {
	disconnectFakeParticipants,
	joinFakeParticipant,
	updateParticipantMetadata
} from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRooms,
	generateRoomMemberToken,
	getFullPath,
	startTestServer,
	updateRoomRoles
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { RoomData } from '../../../interfaces/scenarios.js';

const MEETINGS_PATH = getFullPath(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/meetings`);

const PARTICIPANT_IDENTITY = 'TEST_PARTICIPANT';
const EXTERNAL_ID = 'crm-user_42';
const APP_METADATA = '{"department": "cardiology"}';

describe('Meetings API Tests', () => {
	let app: Express;

	// A room with an active meeting (one fake participant) and one without any meeting.
	let meetingRoom: RoomData;
	let idleRoom: RoomData;

	const getMeeting = (roomId: string, token: string) =>
		request(app).get(`${MEETINGS_PATH}/${roomId}`).set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, token);

	const getParticipants = (roomId: string, token: string) =>
		request(app)
			.get(`${MEETINGS_PATH}/${roomId}/participants`)
			.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, token);

	const getParticipant = (roomId: string, identity: string, token: string) =>
		request(app)
			.get(`${MEETINGS_PATH}/${roomId}/participants/${identity}`)
			.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, token);

	beforeAll(async () => {
		app = await startTestServer();

		meetingRoom = await setupSingleRoom(true, 'MEETING_INFO_ROOM');
		idleRoom = await setupSingleRoom(false, 'IDLE_ROOM');

		// Stamp the fake participant with the metadata a real Meet join would carry, including the
		// app-provided correlation fields.
		await updateParticipantMetadata(meetingRoom.room.roomId, PARTICIPANT_IDENTITY, {
			iat: Date.now(),
			roomId: meetingRoom.room.roomId,
			permissions: Object.fromEntries(
				MEET_PERMISSION_KEYS.map((key) => [key, true])
			) as unknown as MeetRoomMemberPermissions,
			badge: MeetRoomMemberUIBadge.OTHER,
			externalId: EXTERNAL_ID,
			metadata: APP_METADATA
		});
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Get Meeting Tests', () => {
		it('should return the live meeting info while the meeting is active', async () => {
			const response = await getMeeting(meetingRoom.room.roomId, meetingRoom.moderatorToken);
			expect(response.status).toBe(200);

			const meeting = response.body as MeetMeetingInfo;
			expect(meeting.roomId).toBe(meetingRoom.room.roomId);
			expect(meeting.roomName).toBe(meetingRoom.room.roomName);
			expect(meeting.startDate).toBeGreaterThan(0);
			expect(meeting.startDate).toBeLessThanOrEqual(Date.now());
			expect(meeting.participantCount).toBe(1);
			expect(meeting.recordingActive).toBe(false);
		});

		it('should fail with 404 when the room has no active meeting', async () => {
			const response = await getMeeting(idleRoom.room.roomId, idleRoom.moderatorToken);
			expect(response.status).toBe(404);
			expect(response.body.message).toContain('no active meeting');
		});

		it('should fail with 404 when the room does not exist', async () => {
			const response = await getMeeting('non-existent-room', meetingRoom.moderatorToken);
			expect(response.status).toBe(404);
		});

		it('should fail with 401 without a room member token', async () => {
			const response = await request(app).get(`${MEETINGS_PATH}/${meetingRoom.room.roomId}`);
			expect(response.status).toBe(401);
		});

		it('should reject a token minted for another room', async () => {
			const response = await getMeeting(meetingRoom.room.roomId, idleRoom.moderatorToken);
			expect(response.status).toBe(403);
		});

		it('should reject a token without the meetingRead permission', async () => {
			// The recording secret mints a read-only token (recording permissions only): it can view
			// recordings but must not observe the live meeting.
			expect(meetingRoom.recordingSecret).toBeDefined();
			const recordingToken = await generateRoomMemberToken(meetingRoom.room.roomId, {
				secret: meetingRoom.recordingSecret!
			});

			const response = await getMeeting(meetingRoom.room.roomId, recordingToken);
			expect(response.status).toBe(403);
		});

		it('should gate on meetingRead and not on meetingJoin', async () => {
			// Own room: updating the roles bumps rolesUpdatedAt, which invalidates the tokens the
			// other tests minted for their rooms.
			const gatedRoom = await setupSingleRoom(false, 'MEETING_READ_ROOM');
			const { roomId, roles } = gatedRoom.room;

			// A speaker who may still enter the meeting, but not observe it.
			const rolesResponse = await updateRoomRoles(roomId, {
				moderator: { permissions: roles!.moderator.permissions },
				speaker: { permissions: { ...roles!.speaker.permissions, meetingRead: false } }
			});
			expect(rolesResponse.status).toBe(200);

			const [speakerToken, moderatorToken] = await Promise.all([
				generateRoomMemberToken(roomId, { secret: gatedRoom.speakerSecret }),
				generateRoomMemberToken(roomId, { secret: gatedRoom.moderatorSecret })
			]);

			expect((await getMeeting(roomId, speakerToken)).status).toBe(403);
			expect((await getParticipants(roomId, speakerToken)).status).toBe(403);

			// The moderator keeps meetingRead and gets past the gate — 404 because this room has no
			// active meeting, which is the answer the permission check no longer preempts.
			expect((await getMeeting(roomId, moderatorToken)).status).toBe(404);
		});
	});

	describe('Get Meeting Participants Tests', () => {
		it('should list the participants with their live snapshot and correlation fields', async () => {
			const response = await getParticipants(meetingRoom.room.roomId, meetingRoom.moderatorToken);
			expect(response.status).toBe(200);

			const { participants } = response.body as { participants: MeetParticipantInfo[] };
			expect(participants).toHaveLength(1);

			const participant = participants[0];
			expect(participant.participantIdentity).toBe(PARTICIPANT_IDENTITY);
			expect(participant.externalId).toBe(EXTERNAL_ID);
			expect(participant.metadata).toBe(APP_METADATA);
			expect(participant.role).toBe(MeetRoomMemberRole.SPEAKER);
			expect(participant.joinDate).toBeLessThanOrEqual(Date.now());
			expect(typeof participant.audioEnabled).toBe('boolean');
			expect(typeof participant.videoEnabled).toBe('boolean');
			expect(participant.screenSharing).toBe(false);
		});

		it('should fail with 404 when the room has no active meeting', async () => {
			const response = await getParticipants(idleRoom.room.roomId, idleRoom.moderatorToken);
			expect(response.status).toBe(404);
		});
	});

	describe('Get Meeting Participant Tests', () => {
		it('should return the live snapshot of one participant', async () => {
			const response = await getParticipant(
				meetingRoom.room.roomId,
				PARTICIPANT_IDENTITY,
				meetingRoom.moderatorToken
			);
			expect(response.status).toBe(200);

			const participant = response.body as MeetParticipantInfo;
			expect(participant.participantIdentity).toBe(PARTICIPANT_IDENTITY);
			expect(participant.externalId).toBe(EXTERNAL_ID);
			expect(participant.metadata).toBe(APP_METADATA);
		});

		it('should fail with 404 for a participant that is not in the meeting', async () => {
			const response = await getParticipant(meetingRoom.room.roomId, 'nobody-here', meetingRoom.moderatorToken);
			expect(response.status).toBe(404);
		});

		it('should count and list only the stamped participant after another one joins and leaves', async () => {
			// A second fake participant joins...
			const transientIdentity = 'TEST_PARTICIPANT_TRANSIENT';
			await joinFakeParticipant(meetingRoom.room.roomId, transientIdentity);

			let response = await getMeeting(meetingRoom.room.roomId, meetingRoom.moderatorToken);
			expect(response.status).toBe(200);
			expect((response.body as MeetMeetingInfo).participantCount).toBe(2);

			// ...and its snapshot degrades gracefully without Meet metadata: speaker role, no
			// correlation fields.
			response = await getParticipant(meetingRoom.room.roomId, transientIdentity, meetingRoom.moderatorToken);
			expect(response.status).toBe(200);
			expect((response.body as MeetParticipantInfo).role).toBe(MeetRoomMemberRole.SPEAKER);
			expect((response.body as MeetParticipantInfo).externalId).toBeUndefined();
		});
	});
});
