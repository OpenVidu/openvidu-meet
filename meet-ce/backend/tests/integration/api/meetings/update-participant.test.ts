import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MeetRoomMemberRole, MeetRoomMemberTokenMetadata, MeetSignalType } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { FrontendEventService } from '../../../../src/services/frontend-event.service.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { getPermissions } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRooms,
	deleteRoom,
	disconnectFakeParticipants,
	startTestServer,
	updateParticipant,
	updateParticipantMetadata
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
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Update Participant Tests', () => {
		const setParticipantMetadata = async (roomId: string, baseRole: MeetRoomMemberRole) => {
			const metadata: MeetRoomMemberTokenMetadata = {
				livekitUrl: MEET_ENV.LIVEKIT_URL,
				roomId,
				baseRole,
				effectivePermissions: getPermissions(baseRole)
			};
			await updateParticipantMetadata(roomId, participantIdentity, metadata);
		};

		beforeEach(async () => {
			roomData = await setupSingleRoom(true);
		});

		it('should update participant role from speaker to moderator', async () => {
			const frontendEventService = container.get(FrontendEventService);
			const sendSignalSpy = jest.spyOn(frontendEventService as any, 'sendSignal');

			await setParticipantMetadata(roomData.room.roomId, MeetRoomMemberRole.SPEAKER);

			const response = await updateParticipant(
				roomData.room.roomId,
				participantIdentity,
				MeetRoomMemberRole.MODERATOR,
				roomData.moderatorToken
			);
			expect(response.status).toBe(200);

			// Check if the participant has been updated
			const participant = await livekitService.getParticipant(roomData.room.roomId, participantIdentity);
			expect(participant).toBeDefined();
			expect(participant).toHaveProperty('metadata');
			const metadata = JSON.parse(participant.metadata || '{}');
			expect(metadata).toHaveProperty('roomId', roomData.room.roomId);
			expect(metadata).toHaveProperty('baseRole', MeetRoomMemberRole.MODERATOR);
			const permissions = getPermissions(MeetRoomMemberRole.MODERATOR);
			expect(metadata).toHaveProperty('effectivePermissions', permissions);

			// Verify sendSignal method has been called twice
			expect(sendSignalSpy).toHaveBeenCalledTimes(2);

			expect(sendSignalSpy).toHaveBeenNthCalledWith(
				1,
				roomData.room.roomId,
				{
					roomId: roomData.room.roomId,
					participantIdentity,
					newRole: MeetRoomMemberRole.MODERATOR,
					secret: expect.any(String),
					timestamp: expect.any(Number)
				},
				{
					topic: MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED,
					destinationIdentities: [participantIdentity]
				}
			);

			expect(sendSignalSpy).toHaveBeenNthCalledWith(
				2,
				roomData.room.roomId,
				{
					roomId: roomData.room.roomId,
					participantIdentity,
					newRole: MeetRoomMemberRole.MODERATOR,
					secret: undefined,
					timestamp: expect.any(Number)
				},
				{
					topic: MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED,
					destinationIdentities: []
				}
			);
		});

		it('should update participant role from moderator to speaker', async () => {
			await setParticipantMetadata(roomData.room.roomId, MeetRoomMemberRole.MODERATOR);

			const response = await updateParticipant(
				roomData.room.roomId,
				participantIdentity,
				MeetRoomMemberRole.SPEAKER,
				roomData.moderatorToken
			);
			expect(response.status).toBe(200);

			// Check if the participant has been updated
			const participant = await livekitService.getParticipant(roomData.room.roomId, participantIdentity);
			expect(participant).toBeDefined();
			expect(participant).toHaveProperty('metadata');
			const metadata = JSON.parse(participant.metadata || '{}');
			expect(metadata).toHaveProperty('roomId', roomData.room.roomId);
			expect(metadata).toHaveProperty('baseRole', MeetRoomMemberRole.SPEAKER);
			const permissions = getPermissions(MeetRoomMemberRole.SPEAKER);
			expect(metadata).toHaveProperty('effectivePermissions', permissions);
		});

		it('should fail with 404 if participant does not exist', async () => {
			const response = await updateParticipant(
				roomData.room.roomId,
				'NON_EXISTENT_PARTICIPANT',
				MeetRoomMemberRole.MODERATOR,
				roomData.moderatorToken
			);
			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Participant Error');
		});

		it('should fail with 404 if room does not exist', async () => {
			// Delete the room to ensure it does not exist
			let response = await deleteRoom(roomData.room.roomId, { withMeeting: 'force' });
			expect(response.status).toBe(200);

			response = await updateParticipant(
				roomData.room.roomId,
				participantIdentity,
				MeetRoomMemberRole.MODERATOR,
				roomData.moderatorToken
			);
			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Room Error');
		});
	});
});
