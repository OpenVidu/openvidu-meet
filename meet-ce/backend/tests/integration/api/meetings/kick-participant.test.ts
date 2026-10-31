import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { MeetRecordingStatus } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MeetParticipantHelper } from '../../../../src/helpers/participant.helper.js';
import { OpenViduMeetError } from '../../../../src/models/error.model.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { disconnectFakeParticipants, joinFakeParticipant } from '../../../helpers/livekit-cli-helpers.js';
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

		it('should let a kicked participant join again with the same access', async () => {
			const joinWithSpeakerLink = async () => {
				const token = await generateRoomMemberToken(roomData.room.roomId, {
					secret: roomData.speakerSecret,
					joinMeeting: true,
					participantName: 'Kicked Speaker'
				});
				const { sub: identity } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
				await joinFakeParticipant(roomData.room.roomId, identity);
				return identity as string;
			};

			const kickedIdentity = await joinWithSpeakerLink();
			const response = await kickParticipant(roomData.room.roomId, kickedIdentity, roomData.moderatorToken);
			expect(response.status).toBe(200);

			const rejoinedIdentity = await joinWithSpeakerLink();
			expect(await livekitService.participantExists(roomData.room.roomId, rejoinedIdentity)).toBe(true);
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

		it('should fail with 404 if room does not exist', async () => {
			const response = await kickParticipant('nonexistent-room-id', participantIdentity, roomData.moderatorToken);
			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Room Error');
		});
	});
});
