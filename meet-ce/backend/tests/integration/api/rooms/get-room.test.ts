import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import {
	MeetRecordingAudioCodec,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout,
	MeetRecordingVideoCodec
} from '@openvidu-meet/typings';
import ms from 'ms';
import {
	anonymousLinksWithUrl,
	expectExtraFieldsInResponse,
	expectSuccessRoomResponse,
	expectValidationError,
	expectValidRoom,
	expectValidRoomWithFields
} from '../../../helpers/assertion-helpers.js';
import { MeetRoomHelper } from '../../../../src/helpers/room.helper.js';
import {
	createRoom,
	deleteAllRooms,
	generateRoomMemberToken,
	getRoom,
	startTestServer
} from '../../../helpers/request-helpers.js';

describe('Room API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterEach(async () => {
		// Remove all rooms created
		await deleteAllRooms();
	});

	describe('Get Room Tests', () => {
		it('should successfully retrieve a room by its ID without config by default', async () => {
			const createdRoom = await createRoom({
				roomName: 'test-room'
			});

			// Get room without extraFields - config should not be present
			const response = await getRoom(createdRoom.roomId);
			expectValidRoom(response.body, 'test-room');
			expectExtraFieldsInResponse(response.body);
		});

		it('should not include roles by default and include them when requested via extraFields', async () => {
			const createdRoom = await createRoom({ roomName: 'roles-extra-field' });

			// Without extraFields, roles should be excluded
			const defaultResponse = await getRoom(createdRoom.roomId);
			expect(defaultResponse.status).toBe(200);
			expect(defaultResponse.body.roles).toBeUndefined();
			expectExtraFieldsInResponse(defaultResponse.body);

			// With extraFields=roles, roles should be included
			const withRolesResponse = await getRoom(createdRoom.roomId, undefined, 'roles');
			expect(withRolesResponse.status).toBe(200);
			expect(withRolesResponse.body.roles).toBeDefined();
			expect(withRolesResponse.body.roles.moderator.permissions).toBeDefined();
			expect(withRolesResponse.body.roles.speaker.permissions).toBeDefined();
			// config remains excluded since it was not requested
			expect(withRolesResponse.body.config).toBeUndefined();
		});

		it('should retrieve a room with custom config', async () => {
			const payload = {
				roomName: 'custom-config',
				config: {
					recording: {
						enabled: true,
						layout: MeetRecordingLayout.SPEAKER,
						encoding: MeetRecordingEncodingPreset.H264_1080P_30
					},
					chat: { enabled: true },
					virtualBackground: { enabled: false },
					e2ee: { enabled: false },
					broadcast: {
						enabled: false,
						destinations: [],
						layout: MeetRecordingLayout.GRID,
						encoding: MeetRecordingEncodingPreset.H264_720P_30
					},
					captions: { enabled: true },
					raiseHand: { enabled: true },
					reactions: { enabled: true },
					lobby: { enabled: false }
				}
			};
			// Create a room with custom config
			const { roomId } = await createRoom(payload);

			// Retrieve the room by its ID with expand=config
			const response = await getRoom(roomId, undefined, 'config');

			expectSuccessRoomResponse(response, 'custom-config', {
				roomIdPrefix: 'custom_config',
				config: payload.config
			});
		});

		it('should retrieve only specified fields when using fields parameter', async () => {
			// Create a room
			const createdRoom = await createRoom({
				roomName: 'field-filtered'
			});

			// Get the room with field filtering
			const response = await getRoom(createdRoom.roomId, 'roomId,roomName');

			// Verify that only the requested fields are returned
			expect(response.status).toBe(200);

			expectValidRoomWithFields(response.body, ['roomId', 'roomName']);
		});

		it('should handle roomId with characters that need sanitization', async () => {
			// Create a room
			const createdRoom = await createRoom({
				roomName: 'test-room'
			});

			const dirtyRoomId = ' ' + createdRoom.roomId + ' '; // Add spaces that should be trimmed

			const response = await getRoom(dirtyRoomId);

			expectSuccessRoomResponse(response, 'test-room', { roomIdPrefix: 'test_room' });
			expectExtraFieldsInResponse(response.body);
		});

		it('should retrieve a room with autoDeletionDate', async () => {
			// Use validAutoDeletionDate that's defined in the test file or create here
			const validAutoDeletionDate = Date.now() + ms('2h');

			// Create a room with autoDeletionDate
			const createdRoom = await createRoom({
				roomName: 'deletion-date',
				autoDeletionDate: validAutoDeletionDate
			});

			// Get the room
			const response = await getRoom(createdRoom.roomId);

			expectSuccessRoomResponse(response, 'deletion-date', {
				roomIdPrefix: 'deletion_date',
				autoDeletionDate: validAutoDeletionDate
			});
		});

		it('should retrieve a room with encoding preset', async () => {
			const createdRoom = await createRoom({
				roomName: 'encoding-preset-test',
				config: {
					recording: {
						enabled: true,
						encoding: MeetRecordingEncodingPreset.H264_1080P_60
					}
				}
			});

			const response = await getRoom(createdRoom.roomId, undefined, 'config');
			expect(response.status).toBe(200);
			expect(response.body.config.recording.encoding).toBe(MeetRecordingEncodingPreset.H264_1080P_60);
		});

		it('should retrieve a room with advanced encoding options', async () => {
			const advancedEncoding = {
				video: {
					width: 1920,
					height: 1080,
					framerate: 60,
					codec: MeetRecordingVideoCodec.H264_HIGH,
					bitrate: 5000,
					keyFrameInterval: 2,
					depth: 24
				},
				audio: {
					codec: MeetRecordingAudioCodec.AAC,
					bitrate: 192,
					frequency: 48000
				}
			};

			const createdRoom = await createRoom({
				roomName: 'advanced-encoding-test',
				config: {
					recording: {
						enabled: true,
						encoding: advancedEncoding
					}
				}
			});

			const response = await getRoom(createdRoom.roomId, undefined, 'config');
			expect(response.status).toBe(200);
			expect(response.body.config.recording.encoding).toMatchObject(advancedEncoding);
		});

		it('should return 404 for a non-existent room', async () => {
			const fakeRoomId = 'non-existent-room-id';
			const response = await getRoom(fakeRoomId);
			expect(response.status).toBe(404);
			expect(response.body.message).toBe(`Room '${fakeRoomId}' does not exist`);
		});
	});

	describe('Anonymous link disclosure', () => {
		const tokensFor = async (options: Parameters<typeof createRoom>[0] = {}) => {
			const room = await createRoom({ roomName: 'link-disclosure', ...options });
			const { moderatorSecret, speakerSecret } = MeetRoomHelper.extractSecretsFromRoom(room.access);
			const [moderatorToken, speakerToken] = await Promise.all([
				generateRoomMemberToken(room.roomId, { secret: moderatorSecret, joinMeeting: false }),
				generateRoomMemberToken(room.roomId, { secret: speakerSecret, joinMeeting: false })
			]);
			return { room, moderatorToken, speakerToken };
		};

		it('should return no anonymous link to a speaker without roomShareAccessLinks', async () => {
			const { room, speakerToken } = await tokensFor();

			const response = await getRoom(room.roomId, undefined, undefined, speakerToken);

			expect(response.status).toBe(200);
			expect(anonymousLinksWithUrl(response.body)).toEqual([]);
			expect(response.body.access.user.url).toBeDefined();
			expect(response.body.access.anonymous.moderator.enabled).toBe(true);
		});

		it('should return the three anonymous links to a moderator with the default permissions', async () => {
			const { room, moderatorToken } = await tokensFor();

			const response = await getRoom(room.roomId, undefined, undefined, moderatorToken);

			expect(response.status).toBe(200);
			expect(anonymousLinksWithUrl(response.body)).toEqual(['moderator', 'speaker', 'recording']);
		});

		it('should not return the moderator link to a speaker allowed to share', async () => {
			const { room, speakerToken } = await tokensFor({
				roles: { speaker: { permissions: { roomShareAccessLinks: true } } }
			});

			const response = await getRoom(room.roomId, undefined, undefined, speakerToken);

			expect(response.status).toBe(200);
			expect(anonymousLinksWithUrl(response.body)).toEqual(['speaker', 'recording']);
		});

		it('should not return the speaker link to a moderator whose role lacks a speaker permission', async () => {
			const { room, moderatorToken } = await tokensFor({
				roles: { moderator: { permissions: { chatWrite: false } } }
			});

			const response = await getRoom(room.roomId, undefined, undefined, moderatorToken);

			expect(response.status).toBe(200);
			expect(anonymousLinksWithUrl(response.body)).toEqual(['moderator', 'recording']);
		});

		it('should return the three anonymous links to an API key', async () => {
			const { room } = await tokensFor({
				roles: { moderator: { permissions: { roomShareAccessLinks: false } } }
			});

			const response = await getRoom(room.roomId);

			expect(response.status).toBe(200);
			expect(anonymousLinksWithUrl(response.body)).toEqual(['moderator', 'speaker', 'recording']);
		});

		it('should return the roles only when extraFields asks for them', async () => {
			const { room, moderatorToken } = await tokensFor();

			const byDefault = await getRoom(room.roomId, undefined, undefined, moderatorToken);
			const accessOnly = await getRoom(room.roomId, 'access', undefined, moderatorToken);
			const withRoles = await getRoom(room.roomId, undefined, 'roles', moderatorToken);

			expect(byDefault.body.roles).toBeUndefined();
			expect(accessOnly.body.roles).toBeUndefined();
			expect(Object.keys(accessOnly.body).filter((key) => key !== '_extraFields')).toEqual(['access']);
			expect(anonymousLinksWithUrl(accessOnly.body)).toEqual(['moderator', 'speaker', 'recording']);
			expect(withRoles.body.roles.moderator.permissions).toBeDefined();
		});
	});

	describe('Get Room Validation failures', () => {
		it('should fail when roomId becomes empty after sanitization', async () => {
			const response = await getRoom('!!*!@#$%^&*()+{}|:"<>?');

			expectValidationError(response, 'roomId', 'cannot be empty after sanitization');
		});
	});
});
