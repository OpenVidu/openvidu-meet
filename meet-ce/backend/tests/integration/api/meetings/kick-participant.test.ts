import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { MeetRecordingStatus } from '@openvidu-meet/typings';
import { jwtDecode } from 'jwt-decode';
import type { ClaimGrants } from 'livekit-server-sdk';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MeetParticipantHelper } from '../../../../src/helpers/participant.helper.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import {
	errorInsufficientPermissions,
	errorInvalidToken,
	OpenViduMeetError
} from '../../../../src/models/error.model.js';
import {
	disconnectFakeParticipants,
	joinFakeParticipant,
	joinFakeParticipantUntilRemoved
} from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRooms,
	generateRoomMemberToken,
	getRecording,
	kickParticipant,
	startRecordingAndWaitUntilActive,
	startTestServer,
	stopAllRecordings
} from '../../../helpers/request-helpers.js';

import { setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { RoomData } from '../../../interfaces/scenarios.js';
import { expectMeetError } from '../../../helpers/assertion-helpers.js';

const participantIdentity = 'TEST_PARTICIPANT';

describe('Meetings API Tests', () => {
	let livekitService: LiveKitService;
	let roomData: RoomData;

	beforeAll(async () => {
		await startTestServer();
		livekitService = container.get(LiveKitService);
	});

	afterAll(async () => {
		await stopAllRecordings();
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Kick Participant Tests', () => {
		beforeEach(async () => {
			roomData = await setupSingleRoom(true);
		});

		it('should kick participant from LiveKit room', async () => {
			// Check if participant exists before deletion
			const participant = await livekitService.getParticipant(roomData.room.roomId, participantIdentity);
			expect(participant).toBeDefined();
			expect(participant.identity).toBe(participantIdentity);

			// Delete the participant
			const response = await kickParticipant(roomData.room.roomId, participantIdentity, roomData.moderatorToken);
			expect(response.status).toBe(200);

			// Check if the participant has been removed from LiveKit
			await expect(livekitService.getParticipant(roomData.room.roomId, participantIdentity)).rejects.toThrow(
				OpenViduMeetError
			);
		});

		describe('the tokens of a kicked participant', () => {
			const generateSpeakerToken = async () => {
				const token = await generateRoomMemberToken(roomData.room.roomId, {
					secret: roomData.speakerSecret,
					joinMeeting: true,
					participantName: 'Kicked Speaker'
				});
				const { sub, metadata } = jwtDecode<ClaimGrants>(token.replace(/^Bearer\s+/i, ''));
				return { token, identity: sub!, metadata: metadata! };
			};

			const joinAndKickSpeaker = async () => {
				const held = await generateSpeakerToken();
				await joinFakeParticipant(roomData.room.roomId, held.identity, held.metadata);
				const response = await kickParticipant(roomData.room.roomId, held.identity, roomData.moderatorToken);
				expect(response.status).toBe(200);
				return held;
			};

			it('should reject the token the participant held', async () => {
				const held = await joinAndKickSpeaker();

				const response = await kickParticipant(roomData.room.roomId, participantIdentity, held.token);
				expectMeetError(response, errorInvalidToken());
			});

			it('should remove a session that reconnects with the token the participant held', async () => {
				const held = await joinAndKickSpeaker();

				await joinFakeParticipantUntilRemoved(roomData.room.roomId, held.identity, held.metadata);

				expect(await livekitService.participantExists(roomData.room.roomId, held.identity)).toBe(false);
			});

			it('should let the participant join again with a new token from their link', async () => {
				await joinAndKickSpeaker();

				const renewed = await generateSpeakerToken();
				await joinFakeParticipant(roomData.room.roomId, renewed.identity, renewed.metadata);

				expect(await livekitService.participantExists(roomData.room.roomId, renewed.identity)).toBe(true);
			});
		});

		it('should fail with 404 if participant does not exist', async () => {
			const response = await kickParticipant(
				roomData.room.roomId,
				'NON_EXISTENT_PARTICIPANT',
				roomData.moderatorToken
			);
			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Participant Error');
		});

		it('should fail with 404 for the recorder of a recording in progress and leave the recording going', async () => {
			const recordingResponse = await startRecordingAndWaitUntilActive(roomData.room.roomId);
			expect(recordingResponse.status).toBe(201);
			const participants = await livekitService.listRoomParticipants(roomData.room.roomId);
			const recorder = participants.find(
				(participant) => !MeetParticipantHelper.isStandardParticipant(participant)
			);
			expect(recorder).toBeDefined();

			const response = await kickParticipant(roomData.room.roomId, recorder!.identity, roomData.moderatorToken);
			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Participant Error');

			const recording = await getRecording(recordingResponse.body.recordingId);
			expect(recording.body.status).toBe(MeetRecordingStatus.ACTIVE);
		});

		it('should answer 403 to a token of another room even when the room does not exist', async () => {
			const response = await kickParticipant('nonexistent-room-id', participantIdentity, roomData.moderatorToken);
			expectMeetError(response, errorInsufficientPermissions());
		});
	});
});
