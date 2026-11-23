import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
	MeetRoomMember,
	MeetRoomMemberOptions,
	MeetRoomMemberRole,
	MeetRoomMemberUIBadge
} from '@openvidu-meet/typings';
import type { Express } from 'express';
import { ClaimGrants } from 'livekit-server-sdk';
import { jwtDecode } from 'jwt-decode';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import {
	errorRoomMemberNotFound,
	errorRoomMemberNotIdentifiedGuest,
	errorRoomNotFound
} from '../../../../src/models/error.model.js';
import { MeetRoomMemberModel } from '../../../../src/models/mongoose-schemas/room-member.schema.js';
import { expectMeetError, expectValidRoomMemberTokenResponse } from '../../../helpers/assertion-helpers.js';
import { disconnectFakeParticipants, joinFakeParticipant } from '../../../helpers/livekit-cli-helpers.js';
import {
	admitWaitingParticipant,
	askToJoin,
	createRoomMember,
	deleteAllRooms,
	deleteAllUsers,
	generateRoomMemberTokenRequest,
	getFullPath,
	getMeetingParticipant,
	getRoomMember,
	loginRootAdmin,
	regenerateRoomMemberAccessUrl,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { guestSecretOf, setupSingleRoom, setupTestUsersForRoom } from '../../../helpers/test-scenarios.js';
import { waitForMeetingToStart } from '../../../helpers/wait-helpers.js';
import { RoomData } from '../../../interfaces/scenarios.js';

describe('Regenerate Room Member Access URL API Tests', () => {
	let app: Express;
	let roomData: RoomData;
	let roomId: string;
	let ownerToken: string;
	let adminToken: string;

	const createGuest = async (
		baseRole = MeetRoomMemberRole.SPEAKER,
		targetRoomId = roomId,
		customPermissions?: MeetRoomMemberOptions['customPermissions']
	) => {
		const response = await createRoomMember(targetRoomId, { name: 'Linked Guest', baseRole, customPermissions });
		expect(response.status).toBe(201);
		return response.body as MeetRoomMember;
	};

	beforeAll(async () => {
		app = await startTestServer();
		roomData = await setupTestUsersForRoom(await setupSingleRoom());
		roomId = roomData.room.roomId;
		ownerToken = roomData.users!.roomManagerOwner.accessToken;
		adminToken = (await loginRootAdmin()).accessToken;
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllUsers();
	});

	it('should give the guest a new link of the current form and leave the other fields as they were', async () => {
		const guest = await createGuest(MeetRoomMemberRole.MODERATOR, roomId, { recordingDelete: true });

		const response = await regenerateRoomMemberAccessUrl(roomId, guest.memberId, ownerToken);

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({
			memberId: guest.memberId,
			roomId,
			name: guest.name,
			type: guest.type,
			baseRole: guest.baseRole,
			customPermissions: guest.customPermissions,
			membershipDate: guest.membershipDate
		});
		expect(response.body).not.toHaveProperty('effectivePermissions');
		expect(response.body.accessUrl).toMatch(new RegExp(`/room/${roomId}\\?secret=${guest.memberId}-[0-9a-f]{10}$`));
		expect(guestSecretOf(response.body)).not.toBe(guestSecretOf(guest));

		const stored = await getRoomMember(roomId, guest.memberId);
		expect(guestSecretOf(stored.body)).toBe(guestSecretOf(response.body));
		expect(stored.body.effectivePermissions).toEqual(guest.effectivePermissions);
	});

	it('should refuse the secret of the previous link and accept the one of the new link', async () => {
		const guest = await createGuest();
		const previousSecret = guestSecretOf(guest);

		const { body } = await regenerateRoomMemberAccessUrl(roomId, guest.memberId, ownerToken);

		expectMeetError(
			await generateRoomMemberTokenRequest(roomId, { secret: previousSecret }),
			errorRoomMemberNotFound(roomId, guest.memberId)
		);
		const response = await generateRoomMemberTokenRequest(roomId, { secret: guestSecretOf(body) });
		expectValidRoomMemberTokenResponse(response, {
			roomId,
			memberId: guest.memberId,
			badge: MeetRoomMemberUIBadge.OTHER,
			permissions: guest.effectivePermissions!
		});
	});

	it('should replace the link of a guest whose stored link carries the memberId alone', async () => {
		const guest = await createGuest();
		await MeetRoomMemberModel.updateOne(
			{ roomId, memberId: guest.memberId },
			{ accessUrl: `/room/${roomId}?secret=${guest.memberId}` }
		);

		const { body } = await regenerateRoomMemberAccessUrl(roomId, guest.memberId, ownerToken);

		expect(body.accessUrl).toMatch(new RegExp(`/room/${roomId}\\?secret=${guest.memberId}-[0-9a-f]{10}$`));
		expectMeetError(
			await generateRoomMemberTokenRequest(roomId, { secret: guest.memberId }),
			errorRoomMemberNotFound(roomId, guest.memberId)
		);
	});

	it('should keep the room member token and the session of a guest in the meeting', async () => {
		const guest = await createGuest(MeetRoomMemberRole.MODERATOR);
		const joined = await askToJoin(roomId, guestSecretOf(guest), 'Linked Guest');
		expect(joined.status).toBe(200);
		const { sub, metadata } = jwtDecode<ClaimGrants>(joined.body.token);
		await joinFakeParticipant(roomId, sub!, metadata);
		await waitForMeetingToStart(roomId);
		const token = `Bearer ${joined.body.token}`;

		const response = await regenerateRoomMemberAccessUrl(roomId, guest.memberId, ownerToken);

		expect(response.status).toBe(200);
		expect((await getMeetingParticipant(roomId, sub!, token)).status).toBe(200);
		const withToken = await request(app)
			.get(getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms/${roomId}/members/${guest.memberId}`))
			.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, token);
		expect(withToken.status).toBe(200);
	});

	it('should refuse a guest who waited in a locked room with the previous link when they are admitted', async () => {
		const lockedRoom = await setupSingleRoom(false, 'LOCKED_ROOM', undefined, { lock: { enabled: true } });
		const lockedRoomId = lockedRoom.room.roomId;
		const guest = await createGuest(MeetRoomMemberRole.SPEAKER, lockedRoomId);
		const previousSecret = guestSecretOf(guest);
		const knock = await askToJoin(lockedRoomId, previousSecret, 'Linked Guest');
		expect(knock.status).toBe(202);
		const { waitingTicket, participant } = knock.body;

		const { body } = await regenerateRoomMemberAccessUrl(lockedRoomId, guest.memberId, adminToken);
		expect((await admitWaitingParticipant(lockedRoomId, participant.participantIdentity)).status).toBe(200);

		expectMeetError(
			await askToJoin(lockedRoomId, previousSecret, 'Linked Guest', waitingTicket),
			errorRoomMemberNotFound(lockedRoomId, guest.memberId)
		);
		expect(guestSecretOf(body)).not.toBe(previousSecret);
	});

	it('should answer 409 for a user member and keep its accessUrl', async () => {
		const { member } = roomData.users!.roomMemberDetails;

		const response = await regenerateRoomMemberAccessUrl(roomId, member.memberId, ownerToken);

		expectMeetError(response, errorRoomMemberNotIdentifiedGuest(roomId, member.memberId));
		const stored = new URL((await getRoomMember(roomId, member.memberId)).body.accessUrl);
		const before = new URL(member.accessUrl);
		expect(stored.pathname + stored.search).toBe(before.pathname + before.search);
	});

	it('should answer 404 for a member that does not exist', async () => {
		const response = await regenerateRoomMemberAccessUrl(roomId, 'guest-nonexistent', ownerToken);

		expectMeetError(response, errorRoomMemberNotFound(roomId, 'guest-nonexistent'));
	});

	it('should answer 404 for a room that does not exist', async () => {
		const response = await regenerateRoomMemberAccessUrl('non-existing-room-id', 'guest-nonexistent', adminToken);

		expectMeetError(response, errorRoomNotFound('non-existing-room-id'));
	});
});
