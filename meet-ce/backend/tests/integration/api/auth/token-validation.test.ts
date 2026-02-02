import { beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole, MeetUserRole } from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import {
	createUser,
	deleteAllRooms,
	deleteAllUsers,
	deleteRoom,
	deleteRoomMember,
	deleteUser,
	loginUser,
	resetUserPassword,
	sleep,
	startTestServer,
	updateRoomAnonymousConfig,
	updateRoomConfig,
	updateRoomMember,
	updateRoomRoles
} from '../../../helpers/request-helpers.js';
import { setupRoomMember, setupSingleRoom, setupTestUsers, setupUser } from '../../../helpers/test-scenarios.js';
import { TestUsers, UserData } from '../../../interfaces/scenarios.js';

const USERS_PATH = `${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/users`;
const ROOMS_PATH = `${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`;

describe('Token Validation Tests', () => {
	let app: Express;
	let testUsers: TestUsers;

	let roomId: string;
	let roomMemberToken: string;

	beforeAll(async () => {
		app = await startTestServer();
		testUsers = await setupTestUsers();

		// Setup a room with a member token
		const roomData = await setupSingleRoom();
		roomId = roomData.room.roomId;
		roomMemberToken = roomData.moderatorToken;
	});

	afterAll(async () => {
		await deleteAllRooms();
		await deleteAllUsers();
	});

	describe('Access Token Tests', () => {
		it('should succeed when providing valid access token', async () => {
			const response = await request(app)
				.get(`${USERS_PATH}/me`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
			expect(response.status).toBe(200);
		});

		it('should succeed when providing valid access token through query param without bearer prefix', async () => {
			const accessTokenQuery = testUsers.user.accessToken.replace('Bearer ', '');
			const response = await request(app).get(`${USERS_PATH}/me`).query({ accessToken: accessTokenQuery });
			expect(response.status).toBe(200);
		});

		it('should succeed when admin accesses admin-only endpoint', async () => {
			const response = await request(app)
				.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/api-keys`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken);
			expect(response.status).toBe(200);
		});

		it('should fail when access token is missing', async () => {
			const response = await request(app).get(`${USERS_PATH}/me`);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Unauthorized');
		});

		it('should fail when access token is invalid', async () => {
			const response = await request(app)
				.get(`${USERS_PATH}/me`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, 'Bearer invalidtoken');
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});

		it('should fail when access token is expired', async () => {
			// Set short access token expiration
			const initialTokenExpiration = INTERNAL_CONFIG.ACCESS_TOKEN_EXPIRATION;
			INTERNAL_CONFIG.ACCESS_TOKEN_EXPIRATION = '1s';

			// Create a user and get their access token
			const userData = await setupUser({
				userId: `user_${Date.now()}`,
				name: 'User',
				password: 'password123',
				role: MeetUserRole.USER
			});

			await sleep('2s'); // Ensure the token is expired

			// Restore original expiration after setup
			INTERNAL_CONFIG.ACCESS_TOKEN_EXPIRATION = initialTokenExpiration;

			const response = await request(app)
				.get(`${USERS_PATH}/me`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, userData.accessToken);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});

		it('should fail when using room member token instead of access token', async () => {
			const response = await request(app)
				.get(`${USERS_PATH}/me`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, roomMemberToken);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});

		it('should fail when using refresh token instead of access token', async () => {
			const response = await request(app)
				.get(`${USERS_PATH}/me`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.refreshToken);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
		});

		it('should fail when token subject (user) does not exist', async () => {
			// Create a user and get their access token
			const userData = await setupUser({
				userId: `user_${Date.now()}`,
				name: 'User',
				password: 'password123',
				role: MeetUserRole.USER
			});

			// Delete the user to invalidate the token subject
			await deleteUser(userData.user.userId);

			// Attempt to use the token
			const response = await request(app)
				.get(`${USERS_PATH}/me`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, userData.accessToken);
			expect(response.status).toBe(403);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token subject');
		});

		it('should fail when USER tries to access ADMIN-only endpoint', async () => {
			const response = await request(app)
				.get(`${INTERNAL_CONFIG.INTERNAL_API_BASE_PATH_V1}/api-keys`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
			expect(response.status).toBe(403);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Insufficient permissions');
		});

		it('should fail when ROOM_MEMBER tries to access ADMIN and USER endpoint', async () => {
			const response = await request(app)
				.get(USERS_PATH)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.roomMember.accessToken);
			expect(response.status).toBe(403);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Insufficient permissions');
		});

		describe('Password Change Required Tests', () => {
			const resetPassword = 'NewPassword123';
			let userData: UserData;

			beforeAll(async () => {
				// Create a user and get their access token
				userData = await setupUser({
					userId: `user_${Date.now()}`,
					name: 'User',
					password: 'password123',
					role: MeetUserRole.USER
				});

				// Reset user password to force password change
				await resetUserPassword(userData.user.userId, resetPassword);
			});

			it('should succeed when accessing /me endpoint with mustChangePassword', async () => {
				const response = await request(app)
					.get(`${USERS_PATH}/me`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, userData.accessToken);
				expect(response.status).toBe(200);
			});

			it('should succeed when accessing /change-password endpoint with mustChangePassword', async () => {
				const response = await request(app)
					.post(`${USERS_PATH}/change-password`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, userData.accessToken)
					.send({
						currentPassword: resetPassword,
						newPassword: userData.password
					});
				expect(response.status).toBe(200);

				// Reset user password again for futher tests
				await resetUserPassword(userData.user.userId, resetPassword);
			});

			it('should fail when accessing other endpoints with mustChangePassword', async () => {
				// Try to create a room (requires USER role which this user has, but password change blocks it)
				const response = await request(app)
					.post(ROOMS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, userData.accessToken)
					.send({});
				expect(response.status).toBe(403);
				expect(response.body).toHaveProperty('message');
				expect(response.body.message).toContain('Password change required');
			});
		});

		describe('Temporary Access Token Tests', () => {
			let userId: string;
			let accessTokenTmp: string;

			beforeAll(async () => {
				// Create a user (when created, this user is set to require password change)
				const response = await createUser({
					userId: 'temp_user',
					name: 'Temp User',
					password: 'InitialPassword1!',
					role: MeetUserRole.USER
				});
				userId = response.body.userId;

				// Login to get temporary access token
				({ accessToken: accessTokenTmp } = await loginUser(userId, 'InitialPassword1!'));
			});

			it('should succeed when accessing /me endpoint with temporary token', async () => {
				const response = await request(app)
					.get(`${USERS_PATH}/me`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessTokenTmp);
				expect(response.status).toBe(200);
			});

			it('should succeed when accessing /change-password endpoint with temporary token', async () => {
				const response = await request(app)
					.post(`${USERS_PATH}/change-password`)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessTokenTmp)
					.send({
						currentPassword: 'InitialPassword1!',
						newPassword: 'FinalPassword123!'
					});
				expect(response.status).toBe(200);
			});

			it('should fail when accessing other endpoints with temporary token', async () => {
				const response = await request(app)
					.post(ROOMS_PATH)
					.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, accessTokenTmp)
					.send({});
				expect(response.status).toBe(403);
				expect(response.body).toHaveProperty('message');
				expect(response.body.message).toContain('Password change required');
			});
		});
	});

	describe('Room Member Token Tests', () => {
		it('should succeed when providing valid room member token', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMemberToken);
			expect(response.status).toBe(200);
		});

		it('should succeed when providing valid room member token through query param without bearer prefix', async () => {
			const roomMemberTokenQuery = roomMemberToken.replace('Bearer ', '');
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}`)
				.query({ roomMemberToken: roomMemberTokenQuery });
			expect(response.status).toBe(200);
		});

		it('should fail when room member token is missing', async () => {
			const response = await request(app).get(`${ROOMS_PATH}/${roomId}`);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Unauthorized');
		});

		it('should fail when room member token is invalid', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, 'Bearer invalidtoken');
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});

		it('should fail when room member token is expired', async () => {
			// Set short room member token expiration
			const initialTokenExpiration = INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_EXPIRATION;
			INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_EXPIRATION = '1s';

			const roomData = await setupSingleRoom();
			await sleep('2s'); // Ensure the token is expired

			// Restore original expiration after setup
			INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_EXPIRATION = initialTokenExpiration;

			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});

		it('should fail when using access token instead of room member token', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, testUsers.user.accessToken);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});

		it('should succeed when both room member token and user access token are valid', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMemberToken)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.user.accessToken);
			expect(response.status).toBe(200);
		});

		it('should succeed with room member token even when access token is invalid', async () => {
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMemberToken)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, 'Bearer invalidtoken');
			expect(response.status).toBe(200);
		});

		it('should fail when room member token is expired, even if user access token is valid', async () => {
			// Set short room member token expiration
			const initialTokenExpiration = INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_EXPIRATION;
			INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_EXPIRATION = '1s';

			const roomData = await setupSingleRoom();
			await sleep('2s'); // Ensure the token is expired

			// Restore original expiration after setup
			INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_EXPIRATION = initialTokenExpiration;

			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ACCESS_TOKEN_HEADER, testUsers.admin.accessToken)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});

		it('should fail when room member permissions are updated after token issuance', async () => {
			// Create a room with an external member
			const roomData = await setupSingleRoom();
			const roomMember = await setupRoomMember(roomData.room.roomId, {
				name: 'External Member',
				baseRole: MeetRoomMemberRole.MODERATOR
			});

			// Verify the token works initially
			const initialResponse = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(initialResponse.status).toBe(200);

			// Update the room member's permissions
			await sleep('100ms'); // Small delay to ensure timestamp difference
			await updateRoomMember(roomData.room.roomId, roomMember.member.memberId, {
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			// The original token should now be invalid
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});

		it('should fail when room member is deleted after token issuance', async () => {
			// Create a room with an external member
			const roomData = await setupSingleRoom();
			const roomMember = await setupRoomMember(roomData.room.roomId, {
				name: 'External Member',
				baseRole: MeetRoomMemberRole.MODERATOR
			});

			// Verify the token works initially
			const initialResponse = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(initialResponse.status).toBe(200);

			// Delete the room member
			await deleteRoomMember(roomData.room.roomId, roomMember.member.memberId);

			// The original token should now be invalid
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});

		it('should fail when room roles permissions are updated after room member token issuance', async () => {
			// Create a room with an external member
			const roomData = await setupSingleRoom();
			const roomMember = await setupRoomMember(roomData.room.roomId, {
				name: 'External Member',
				baseRole: MeetRoomMemberRole.MODERATOR
			});

			// Verify the token works initially
			const initialResponse = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(initialResponse.status).toBe(200);

			// Update the room roles' permissions
			await sleep('100ms'); // Small delay to ensure timestamp difference
			await updateRoomRoles(roomData.room.roomId, {
				moderator: {
					permissions: {
						canMakeModerator: false
					}
				}
			});

			// The original token should now be invalid
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});

		it('should fail when room roles permissions are updated after anonymous room member token issuance', async () => {
			// Create a room and generate an anonymous room member token
			const roomData = await setupSingleRoom();

			// Verify the token works initially
			const initialResponse = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(initialResponse.status).toBe(200);

			// Update the room's roles configuration
			await sleep('100ms'); // Small delay to ensure timestamp difference
			await updateRoomRoles(roomData.room.roomId, {
				moderator: {
					permissions: {
						canMakeModerator: false
					}
				}
			});

			// The original token should now be invalid
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});

		it('should succeed when room anonymous config is updated after room member token issuance', async () => {
			// Create a room with an external member
			const roomData = await setupSingleRoom();
			const roomMember = await setupRoomMember(roomData.room.roomId, {
				name: 'External Member',
				baseRole: MeetRoomMemberRole.MODERATOR
			});

			// Verify the token works initially
			const initialResponse = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(initialResponse.status).toBe(200);

			// Update the room anonymous configuration
			await sleep('100ms'); // Small delay to ensure timestamp difference
			await updateRoomAnonymousConfig(roomData.room.roomId, {
				moderator: {
					enabled: false
				}
			});

			// The original token should still be valid
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(response.status).toBe(200);
		});

		it('should fail when room anonymous config is updated after anonymous room member token issuance', async () => {
			// Create a room and generate an anonymous room member token
			const roomData = await setupSingleRoom();

			// Verify the token works initially
			const initialResponse = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(initialResponse.status).toBe(200);

			// Update the room's anonymous configuration
			await sleep('100ms'); // Small delay to ensure timestamp difference
			await updateRoomAnonymousConfig(roomData.room.roomId, {
				moderator: {
					enabled: false
				}
			});

			// The original token should now be invalid
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});

		it('should succeed when room config is updated but permissions/roles remain unchanged', async () => {
			// Create a room and generate an anonymous room member token
			const roomData = await setupSingleRoom();

			// Update room config (not roles/permissions/anonymous)
			await sleep('100ms');
			await updateRoomConfig(roomData.room.roomId, {
				chat: { enabled: false }
			});

			// The token should still be valid since permissions weren't changed
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(response.status).toBe(200);
		});

		it('should fail when room is deleted after room member token issuance', async () => {
			// Create a room with an external member
			const roomData = await setupSingleRoom();
			const roomMember = await setupRoomMember(roomData.room.roomId, {
				name: 'External Member',
				baseRole: MeetRoomMemberRole.MODERATOR
			});

			// Verify the token works initially
			const initialResponse = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(initialResponse.status).toBe(200);

			// Delete the room
			await deleteRoom(roomData.room.roomId);

			// The original token should now be invalid
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomMember.memberToken);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});

		it('should fail when room is deleted after anonymous room member token issuance', async () => {
			// Create a room and generate an anonymous room member token
			const roomData = await setupSingleRoom();

			// Verify the token works initially
			const initialResponse = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(initialResponse.status).toBe(200);

			// Delete the room
			await deleteRoom(roomData.room.roomId);

			// The original token should now be invalid
			const response = await request(app)
				.get(`${ROOMS_PATH}/${roomData.room.roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(response.status).toBe(401);
			expect(response.body).toHaveProperty('message');
			expect(response.body.message).toContain('Invalid token');
		});
	});
});
