import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Express } from 'express';
import ms from 'ms';
import request from 'supertest';
import INTERNAL_CONFIG from '../../../../src/config/internal-config.js';
import { MEET_INITIAL_API_KEY } from '../../../../src/environment.js';
import {
	MeetRecordingAccess,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings
} from '@openvidu-meet/typings';
import { expectValidRoom } from '../../../helpers/assertion-helpers.js';
import { createRoom, deleteAllRooms, startTestServer } from '../../../helpers/request-helpers.js';

const ROOMS_PATH = `${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`;

describe('Room API Tests', () => {
	const validAutoDeletionDate = Date.now() + ms('2h');

	let app: Express;

	beforeAll(async () => {
		app = startTestServer();
	});

	afterAll(async () => {
		await deleteAllRooms();
	});

	describe('Room Creation Tests', () => {
		it('Should create a room with default name when roomName is omitted', async () => {
			const room = await createRoom();
			expectValidRoom(room, 'Room');
		});

		it('Should create a room without autoDeletionDate (default behavior)', async () => {
			const room = await createRoom({
				roomName: '   Test Room   '
			});
			expectValidRoom(room, 'Test Room');
		});

		it('Should create a room with a valid autoDeletionDate', async () => {
			const room = await createRoom({
				autoDeletionDate: validAutoDeletionDate,
				roomName: '   .,-------}{¡$#<+My Room *123  '
			});

			expectValidRoom(room, 'My Room 123', undefined, validAutoDeletionDate);
		});

		it('Should create a room when sending full valid payload', async () => {
			const payload = {
				roomName: ' =Example Room&/ ',
				autoDeletionDate: validAutoDeletionDate,
				autoDeletionPolicy: {
					withMeeting: MeetRoomDeletionPolicyWithMeeting.FORCE,
					withRecordings: MeetRoomDeletionPolicyWithRecordings.FORCE
				},
				config: {
					recording: {
						enabled: false,
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
					},
					chat: { enabled: false },
					virtualBackground: { enabled: true }
				}
			};

			const room = await createRoom(payload);

			expectValidRoom(room, 'Example Room', payload.config, validAutoDeletionDate, payload.autoDeletionPolicy);
		});
	});

	describe('Room Creation Validation failures', () => {
		it('should fail when autoDeletionDate is negative', async () => {
			const payload = {
				autoDeletionDate: -5000,
				roomName: 'TestRoom'
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			// Check that the error message contains the positive number validation
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('autoDeletionDate must be a positive integer');
		});

		it('should fail when autoDeletionDate is less than 1 hour in the future', async () => {
			const payload = {
				autoDeletionDate: Date.now() + ms('30m'),
				roomName: 'TestRoom'
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain(
				`autoDeletionDate must be at least ${INTERNAL_CONFIG.MIN_FUTURE_TIME_FOR_ROOM_AUTODELETION_DATE} in the future`
			);
		});

		it('should fail when autoDeletionDate is not a number (string provided)', async () => {
			const payload = {
				autoDeletionDate: 'not-a-number',
				roomName: 'TestRoom'
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected number');
		});

		it('should fail when autoDeletionDate is a boolean', async () => {
			const payload = {
				autoDeletionDate: true,
				roomName: 'TestRoom'
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected number');
		});

		it('should fail when autoDeletionDate is omitted but provided as null', async () => {
			const payload = {
				autoDeletionDate: null,
				roomName: 'TestRoom'
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected number');
		});

		it('should fail when autoDeletionPolicy is not an object (string provided)', async () => {
			const payload = {
				roomName: 'TestRoom',
				autoDeletionDate: validAutoDeletionDate,
				autoDeletionPolicy: 'invalid-policy'
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected object');
		});

		it('should fail when autoDeletionPolicy has invalid structure', async () => {
			const payload = {
				roomName: 'TestRoom',
				autoDeletionDate: validAutoDeletionDate,
				autoDeletionPolicy: {
					withMeeting: 'invalid-value',
					withRecordings: MeetRoomDeletionPolicyWithRecordings.CLOSE
				}
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Invalid enum value');
		});

		it('should fail when autoDeletionPolicy.withMeeting has FAIL policy', async () => {
			const payload = {
				roomName: 'TestRoom',
				autoDeletionDate: validAutoDeletionDate,
				autoDeletionPolicy: {
					withMeeting: MeetRoomDeletionPolicyWithMeeting.FAIL,
					withRecordings: MeetRoomDeletionPolicyWithRecordings.CLOSE
				}
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain(
				'FAIL policy is not allowed for withMeeting auto-deletion policy'
			);
		});

		it('should fail when autoDeletionPolicy.withRecordings has FAIL policy', async () => {
			const payload = {
				roomName: 'TestRoom',
				autoDeletionDate: validAutoDeletionDate,
				autoDeletionPolicy: {
					withMeeting: MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS,
					withRecordings: MeetRoomDeletionPolicyWithRecordings.FAIL
				}
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain(
				'FAIL policy is not allowed for withRecordings auto-deletion policy'
			);
		});

		it('should fail when roomName is not a string (number provided)', async () => {
			const payload = {
				roomName: 12345,
				autoDeletionDate: validAutoDeletionDate
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected string');
		});

		it('should fail when roomName is a boolean', async () => {
			const payload = {
				roomName: false,
				autoDeletionDate: validAutoDeletionDate
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected string');
		});

		it('should fail when config is not an object (string provided)', async () => {
			const payload = {
				roomName: 'TestRoom',
				autoDeletionDate: validAutoDeletionDate,
				config: 'invalid-config'
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected object');
		});

		it('should fail when config has an invalid structure', async () => {
			// Assuming config expects each sub-property to be an object with a boolean "enabled",
			// here we deliberately use an invalid structure.
			const payload = {
				roomName: 'TestRoom',
				autoDeletionDate: validAutoDeletionDate,
				config: {
					recording: {
						enabled: 'yes', // invalid boolean
						allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
					},
					chat: { enabled: true },
					virtualBackground: { enabled: true }
				}
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('Expected boolean');
		});

		it('should fail with invalid JSON payload', async () => {
			// In this case, instead of sending JSON object, send an invalid JSON string.
			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.set('Content-Type', 'application/json')
				.send('{"roomName": "TestRoom",') // invalid JSON syntax
				.expect(400);

			expect(response.body.error).toContain('Bad Request');
			expect(response.body.message).toContain('Malformed body');
		});

		it('should fail when roomName is too long', async () => {
			const longRoomId = 'a'.repeat(51);
			const payload = {
				roomName: longRoomId,
				autoDeletionDate: validAutoDeletionDate
			};

			const response = await request(app)
				.post(ROOMS_PATH)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_INITIAL_API_KEY)
				.send(payload)
				.expect(422);

			expect(JSON.stringify(response.body.details)).toContain('roomName cannot exceed 50 characters');
		});
	});
});
