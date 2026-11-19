import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MeetEventOrigin, MeetWebhookEventType } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { MeetRoomHelper } from '../../../../src/helpers/room.helper.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { WebhookDispatcherService } from '../../../../src/services/webhook-dispatcher.service.js';
import { errorHandNotOwn, errorInsufficientPermissions } from '../../../../src/models/error.model.js';
import { disconnectFakeParticipants, joinFakeParticipant } from '../../../helpers/livekit-cli-helpers.js';
import {
	createWebhook,
	deleteAllRooms,
	deleteAllWebhooks,
	endMeeting,
	generateRoomMemberToken,
	getFullPath,
	getMeetingParticipant,
	lowerAllHands,
	startTestServer,
	updateParticipantHand
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom, startWebhookServer, stopWebhookServer } from '../../../helpers/test-scenarios.js';
import { ReceivedWebhook, waitForWebhookEvent } from '../../../helpers/wait-helpers.js';
import { RoomData } from '../../../interfaces/scenarios.js';
import { expectMeetError, expectValidationError } from '../../../helpers/assertion-helpers.js';

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
	let app: Express;
	let roomData: RoomData;

	beforeAll(async () => {
		app = await startTestServer();
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
			const roomLookupSpy = jest.spyOn(container.get(LiveKitService), 'getRoom');

			const raise = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ handRaised: true },
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
				{ handRaised: false },
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
			expect(roomLookupSpy).not.toHaveBeenCalled();
		});

		it('should keep the place in the queue when a raised hand is raised again', async () => {
			const alice = await joinSpeaker('Alice');
			const webhookSpy = spyOnHandWebhook();

			await updateParticipantHand(roomData.room.roomId, alice.identity, { handRaised: true }, alice.token);
			const { handRaiseDate } = await handOf(alice);

			const again = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ handRaised: true },
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
					updateParticipantHand(roomData.room.roomId, alice.identity, { handRaised: true }, alice.token)
				)
			);
			expect(responses.map((response) => response.status)).toEqual([200, 200]);
			expect((await handOf(alice)).handRaised).toBe(true);
			expect(webhookSpy).toHaveBeenCalledTimes(1);
		});

		it("should let a moderator lower another participant's hand, attributed to the moderator", async () => {
			const alice = await joinSpeaker('Alice');
			const webhookSpy = spyOnHandWebhook();
			await updateParticipantHand(roomData.room.roomId, alice.identity, { handRaised: true }, alice.token);

			const response = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ handRaised: false },
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

		it("should fail with 403 when the caller lowers another participant's hand without participantLowerHand", async () => {
			const alice = await joinSpeaker('Alice');
			const bob = await joinSpeaker('Bob');
			await updateParticipantHand(roomData.room.roomId, alice.identity, { handRaised: true }, alice.token);

			const response = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ handRaised: false },
				bob.token
			);
			expectMeetError(response, errorInsufficientPermissions());
			expect((await handOf(alice)).handRaised).toBe(true);
		});

		it("should reject raising another participant's hand", async () => {
			const alice = await joinSpeaker('Alice');

			const response = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ handRaised: true },
				roomData.moderatorToken
			);
			expect(response.status).toBe(409);
			expect(response.body.error).toBe('Participant Error');
			expect((await handOf(alice)).handRaised).toBe(false);
		});

		it("should reject with 409 a participant without participantLowerHand raising another participant's hand", async () => {
			const alice = await joinSpeaker('Alice');
			const bob = await joinSpeaker('Bob');

			const response = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ handRaised: true },
				bob.token
			);
			expectMeetError(response, errorHandNotOwn(alice.identity, roomData.room.roomId));
			expect((await handOf(alice)).handRaised).toBe(false);
		});

		it("should reject with 409 an API key raising a participant's hand", async () => {
			const alice = await joinSpeaker('Alice');

			const response = await request(app)
				.put(
					getFullPath(
						`${INTERNAL_CONFIG.API_BASE_PATH_V1}/meetings/${roomData.room.roomId}/participants/${alice.identity}/hand`
					)
				)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send({ handRaised: true });
			expectMeetError(response, errorHandNotOwn(alice.identity, roomData.room.roomId));
			expect((await handOf(alice)).handRaised).toBe(false);
		});

		it('should drop the hand of a participant who leaves without a hand webhook, and let a rejoin start lowered', async () => {
			const alice = await joinSpeaker('Alice');
			const { roomId } = roomData.room;
			const received: ReceivedWebhook[] = [];
			await deleteAllWebhooks();
			await createWebhook({
				url: await startWebhookServer((req) =>
					received.push({ headers: req.headers, body: req.body, rawBody: req.rawBody })
				),
				events: [MeetWebhookEventType.PARTICIPANT_HAND_CHANGED, MeetWebhookEventType.PARTICIPANT_LEFT],
				roomId
			});

			try {
				await updateParticipantHand(roomId, alice.identity, { handRaised: true }, alice.token);
				await waitForWebhookEvent(received, MeetWebhookEventType.PARTICIPANT_HAND_CHANGED, { roomId });

				await container.get(LiveKitService).deleteParticipant(roomId, alice.identity);
				await waitForWebhookEvent(received, MeetWebhookEventType.PARTICIPANT_LEFT, { roomId });

				expect(
					received.filter(({ body }) => body.event === MeetWebhookEventType.PARTICIPANT_HAND_CHANGED)
				).toHaveLength(1);
			} finally {
				await deleteAllWebhooks();
				await stopWebhookServer();
			}

			await joinFakeParticipant(roomId, alice.identity);
			expect((await handOf(alice)).handRaised).toBe(false);
		});

		it("should fail with 403 when a token of another room raises a participant's hand", async () => {
			const alice = await joinSpeaker('Alice');
			const otherRoom = await setupSingleRoom(false, 'OTHER_ROOM');

			const response = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ handRaised: true },
				otherRoom.moderatorToken
			);
			expectMeetError(response, errorInsufficientPermissions());
			expect((await handOf(alice)).handRaised).toBe(false);
		});

		it("should fail with 404 when another participant's hand is raised in a room without a meeting", async () => {
			const emptyRoom = await setupSingleRoom(false, 'EMPTY_ROOM');

			const response = await updateParticipantHand(
				emptyRoom.room.roomId,
				'SOMEONE',
				{ handRaised: true },
				emptyRoom.moderatorToken
			);
			expect(response.status).toBe(404);
		});

		it('should reject a raise while the room has raising hands disabled', async () => {
			roomData = await setupSingleRoom(true, 'TEST_ROOM', { raiseHand: { enabled: false } });
			const alice = await joinSpeaker('Alice');

			const response = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ handRaised: true },
				alice.token
			);
			expect(response.status).toBe(403);
			expect(response.body.error).toBe('Hand Error');
		});

		it('should fail with the 404 of the meeting, not of the participant, once the meeting has ended', async () => {
			const alice = await joinSpeaker('Alice');
			await endMeeting(roomData.room.roomId, roomData.moderatorToken);

			const response = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ handRaised: true },
				alice.token
			);
			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Meeting Error');
		});

		it('should fail with 404 if the participant is not in the meeting', async () => {
			const response = await updateParticipantHand(
				roomData.room.roomId,
				'NON_EXISTENT_PARTICIPANT',
				{ handRaised: false },
				roomData.moderatorToken
			);
			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Participant Error');
		});

		it('should reject a body without a boolean handRaised', async () => {
			const alice = await joinSpeaker('Alice');

			const response = await updateParticipantHand(
				roomData.room.roomId,
				alice.identity,
				{ handRaised: 'yes' } as never,
				alice.token
			);
			expectValidationError(response, 'handRaised', 'Expected boolean, received string');
		});

		it('should lower every raised hand as a moderator action', async () => {
			const alice = await joinSpeaker('Alice');
			const bob = await joinSpeaker('Bob');
			await updateParticipantHand(roomData.room.roomId, alice.identity, { handRaised: true }, alice.token);
			await updateParticipantHand(roomData.room.roomId, bob.identity, { handRaised: true }, bob.token);
			const webhookSpy = spyOnHandWebhook();

			const response = await lowerAllHands(roomData.room.roomId, { handRaised: false }, roomData.moderatorToken);
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
			const response = await lowerAllHands(roomData.room.roomId, { handRaised: true }, roomData.moderatorToken);
			expectValidationError(response, 'handRaised', "Invalid enum value. Expected 'false', received 'true'");
		});

		it('should fail with 403 when lowering every hand without participantLowerHand', async () => {
			const response = await lowerAllHands(roomData.room.roomId, { handRaised: false }, roomData.speakerToken);
			expectMeetError(response, errorInsufficientPermissions());
		});
	});
});
