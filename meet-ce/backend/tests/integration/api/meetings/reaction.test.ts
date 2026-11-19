import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MeetReaction } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { MeetRoomHelper } from '../../../../src/helpers/room.helper.js';
import { FrontendEventService } from '../../../../src/services/frontend-event.service.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { errorInsufficientPermissions, errorUnauthorized } from '../../../../src/models/error.model.js';
import { disconnectFakeParticipants, joinFakeParticipant } from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRooms,
	endMeeting,
	generateRoomMemberToken,
	getFullPath,
	sendParticipantReaction,
	startTestServer,
	updateRoomRoles
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { RoomData } from '../../../interfaces/scenarios.js';
import { expectMeetError, expectValidationError } from '../../../helpers/assertion-helpers.js';

// The identity a joining token was minted for: the participant the token acts as.
const identityOf = (bearerToken: string): string => {
	const [, token] = bearerToken.split(' ');
	const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
	return payload.sub;
};

describe('Meetings API Tests', () => {
	let app: Express;
	let roomData: RoomData;

	beforeAll(async () => {
		app = await startTestServer();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Reaction Tests', () => {
		// Joins the meeting as a speaker through a joining token, so the token acts as that participant.
		const joinSpeaker = async (participantName: string) => {
			const { speakerSecret } = MeetRoomHelper.extractSecretsFromRoom(roomData.room.access);
			const token = await generateRoomMemberToken(roomData.room.roomId, {
				secret: speakerSecret,
				joinMeeting: true,
				participantName
			});
			const identity = identityOf(token);
			await joinFakeParticipant(roomData.room.roomId, identity);
			return { identity, token };
		};

		const spyOnReactionSignal = () =>
			jest
				.spyOn(container.get(FrontendEventService), 'sendParticipantReactionSentSignal')
				.mockResolvedValue(undefined);

		beforeEach(async () => {
			jest.restoreAllMocks();
			roomData = await setupSingleRoom();
		});

		it('should send the reaction on behalf of the participant the token belongs to', async () => {
			const alice = await joinSpeaker('Alice');
			const signalSpy = spyOnReactionSignal();
			const roomLookupSpy = jest.spyOn(container.get(LiveKitService), 'getRoom');

			const response = await sendParticipantReaction(
				roomData.room.roomId,
				{ reaction: MeetReaction.THUMBS_UP },
				alice.token
			);

			expect(response.status).toBe(200);
			expect(signalSpy).toHaveBeenCalledWith(roomData.room.roomId, alice.identity, MeetReaction.THUMBS_UP);
			expect(roomLookupSpy).not.toHaveBeenCalled();
		});

		it('should reject a reaction while the room has reactions disabled', async () => {
			roomData = await setupSingleRoom(false, 'TEST_ROOM', { reactions: { enabled: false } });
			const alice = await joinSpeaker('Alice');
			const signalSpy = spyOnReactionSignal();

			const response = await sendParticipantReaction(
				roomData.room.roomId,
				{ reaction: MeetReaction.RED_HEART },
				alice.token
			);

			expect(response.status).toBe(403);
			expect(response.body.error).toBe('Reaction Error');
			expect(signalSpy).not.toHaveBeenCalled();
		});

		it('should fail with 404 once the meeting has ended', async () => {
			const alice = await joinSpeaker('Alice');
			await endMeeting(roomData.room.roomId, roomData.moderatorToken);
			const signalSpy = spyOnReactionSignal();

			const response = await sendParticipantReaction(
				roomData.room.roomId,
				{ reaction: MeetReaction.THUMBS_UP },
				alice.token
			);

			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Meeting Error');
			expect(signalSpy).not.toHaveBeenCalled();
		});

		it('should fail with 403 without participantSendReaction', async () => {
			await updateRoomRoles(roomData.room.roomId, {
				speaker: { permissions: { participantSendReaction: false } }
			});
			const alice = await joinSpeaker('Alice');
			const signalSpy = spyOnReactionSignal();

			const response = await sendParticipantReaction(
				roomData.room.roomId,
				{ reaction: MeetReaction.GRINNING_FACE },
				alice.token
			);

			expectMeetError(response, errorInsufficientPermissions());
			expect(signalSpy).not.toHaveBeenCalled();
		});

		it('should fail with 403 for a token that names no participant', async () => {
			const response = await sendParticipantReaction(
				roomData.room.roomId,
				{ reaction: MeetReaction.CLAPPING_HANDS },
				roomData.speakerToken
			);

			expectMeetError(response, errorInsufficientPermissions());
		});

		it('should fail with 403 for a joining token whose participant is not in the meeting', async () => {
			await joinSpeaker('Alice');
			const { speakerSecret } = MeetRoomHelper.extractSecretsFromRoom(roomData.room.access);
			const absentToken = await generateRoomMemberToken(roomData.room.roomId, {
				secret: speakerSecret,
				joinMeeting: true,
				participantName: 'Bob'
			});
			const signalSpy = spyOnReactionSignal();

			const response = await sendParticipantReaction(
				roomData.room.roomId,
				{ reaction: MeetReaction.THUMBS_UP },
				absentToken
			);

			expect(response.status).toBe(403);
			expect(response.body.error).toBe('Reaction Error');
			expect(signalSpy).not.toHaveBeenCalled();
		});

		it('should reject a reaction outside the offered set', async () => {
			const alice = await joinSpeaker('Alice');

			const response = await sendParticipantReaction(
				roomData.room.roomId,
				{ reaction: 'party_popper' } as never,
				alice.token
			);

			expectValidationError(response, 'reaction', "received 'party_popper'");
		});

		it('should reject the emoji in place of the reaction name', async () => {
			const alice = await joinSpeaker('Alice');

			const response = await sendParticipantReaction(
				roomData.room.roomId,
				{ reaction: '👍' } as never,
				alice.token
			);

			expectValidationError(response, 'reaction', "received '👍'");
		});

		it('should fail with 401 without a room member token', async () => {
			const response = await sendParticipantReaction(roomData.room.roomId, {
				reaction: MeetReaction.SLIGHTLY_FROWNING_FACE
			});

			expectMeetError(response, errorUnauthorized());
		});

		it('should fail with 401 when the request carries only the API key', async () => {
			const response = await request(app)
				.post(
					getFullPath(
						`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/meetings/${roomData.room.roomId}/reactions`
					)
				)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send({ reaction: MeetReaction.SLIGHTLY_FROWNING_FACE });

			expectMeetError(response, errorUnauthorized());
		});
	});
});
