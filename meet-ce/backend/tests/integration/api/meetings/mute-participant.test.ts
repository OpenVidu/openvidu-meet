import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
	MeetRoomMemberRole,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberUIBadge,
	MeetSignalType
} from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { FrontendEventService } from '../../../../src/services/frontend-event.service.js';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import { disconnectFakeParticipants, updateParticipantMetadata } from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRooms,
	getMeetingParticipant,
	muteAllParticipantsMedia,
	muteParticipantMedia,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { waitForParticipantMediaState } from '../../../helpers/wait-helpers.js';
import { RoomData } from '../../../interfaces/scenarios.js';

const participantIdentity = 'TEST_PARTICIPANT';

describe('Meetings API Tests', () => {
	let roomData: RoomData;

	beforeAll(async () => {
		await startTestServer();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Mute Participant Tests', () => {
		const setParticipantRole = async (baseRole: MeetRoomMemberRole) => {
			const metadata: MeetRoomMemberTokenMetadata = {
				iat: Date.now(),
				livekitUrl: MEET_ENV.LIVEKIT_URL,
				roomId: roomData.room.roomId,
				permissions: roomData.room.roles[baseRole].permissions,
				badge:
					baseRole === MeetRoomMemberRole.MODERATOR
						? MeetRoomMemberUIBadge.MODERATOR
						: MeetRoomMemberUIBadge.OTHER
			};
			await updateParticipantMetadata(roomData.room.roomId, participantIdentity, metadata);
		};

		const spyOnMutedSignal = () =>
			jest.spyOn(container.get(FrontendEventService), 'sendParticipantMediaMutedSignal');

		beforeEach(async () => {
			roomData = await setupSingleRoom(true);
		});

		it('should mute a participant and notify them which devices were turned off', async () => {
			await setParticipantRole(MeetRoomMemberRole.SPEAKER);
			const sendSignalSpy = jest.spyOn(container.get(FrontendEventService) as any, 'sendSignal');

			// The fake participant publishes a demo camera track asynchronously; the mute can only
			// be proven against a device that was live first.
			await waitForParticipantMediaState(roomData.room.roomId, participantIdentity, { videoActive: true });

			const response = await muteParticipantMedia(
				roomData.room.roomId,
				participantIdentity,
				{ audioActive: false, videoActive: false },
				roomData.moderatorToken
			);
			expect(response.status).toBe(200);

			// The one claim only real infrastructure settles: the live snapshot reads the LiveKit
			// tracks, so the requested devices being off here means the mute reached LiveKit.
			const snapshot = await getMeetingParticipant(
				roomData.room.roomId,
				participantIdentity,
				roomData.moderatorToken
			);
			expect(snapshot.status).toBe(200);
			expect(snapshot.body.videoActive).toBe(false);
			expect(snapshot.body.audioActive).toBe(false);

			expect(sendSignalSpy).toHaveBeenCalledWith(
				roomData.room.roomId,
				{
					roomId: roomData.room.roomId,
					media: { audioActive: false, videoActive: false },
					timestamp: expect.any(Number)
				},
				{
					topic: MeetSignalType.MEET_PARTICIPANT_MEDIA_MUTED,
					destinationIdentities: [participantIdentity]
				}
			);
		});

		it('should reject turning a device on', async () => {
			const response = await muteParticipantMedia(
				roomData.room.roomId,
				participantIdentity,
				{ audioActive: true } as never,
				roomData.moderatorToken
			);
			expectValidationError(response, 'audioActive', "Invalid enum value. Expected 'false', received 'true'");
		});

		it('should reject a request that names no device', async () => {
			const response = await muteParticipantMedia(
				roomData.room.roomId,
				participantIdentity,
				{},
				roomData.moderatorToken
			);
			expect(response.status).toBe(422);
		});

		it('should reject muting a moderator', async () => {
			await setParticipantRole(MeetRoomMemberRole.MODERATOR);

			const response = await muteParticipantMedia(
				roomData.room.roomId,
				participantIdentity,
				{ audioActive: false },
				roomData.moderatorToken
			);
			expect(response.status).toBe(409);
			expect(response.body.error).toBe('Participant Error');
		});

		it('should fail with 403 when the caller lacks the participantMute permission', async () => {
			const response = await muteParticipantMedia(
				roomData.room.roomId,
				participantIdentity,
				{ audioActive: false },
				roomData.speakerToken
			);
			expect(response.status).toBe(403);
		});

		it('should fail with 404 if the participant is not in the meeting', async () => {
			const response = await muteParticipantMedia(
				roomData.room.roomId,
				'NON_EXISTENT_PARTICIPANT',
				{ audioActive: false },
				roomData.moderatorToken
			);
			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Participant Error');
		});

		it('should skip moderators when muting everyone', async () => {
			await setParticipantRole(MeetRoomMemberRole.MODERATOR);
			const mutedSignalSpy = spyOnMutedSignal();

			const response = await muteAllParticipantsMedia(
				roomData.room.roomId,
				{ audioActive: false },
				roomData.moderatorToken
			);
			expect(response.status).toBe(200);
			expect(mutedSignalSpy).not.toHaveBeenCalled();
		});

		it('should mute the non-moderator participants of the meeting', async () => {
			await setParticipantRole(MeetRoomMemberRole.SPEAKER);
			const mutedSignalSpy = spyOnMutedSignal();

			const response = await muteAllParticipantsMedia(
				roomData.room.roomId,
				{ audioActive: false },
				roomData.moderatorToken
			);
			expect(response.status).toBe(200);
			expect(mutedSignalSpy).toHaveBeenCalledWith(roomData.room.roomId, [participantIdentity], {
				audioActive: false
			});
		});
	});
});
