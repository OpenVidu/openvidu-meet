import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import type { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { createRoom, deleteAllRooms, getFullPath, startTestServer } from '../../../helpers/request-helpers.js';

let app: Express;

const DEPRECATED_KEYS = [
	'canRecord',
	'canRetrieveRecordings',
	'canDeleteRecordings',
	'canJoinMeeting',
	'canShareAccessLinks',
	'canMakeModerator',
	'canKickParticipants',
	'canEndMeeting',
	'canPublishVideo',
	'canPublishAudio',
	'canShareScreen',
	'canReadChat',
	'canWriteChat',
	'canChangeVirtualBackground'
];

const CURRENT_KEYS = [
	'recordingControl',
	'recordingList',
	'recordingPlay',
	'recordingDownload',
	'recordingDelete',
	'meetingJoin',
	'roomShareAccessLinks',
	'participantPromote',
	'participantKick',
	'meetingEnd',
	'mediaPublishVideo',
	'mediaPublishAudio',
	'mediaShareScreen',
	'chatRead',
	'chatWrite',
	'mediaChangeVirtualBackground'
];

const roomsPath = () => getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`);

const rawGetRoom = (roomId: string) =>
	request(app)
		.get(`${roomsPath()}/${roomId}`)
		.query({ extraFields: 'roles' })
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);

const putSpeakerPermissions = (roomId: string, permissions: Record<string, boolean>) =>
	request(app)
		.put(`${roomsPath()}/${roomId}/roles`)
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
		.send({ roles: { speaker: { permissions } } });

/**
 * Contract of the MEET_MODE permission surface: in `compatibility` (the default) requests accept
 * any mix of the deprecated and the current keys (contradictions are a 422) and responses carry
 * BOTH key sets; with `MEET_MODE='3.9.0'` the deprecated keys are neither accepted nor served.
 * This whole suite is removed in 3.12.0 together with the compatibility mode.
 */
describe('Permission naming (MEET_MODE)', () => {
	let roomId: string;

	beforeAll(async () => {
		app = await startTestServer();
		const room = await createRoom({ roomName: 'naming-room' });
		roomId = room.roomId;
	});

	afterAll(async () => {
		delete process.env.MEET_MODE;
		await deleteAllRooms();
	});

	describe('compatibility mode (default): dual acceptance on input', () => {
		it('should accept a deprecated-keyed roles update and store it under the current keys', async () => {
			const response = await putSpeakerPermissions(roomId, { canRecord: true });
			expect(response.status).toBe(200);

			const roomResponse = await rawGetRoom(roomId);
			expect(roomResponse.body.roles.speaker.permissions.recordingControl).toBe(true);
		});

		it('should expand the deprecated retrieval flag to its whole replacement group', async () => {
			const response = await putSpeakerPermissions(roomId, { canRetrieveRecordings: false });
			expect(response.status).toBe(200);

			const permissions = (await rawGetRoom(roomId)).body.roles.speaker.permissions;
			expect(permissions.recordingList).toBe(false);
			expect(permissions.recordingPlay).toBe(false);
			expect(permissions.recordingDownload).toBe(false);
		});

		it('should accept a consistent mix of deprecated and current spellings', async () => {
			const response = await putSpeakerPermissions(roomId, { canRecord: true, recordingControl: true });
			expect(response.status).toBe(200);
		});

		it('should reject a contradicting deprecated/current pair with 422 citing both keys', async () => {
			const response = await putSpeakerPermissions(roomId, { canRecord: false, recordingControl: true });
			expect(response.status).toBe(422);

			const details = JSON.stringify(response.body.details ?? response.body);
			expect(details).toContain('canRecord');
			expect(details).toContain('recordingControl');
		});

		it('should reject a partially contradicted split group with 422', async () => {
			const response = await putSpeakerPermissions(roomId, {
				canRetrieveRecordings: true,
				recordingDownload: false
			});
			expect(response.status).toBe(422);
		});
	});

	describe('compatibility mode (default): both key sets on output', () => {
		beforeAll(async () => {
			// Deterministic state: full grant except downloads.
			const response = await putSpeakerPermissions(roomId, {
				recordingList: true,
				recordingPlay: true,
				recordingDownload: false
			});
			expect(response.status).toBe(200);
		});

		it('should serve both key sets, with a Deprecation header', async () => {
			const response = await rawGetRoom(roomId);
			expect(response.status).toBe(200);
			expect(response.headers.deprecation).toBe('true');

			const permissions = response.body.roles.speaker.permissions;

			for (const key of CURRENT_KEYS) {
				expect(typeof permissions[key]).toBe('boolean');
			}

			// The split group collapses with AND into its deprecated flag.
			expect(permissions.recordingList).toBe(true);
			expect(permissions.recordingPlay).toBe(true);
			expect(permissions.recordingDownload).toBe(false);
			expect(permissions.canRetrieveRecordings).toBe(false);

			for (const key of DEPRECATED_KEYS) {
				expect(typeof permissions[key]).toBe('boolean');
			}
		});

		it('should serialize member permissions with both key sets too', async () => {
			const createResponse = await request(app)
				.post(`${roomsPath()}/${roomId}/members`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.set('x-extrafields', 'effectivePermissions')
				.send({
					name: 'Naming Member',
					baseRole: MeetRoomMemberRole.SPEAKER,
					customPermissions: { canRecord: true }
				});
			expect(createResponse.status).toBe(201);
			expect(createResponse.headers.deprecation).toBe('true');
			// The partial custom overlay carries both spellings of the single key it overrides.
			expect(createResponse.body.customPermissions).toEqual({ recordingControl: true, canRecord: true });
			expect(createResponse.body.effectivePermissions.recordingControl).toBe(true);
			expect(createResponse.body.effectivePermissions.canRecord).toBe(true);
		});

		it('should omit the deprecated flag of a split group when the group is incomplete', async () => {
			const createResponse = await request(app)
				.post(`${roomsPath()}/${roomId}/members`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send({
					name: 'Partial Group Member',
					baseRole: MeetRoomMemberRole.SPEAKER,
					customPermissions: { recordingPlay: true }
				});
			expect(createResponse.status).toBe(201);
			// play alone cannot be expressed as canRetrieveRecordings, so the deprecated flag is
			// absent instead of misleading an old client with a collapsed value.
			expect(createResponse.body.customPermissions).toEqual({ recordingPlay: true });
		});
	});

	describe("MEET_MODE '3.9.0': the deprecated surface is off", () => {
		beforeAll(() => {
			process.env.MEET_MODE = '3.9.0';
		});

		afterAll(() => {
			delete process.env.MEET_MODE;
		});

		it('should serve only the current key set, without a Deprecation header', async () => {
			const response = await rawGetRoom(roomId);
			expect(response.status).toBe(200);
			expect(response.headers.deprecation).toBeUndefined();

			const permissions = response.body.roles.speaker.permissions;

			for (const key of DEPRECATED_KEYS) {
				expect(permissions).not.toHaveProperty(key);
			}

			for (const key of CURRENT_KEYS) {
				expect(typeof permissions[key]).toBe('boolean');
			}
		});

		it('should reject a deprecated key with 422 naming its replacement', async () => {
			const response = await putSpeakerPermissions(roomId, { canRecord: true });
			expect(response.status).toBe(422);

			const details = JSON.stringify(response.body.details ?? response.body);
			expect(details).toContain('canRecord');
			expect(details).toContain('recordingControl');
		});

		it('should reject the deprecated split flag naming the whole replacement group', async () => {
			const response = await putSpeakerPermissions(roomId, { canRetrieveRecordings: true });
			expect(response.status).toBe(422);

			const details = JSON.stringify(response.body.details ?? response.body);
			expect(details).toContain('recordingList');
			expect(details).toContain('recordingPlay');
			expect(details).toContain('recordingDownload');
		});

		it('should keep accepting the current keys', async () => {
			const response = await putSpeakerPermissions(roomId, { recordingControl: true });
			expect(response.status).toBe(200);

			const roomResponse = await rawGetRoom(roomId);
			expect(roomResponse.body.roles.speaker.permissions.recordingControl).toBe(true);
		});
	});
});
