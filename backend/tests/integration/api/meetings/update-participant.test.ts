import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { container } from '../../../../src/config/index.js';
import { LIVEKIT_URL } from '../../../../src/environment.js';
import { FrontendEventService, LiveKitService } from '../../../../src/services/index.js';
import { MeetSignalType } from '../../../../src/typings/ce/event.model.js';
import { MeetTokenMetadata, ParticipantRole } from '../../../../src/typings/ce/index.js';
import { getPermissions } from '../../../helpers/assertion-helpers.js';
import {
	deleteAllRooms,
	deleteRoom,
	disconnectFakeParticipants,
	startTestServer,
	updateParticipant,
	updateParticipantMetadata
} from '../../../helpers/request-helpers.js';
import { RoomData, setupSingleRoom } from '../../../helpers/test-scenarios.js';

const participantIdentity = 'TEST_PARTICIPANT';

describe('Meetings API Tests', () => {
	let livekitService: LiveKitService;
	let roomData: RoomData;

	beforeAll(async () => {
		startTestServer();
		livekitService = container.get(LiveKitService);
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Update Participant Tests', () => {
		const setParticipantMetadata = async (roomId: string, role: ParticipantRole) => {
			const metadata: MeetTokenMetadata = {
				livekitUrl: LIVEKIT_URL,
				roles: [
					{
						role: role,
						permissions: getPermissions(roomId, role).openvidu
					}
				],
				selectedRole: role
			};
			await updateParticipantMetadata(roomId, participantIdentity, metadata);
		};

		beforeEach(async () => {
			roomData = await setupSingleRoom(true);
		});

		it('should update participant role from speaker to moderator', async () => {
			const frontendEventService = container.get(FrontendEventService);
			const sendSignalSpy = jest.spyOn(frontendEventService as any, 'sendSignal');

			await setParticipantMetadata(roomData.room.roomId, ParticipantRole.SPEAKER);

			const response = await updateParticipant(
				roomData.room.roomId,
				participantIdentity,
				ParticipantRole.MODERATOR,
				roomData.moderatorToken
			);
			expect(response.status).toBe(200);

			// Check if the participant has been updated
			const participant = await livekitService.getParticipant(roomData.room.roomId, participantIdentity);
			expect(participant).toBeDefined();
			expect(participant).toHaveProperty('metadata');
			const metadata = JSON.parse(participant.metadata || '{}');
			expect(metadata).toHaveProperty('roles');
			expect(metadata.roles).toContainEqual(expect.objectContaining({ role: ParticipantRole.MODERATOR }));
			expect(metadata).toHaveProperty('selectedRole', ParticipantRole.MODERATOR);

			// Verify sendSignal method has been called twice
			expect(sendSignalSpy).toHaveBeenCalledTimes(2);

			expect(sendSignalSpy).toHaveBeenNthCalledWith(
				1,
				roomData.room.roomId,
				{
					roomId: roomData.room.roomId,
					participantIdentity,
					newRole: ParticipantRole.MODERATOR,
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
					newRole: ParticipantRole.MODERATOR,
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
			await setParticipantMetadata(roomData.room.roomId, ParticipantRole.MODERATOR);

			const response = await updateParticipant(
				roomData.room.roomId,
				participantIdentity,
				ParticipantRole.SPEAKER,
				roomData.moderatorToken
			);
			expect(response.status).toBe(200);

			// Check if the participant has been updated
			const participant = await livekitService.getParticipant(roomData.room.roomId, participantIdentity);
			expect(participant).toBeDefined();
			expect(participant).toHaveProperty('metadata');
			const metadata = JSON.parse(participant.metadata || '{}');
			expect(metadata).toHaveProperty('roles');
			expect(metadata.roles).toContainEqual(expect.objectContaining({ role: ParticipantRole.SPEAKER }));
			expect(metadata).toHaveProperty('selectedRole', ParticipantRole.SPEAKER);
		});

		it('should fail with 404 if participant does not exist', async () => {
			const response = await updateParticipant(
				roomData.room.roomId,
				'NON_EXISTENT_PARTICIPANT',
				ParticipantRole.MODERATOR,
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
				ParticipantRole.MODERATOR,
				roomData.moderatorToken
			);
			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Room Error');
		});
	});
});
