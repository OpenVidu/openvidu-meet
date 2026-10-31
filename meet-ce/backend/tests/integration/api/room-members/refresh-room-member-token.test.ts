import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import {
	MeetParticipantModerationAction,
	MeetRoomMemberRole,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberUIBadge,
	MeetRoomRoles,
	MeetUserRole
} from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { TokenService } from '../../../../src/services/token.service.js';
import { expectValidRoomMemberTokenResponse } from '../../../helpers/assertion-helpers.js';
import {
	disconnectFakeParticipants,
	joinFakeParticipant,
	updateParticipantMetadata
} from '../../../helpers/livekit-cli-helpers.js';
import {
	deleteAllRooms,
	deleteAllUsers,
	endMeeting,
	generateRoomMemberToken,
	generateRoomMemberTokenRequest,
	kickParticipant,
	loginUser,
	refreshRoomMemberTokenRequest,
	sleep,
	startTestServer,
	updateParticipant,
	updateRoomMember,
	updateUserRole
} from '../../../helpers/request-helpers.js';
import { setupRoomMember, setupSingleRoom, setupUser } from '../../../helpers/test-scenarios.js';
import { RoomData } from '../../../interfaces/scenarios.js';

describe('Room Members API Tests', () => {
	let roomData: RoomData;
	let roomId: string;
	let roomRoles: MeetRoomRoles;
	let tokenService: TokenService;

	const getRawToken = (token: string) => token.replace(/^Bearer\s+/i, '');

	const claimsOf = (token: string) => {
		const claims = tokenService.getClaimsIgnoringExpiration(getRawToken(token));
		return { ...claims, metadata: JSON.parse(claims.metadata || '{}') as MeetRoomMemberTokenMetadata };
	};

	/** Joins the meeting with a join token: LiveKit takes the participant's metadata from it. */
	const joinWith = async (token: string): Promise<string> => {
		const { sub: participantIdentity, metadata } = claimsOf(token);
		await joinFakeParticipant(roomId, participantIdentity!);
		await updateParticipantMetadata(roomId, participantIdentity!, metadata);
		return participantIdentity!;
	};

	const uniqueUserId = (prefix: string) => `${prefix}_${String(Date.now()).slice(-6)}`;

	beforeAll(async () => {
		await startTestServer();
		tokenService = container.get(TokenService);
		roomData = await setupSingleRoom();
		roomId = roomData.room.roomId;
		roomRoles = roomData.room.roles;
	});

	afterEach(async () => {
		await endMeeting(roomId, roomData.moderatorToken);
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllUsers();
	});

	describe('Refresh Room Member Token Tests', () => {
		it('should refresh room member token for joining meeting', async () => {
			// Generate a room member token for joining the meeting
			const previousToken = await generateRoomMemberToken(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName: 'Test Participant'
			});

			// Extract participant identity and metadata from the token
			const claims = tokenService.getClaimsIgnoringExpiration(getRawToken(previousToken));
			const participantIdentity = claims.sub;
			expect(participantIdentity).toBeDefined();
			const metadata = JSON.parse(claims.metadata || '{}') as MeetRoomMemberTokenMetadata;

			// Simulate participant joining the meeting
			await joinFakeParticipant(roomId, participantIdentity!);
			await updateParticipantMetadata(roomId, participantIdentity!, metadata);

			const response = await refreshRoomMemberTokenRequest(roomId, previousToken);
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				badge: MeetRoomMemberUIBadge.MODERATOR,
				permissions: roomRoles.moderator.permissions,
				joinMeeting: true,
				participantName: 'Test Participant',
				participantIdentityPrefix: 'test_participant'
			});
		});

		it('should preserve the app-provided correlation fields across a refresh', async () => {
			// The refresh rebuilds the token metadata from the live LiveKit participant
			// (buildTokenMetadataFromParticipant re-lists every field), so a field missing from that
			// re-list would silently disappear from the participant here.
			const previousToken = await generateRoomMemberToken(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName: 'Correlated Refresher',
				participantExternalId: 'crm-user_42',
				participantMetadata: '{"department": "cardiology"}'
			});

			const claims = tokenService.getClaimsIgnoringExpiration(getRawToken(previousToken));
			const participantIdentity = claims.sub;
			expect(participantIdentity).toBeDefined();
			const metadata = JSON.parse(claims.metadata || '{}') as MeetRoomMemberTokenMetadata;

			await joinFakeParticipant(roomId, participantIdentity!);
			await updateParticipantMetadata(roomId, participantIdentity!, metadata);

			const response = await refreshRoomMemberTokenRequest(roomId, previousToken);
			expect(response.status).toBe(200);

			const refreshedClaims = tokenService.getClaimsIgnoringExpiration(
				getRawToken(response.body.token as string)
			);
			const refreshedMetadata = JSON.parse(refreshedClaims.metadata || '{}') as MeetRoomMemberTokenMetadata;
			expect(refreshedMetadata.externalId).toBe('crm-user_42');
			expect(refreshedMetadata.metadata).toBe('{"department": "cardiology"}');
		});

		it('should grant LiveKit canPublishData to a refreshed token only when its room has chat enabled', async () => {
			const roomWithoutChat = await setupSingleRoom(false, 'NO_CHAT_ROOM', { chat: { enabled: false } });
			const refreshModeratorOf = async ({ room, moderatorSecret }: RoomData) => {
				const previousToken = await generateRoomMemberToken(room.roomId, {
					secret: moderatorSecret,
					joinMeeting: true,
					participantName: 'Chat Refresher'
				});
				const { sub: participantIdentity, metadata } = claimsOf(previousToken);
				await joinFakeParticipant(room.roomId, participantIdentity!);
				await updateParticipantMetadata(room.roomId, participantIdentity!, metadata);

				const response = await refreshRoomMemberTokenRequest(room.roomId, previousToken);
				expect(response.status).toBe(200);
				return claimsOf(response.body.token as string).video?.canPublishData;
			};

			expect(await refreshModeratorOf(roomData)).toBe(true);
			expect(await refreshModeratorOf(roomWithoutChat)).toBe(false);
		});

		it('should fail when using valid room member token for joining meeting but participant has not joined', async () => {
			// Generate a room member token for joining the meeting
			const previousToken = await generateRoomMemberToken(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: true,
				participantName: 'Test Participant'
			});

			// Attempt to refresh the token without the participant joining the meeting
			const response = await refreshRoomMemberTokenRequest(roomId, previousToken);
			expect(response.status).toBe(404);
		});

		it('should succeed when previous token is expired but still within clock tolerance', async () => {
			const initialTokenTtl = MEET_ENV.ROOM_MEMBER_TOKEN_EXPIRATION;
			const initialClockTolerance = INTERNAL_CONFIG.REFRESH_CLOCK_TOLERANCE_SECONDS;

			try {
				// Set token TTL to 1 second and clock tolerance to 5 seconds for testing
				MEET_ENV.ROOM_MEMBER_TOKEN_EXPIRATION = '1s';
				INTERNAL_CONFIG.REFRESH_CLOCK_TOLERANCE_SECONDS = 5;

				const previousToken = await generateRoomMemberToken(roomId, {
					secret: roomData.moderatorSecret,
					joinMeeting: true,
					participantName: 'Test Participant'
				});

				const claims = tokenService.getClaimsIgnoringExpiration(getRawToken(previousToken));
				const participantIdentity = claims.sub;
				expect(participantIdentity).toBeDefined();
				const metadata = JSON.parse(claims.metadata || '{}') as MeetRoomMemberTokenMetadata;

				await joinFakeParticipant(roomId, participantIdentity!);
				await updateParticipantMetadata(roomId, participantIdentity!, metadata);

				// Wait for token expiry (1s) but keep it within tolerance (5s).
				await sleep('2s');

				const response = await refreshRoomMemberTokenRequest(roomId, previousToken);
				expect(response.status).toBe(200);
			} finally {
				// Restore original config values after the test
				MEET_ENV.ROOM_MEMBER_TOKEN_EXPIRATION = initialTokenTtl;
				INTERNAL_CONFIG.REFRESH_CLOCK_TOLERANCE_SECONDS = initialClockTolerance;
			}
		});

		it('should fail when previous token is totally expired', async () => {
			const initialTokenTtl = MEET_ENV.ROOM_MEMBER_TOKEN_EXPIRATION;
			const initialClockTolerance = INTERNAL_CONFIG.REFRESH_CLOCK_TOLERANCE_SECONDS;

			try {
				// Set token TTL to 1 second and clock tolerance to 1 second for testing
				MEET_ENV.ROOM_MEMBER_TOKEN_EXPIRATION = '1s';
				INTERNAL_CONFIG.REFRESH_CLOCK_TOLERANCE_SECONDS = 1;

				const previousToken = await generateRoomMemberToken(roomId, {
					secret: roomData.moderatorSecret,
					joinMeeting: true,
					participantName: 'Test Participant'
				});

				const claims = tokenService.getClaimsIgnoringExpiration(getRawToken(previousToken));
				const participantIdentity = claims.sub;
				expect(participantIdentity).toBeDefined();
				const metadata = JSON.parse(claims.metadata || '{}') as MeetRoomMemberTokenMetadata;

				await joinFakeParticipant(roomId, participantIdentity!);
				await updateParticipantMetadata(roomId, participantIdentity!, metadata);

				// Wait long enough to exceed both token TTL and tolerance.
				await sleep('3s');

				const response = await refreshRoomMemberTokenRequest(roomId, previousToken);
				expect(response.status).toBe(401);
			} finally {
				// Restore original config values after the test
				MEET_ENV.ROOM_MEMBER_TOKEN_EXPIRATION = initialTokenTtl;
				INTERNAL_CONFIG.REFRESH_CLOCK_TOLERANCE_SECONDS = initialClockTolerance;
			}
		});

		it('should refresh token using promoted moderator permissions and badge from participant metadata', async () => {
			// Generate a room member token for joining the meeting with speaker role
			const previousToken = await generateRoomMemberToken(roomId, {
				secret: roomData.speakerSecret,
				joinMeeting: true,
				participantName: 'Test Participant'
			});

			// Extract participant identity and metadata from the token
			const claims = tokenService.getClaimsIgnoringExpiration(getRawToken(previousToken));
			const participantIdentity = claims.sub;
			expect(participantIdentity).toBeDefined();
			const metadata = JSON.parse(claims.metadata || '{}') as MeetRoomMemberTokenMetadata;

			// Simulate participant joining the meeting
			await joinFakeParticipant(roomId, participantIdentity!);
			await updateParticipantMetadata(roomId, participantIdentity!, metadata);

			// Promote participant to moderator
			await updateParticipant(
				roomId,
				participantIdentity!,
				MeetParticipantModerationAction.UPGRADE,
				roomData.moderatorToken
			);

			// Refresh the token and expect it to have moderator permissions and badge based on the updated participant metadata
			const response = await refreshRoomMemberTokenRequest(roomId, previousToken);
			expectValidRoomMemberTokenResponse(response, {
				roomId,
				badge: MeetRoomMemberUIBadge.MODERATOR,
				permissions: roomRoles.moderator.permissions,
				isPromotedModerator: true,
				joinMeeting: true,
				participantName: 'Test Participant',
				participantIdentityPrefix: 'test_participant'
			});
		});
	});

	/**
	 * A change made while the participant stays in the meeting invalidates the join token they hold. Renewing it
	 * through the refresh must be refused like any other use of it, and the participant gets their current
	 * permissions by requesting a join token again with the credentials they entered with.
	 */
	describe('Refresh after a change that invalidates the token', () => {
		it('should refuse a token issued before the member was denied a permission', async () => {
			const { user, accessToken } = await setupUser({
				userId: uniqueUserId('rf_kick'),
				name: 'Kick Member',
				password: 'kick_member_pass',
				role: MeetUserRole.ROOM_MEMBER
			});
			const { member } = await setupRoomMember(
				roomId,
				{ userId: user.userId, baseRole: MeetRoomMemberRole.MODERATOR },
				accessToken
			);
			const previousToken = await generateRoomMemberToken(roomId, { joinMeeting: true }, accessToken);
			const participantIdentity = await joinWith(previousToken);

			const updateResponse = await updateRoomMember(roomId, member.memberId, {
				customPermissions: { participantKick: false }
			});
			expect(updateResponse.status).toBe(200);

			const refreshResponse = await refreshRoomMemberTokenRequest(roomId, previousToken);
			expect(refreshResponse.status).toBe(401);
			expect(refreshResponse.body.message).toBe('Invalid token');

			const regenerated = await generateRoomMemberToken(
				roomId,
				{ joinMeeting: true },
				accessToken,
				previousToken
			);
			expect(claimsOf(regenerated).sub).toBe(participantIdentity);
			expect(claimsOf(regenerated).metadata.permissions.participantKick).toBe(false);
		});

		it('should refuse a token issued before an identified guest was given a lower base role', async () => {
			const { member } = await setupRoomMember(roomId, {
				name: 'Guest Moderator',
				baseRole: MeetRoomMemberRole.MODERATOR
			});
			const previousToken = await generateRoomMemberToken(roomId, { secret: member.memberId, joinMeeting: true });
			const participantIdentity = await joinWith(previousToken);

			const updateResponse = await updateRoomMember(roomId, member.memberId, {
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			expect(updateResponse.status).toBe(200);

			const refreshResponse = await refreshRoomMemberTokenRequest(roomId, previousToken);
			expect(refreshResponse.status).toBe(401);
			expect(refreshResponse.body.message).toBe('Invalid token');

			const regenerated = await generateRoomMemberToken(
				roomId,
				{ secret: member.memberId, joinMeeting: true },
				undefined,
				previousToken
			);
			expect(claimsOf(regenerated).sub).toBe(participantIdentity);
			expect(claimsOf(regenerated).metadata.permissions.meetingEnd).toBe(false);
			expect(claimsOf(regenerated).metadata.badge).toBe(MeetRoomMemberUIBadge.OTHER);
		});

		it('should refuse a token issued before an admin outside the room became a room manager', async () => {
			const { user, accessToken, password } = await setupUser({
				userId: uniqueUserId('rf_adm'),
				name: 'Former Admin',
				password: 'former_admin_pass',
				role: MeetUserRole.ADMIN
			});
			const previousToken = await generateRoomMemberToken(roomId, { joinMeeting: true }, accessToken);
			await joinWith(previousToken);

			const roleResponse = await updateUserRole(user.userId, MeetUserRole.ROOM_MANAGER);
			expect(roleResponse.status).toBe(200);

			const refreshResponse = await refreshRoomMemberTokenRequest(roomId, previousToken);
			expect(refreshResponse.status).toBe(401);
			expect(refreshResponse.body.message).toBe('Invalid token');

			const { accessToken: currentAccessToken } = await loginUser(user.userId, password);
			const regenerateResponse = await generateRoomMemberTokenRequest(
				roomId,
				{ joinMeeting: true },
				currentAccessToken,
				previousToken
			);
			expect(regenerateResponse.status).toBe(403);
		});

		// The refresh reads the participant after the demotion, so it can only turn the earlier token into
		// one with the restored permissions. Every other endpoint keeps refusing that token.
		it('should renew a token issued before a demotion into one with the restored permissions', async () => {
			const previousToken = await generateRoomMemberToken(roomId, {
				secret: roomData.speakerSecret,
				joinMeeting: true,
				participantName: 'Demoted Speaker'
			});
			const participantIdentity = await joinWith(previousToken);

			await updateParticipant(
				roomId,
				participantIdentity,
				MeetParticipantModerationAction.UPGRADE,
				roomData.moderatorToken
			);
			const promotedResponse = await refreshRoomMemberTokenRequest(roomId, previousToken);
			expect(promotedResponse.status).toBe(200);
			const promotedToken = `Bearer ${promotedResponse.body.token}`;

			await updateParticipant(
				roomId,
				participantIdentity,
				MeetParticipantModerationAction.DOWNGRADE,
				roomData.moderatorToken
			);

			const demotedResponse = await refreshRoomMemberTokenRequest(roomId, promotedToken);
			expectValidRoomMemberTokenResponse(demotedResponse, {
				roomId,
				badge: MeetRoomMemberUIBadge.OTHER,
				permissions: roomRoles.speaker.permissions,
				joinMeeting: true,
				participantName: 'Demoted Speaker',
				participantIdentityPrefix: 'demoted_speaker'
			});

			const kickResponse = await kickParticipant(roomId, participantIdentity, promotedToken);
			expect(kickResponse.status).toBe(401);
		});
	});
});
