import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MeetEventOrigin } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { MeetRoomHelper } from '../../../../src/helpers/room.helper.js';
import { WebhookDispatcherService } from '../../../../src/services/webhook-dispatcher.service.js';
import { disconnectFakeParticipants, joinFakeParticipant } from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRooms,
	generateRoomMemberToken,
	getMeetingParticipant,
	lowerAllHands,
	startTestServer,
	updateParticipantHand
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { RoomData } from '../../../interfaces/scenarios.js';

interface JoinedParticipant {
	identity: string;
	token: string;
}

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

	describe('Raise Hand Tests', () => {
		// Joins the meeting as a speaker through a joining token, so the token acts as that participant.
		const joinSpeaker = async (participantName: string): Promise<JoinedParticipant> => {
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

		const handOf = async (participant: JoinedParticipant) => {
			const response = await getMeetingParticipant(roomData.room.roomId, participant.identity, participant.token);
			expect(response.status).toBe(200);
			return response.body as { handRaised: boolean; handRaiseDate?: number };
		};

		const spyOnHandWebhook = () =>
			jest
				.spyOn(container.get(WebhookDispatcherService), 'sendParticipantHandChangedWebhook')
				.mockImplementation(() => undefined);

		beforeEach(async () => {
			jest.restoreAllMocks();
			roomData = await setupSingleRoom(true);
		});

		it('should raise and lower the own hand, reporting each change to the webhooks', async () => {
			const alice = await joinSpeaker('Alice');
			const webhookSpy = spyOnHandWebhook();

			const raise = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ raised: true },
				alice.token
			);
			expect(raise.status).toBe(200);

			const raised = await handOf(alice);
			expect(raised.handRaised).toBe(true);
			expect(raised.handRaiseDate).toEqual(expect.any(Number));
			expect(webhookSpy).toHaveBeenLastCalledWith({
				roomId: roomData.room.roomId,
				roomName: roomData.room.roomName,
				participant: expect.objectContaining({
					participantIdentity: alice.identity,
					audioActive: expect.any(Boolean),
					handRaised: true,
					handRaiseDate: raised.handRaiseDate
				}),
				origin: MeetEventOrigin.PARTICIPANT
			});

			const lower = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ raised: false },
				alice.token
			);
			expect(lower.status).toBe(200);

			const lowered = await handOf(alice);
			expect(lowered.handRaised).toBe(false);
			expect(lowered.handRaiseDate).toBeUndefined();
			expect(webhookSpy).toHaveBeenLastCalledWith(
				expect.objectContaining({
					participant: expect.objectContaining({ handRaised: false }),
					origin: MeetEventOrigin.PARTICIPANT
				})
			);
			expect(webhookSpy).toHaveBeenCalledTimes(2);
		});

		it('should keep the place in the queue when a raised hand is raised again', async () => {
			const alice = await joinSpeaker('Alice');
			const webhookSpy = spyOnHandWebhook();

			await updateParticipantHand(roomData.room.roomId, alice.identity, { raised: true }, alice.token);
			const { handRaiseDate } = await handOf(alice);

			const again = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ raised: true },
				alice.token
			);
			expect(again.status).toBe(200);
			expect((await handOf(alice)).handRaiseDate).toBe(handRaiseDate);
			expect(webhookSpy).toHaveBeenCalledTimes(1);
		});

		it('should raise a hand once when the same raise arrives twice at the same time', async () => {
			const alice = await joinSpeaker('Alice');
			const webhookSpy = spyOnHandWebhook();

			const responses = await Promise.all(
				[1, 2].map(() =>
					updateParticipantHand(roomData.room.roomId, alice.identity, { raised: true }, alice.token)
				)
			);
			expect(responses.map((response) => response.status)).toEqual([200, 200]);
			expect((await handOf(alice)).handRaised).toBe(true);
			expect(webhookSpy).toHaveBeenCalledTimes(1);
		});

		it("should let a moderator lower another participant's hand, attributed to the moderator", async () => {
			const alice = await joinSpeaker('Alice');
			const webhookSpy = spyOnHandWebhook();
			await updateParticipantHand(roomData.room.roomId, alice.identity, { raised: true }, alice.token);

			const response = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ raised: false },
				roomData.moderatorToken
			);
			expect(response.status).toBe(200);
			expect((await handOf(alice)).handRaised).toBe(false);
			expect(webhookSpy).toHaveBeenLastCalledWith(
				expect.objectContaining({
					participant: expect.objectContaining({ handRaised: false }),
					origin: MeetEventOrigin.MODERATOR
				})
			);
		});

		it("should fail with 403 when the caller lowers another participant's hand without participantHandLower", async () => {
			const alice = await joinSpeaker('Alice');
			const bob = await joinSpeaker('Bob');
			await updateParticipantHand(roomData.room.roomId, alice.identity, { raised: true }, alice.token);

			const response = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ raised: false },
				bob.token
			);
			expect(response.status).toBe(403);
			expect((await handOf(alice)).handRaised).toBe(true);
		});

		it("should reject raising another participant's hand", async () => {
			const alice = await joinSpeaker('Alice');

			const response = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ raised: true },
				roomData.moderatorToken
			);
			expect(response.status).toBe(409);
			expect(response.body.error).toBe('Participant Error');
			expect((await handOf(alice)).handRaised).toBe(false);
		});

		it('should reject a raise while the room has raising hands disabled', async () => {
			roomData = await setupSingleRoom(true, 'TEST_ROOM', { raiseHand: { enabled: false } });
			const alice = await joinSpeaker('Alice');

			const response = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ raised: true },
				alice.token
			);
			expect(response.status).toBe(403);
			expect(response.body.error).toBe('Hand Error');
		});

		it('should fail with 404 if the participant is not in the meeting', async () => {
			const response = await updateParticipantHand(
				roomData.room.roomId,
				'NON_EXISTENT_PARTICIPANT',
				{ raised: false },
				roomData.moderatorToken
			);
			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Participant Error');
		});

		it('should reject a body without a boolean raised', async () => {
			const alice = await joinSpeaker('Alice');

			const response = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ raised: 'yes' } as never,
				alice.token
			);
			expect(response.status).toBe(422);
		});

		it('should lower every raised hand as a moderator action', async () => {
			const alice = await joinSpeaker('Alice');
			const bob = await joinSpeaker('Bob');
			await updateParticipantHand(roomData.room.roomId, alice.identity, { raised: true }, alice.token);
			await updateParticipantHand(roomData.room.roomId, bob.identity, { raised: true }, bob.token);
			const webhookSpy = spyOnHandWebhook();

			const response = await lowerAllHands(roomData.room.roomId, { raised: false }, roomData.moderatorToken);
			expect(response.status).toBe(200);
			expect((await handOf(alice)).handRaised).toBe(false);
			expect((await handOf(bob)).handRaised).toBe(false);
			expect(webhookSpy).toHaveBeenCalledTimes(2);
			expect(webhookSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					participant: expect.objectContaining({ participantIdentity: alice.identity, handRaised: false }),
					origin: MeetEventOrigin.MODERATOR
				})
			);
		});

		it('should reject raising every hand', async () => {
			const response = await lowerAllHands(roomData.room.roomId, { raised: true }, roomData.moderatorToken);
			expect(response.status).toBe(422);
		});

		it('should fail with 403 when lowering every hand without participantHandLower', async () => {
			const response = await lowerAllHands(roomData.room.roomId, { raised: false }, roomData.speakerToken);
			expect(response.status).toBe(403);
		});
	});
});
