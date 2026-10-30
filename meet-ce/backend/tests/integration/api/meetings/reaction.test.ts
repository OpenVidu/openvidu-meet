import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MeetReaction } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MeetRoomHelper } from '../../../../src/helpers/room.helper.js';
import { FrontendEventService } from '../../../../src/services/frontend-event.service.js';
import { disconnectFakeParticipants, joinFakeParticipant } from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRooms,
	endMeeting,
	generateRoomMemberToken,
	sendParticipantReaction,
	startTestServer,
	updateRoomRoles
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { RoomData } from '../../../interfaces/scenarios.js';

// The identity a joining token was minted for: the participant the token acts as.
const identityOf = (bearerToken: string): string => {
	const [, token] = bearerToken.split(' ');
	const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
	return payload.sub;
};

describe('Meetings API Tests', () => {
	let roomData: RoomData;

	beforeAll(async () => {
		await startTestServer();
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

			const response = await sendParticipantReaction(
				roomData.room.roomId,
				{ reaction: MeetReaction.THUMBS_UP },
				alice.token
			);

			expect(response.status).toBe(200);
			expect(signalSpy).toHaveBeenCalledWith(roomData.room.roomId, alice.identity, MeetReaction.THUMBS_UP);
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

		it('should fail with 403 without participantReactionSend', async () => {
			await updateRoomRoles(roomData.room.roomId, {
				speaker: { permissions: { participantReactionSend: false } }
			});
			const alice = await joinSpeaker('Alice');
			const signalSpy = spyOnReactionSignal();

			const response = await sendParticipantReaction(
				roomData.room.roomId,
				{ reaction: MeetReaction.GRINNING_FACE },
				alice.token
			);

			expect(response.status).toBe(403);
			expect(signalSpy).not.toHaveBeenCalled();
		});

		it('should fail with 403 for a token that names no participant', async () => {
			const response = await sendParticipantReaction(
				roomData.room.roomId,
				{ reaction: MeetReaction.CLAPPING_HANDS },
				roomData.speakerToken
			);

			expect(response.status).toBe(403);
		});

		it('should reject a reaction outside the offered set', async () => {
			const alice = await joinSpeaker('Alice');

			const response = await sendParticipantReaction(
				roomData.room.roomId,
				{ reaction: 'party_popper' } as never,
				alice.token
			);

			expect(response.status).toBe(422);
		});

		it('should reject the emoji in place of the reaction name', async () => {
			const alice = await joinSpeaker('Alice');

			const response = await sendParticipantReaction(
				roomData.room.roomId,
				{ reaction: '👍' } as never,
				alice.token
			);

			expect(response.status).toBe(422);
		});

		it('should fail with 401 without a room member token', async () => {
			const response = await sendParticipantReaction(roomData.room.roomId, {
				reaction: MeetReaction.SLIGHTLY_FROWNING_FACE
			});

			expect(response.status).toBe(401);
		});
	});
});
