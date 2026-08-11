import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import { PERMISSION_NAMING_HEADER } from '../../../../src/helpers/permission-naming.helper.js';
import type { Express } from 'express';
import { createRoom, deleteAllRooms, getFullPath, startTestServer } from '../../../helpers/request-helpers.js';

let app: Express;

const LEGACY_KEYS = [
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

const CANONICAL_KEYS = [
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

const rawGetRoom = (roomId: string, naming?: string) => {
	const req = request(app)
		.get(`${roomsPath()}/${roomId}`)
		.query({ extraFields: 'roles' })
		.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);

	if (naming) {
		req.set(PERMISSION_NAMING_HEADER, naming);
	}

	return req;
};

/**
 * Deprecation-window contract of the permission surface (D2/D3 in the migration plan): any mix of
 * legacy and canonical keys is accepted on input, contradictions are a 422, and every response
 * serializes exactly ONE key set — legacy by default, canonical when the request asks for it.
 * This whole suite is removed in 3.12.0 together with the aliases.
 */
describe('Permission naming (deprecation window)', () => {
	let roomId: string;

	beforeAll(async () => {
		app = await startTestServer();
		const room = await createRoom({ roomName: 'naming-room' });
		roomId = room.roomId;
	});

	afterAll(async () => {
		await deleteAllRooms();
	});

	describe('Input: dual acceptance and conflicts', () => {
		it('should accept a legacy-keyed roles update and store it canonically', async () => {
			const response = await request(app)
				.put(`${roomsPath()}/${roomId}/roles`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send({ roles: { speaker: { permissions: { canRecord: true } } } });
			expect(response.status).toBe(200);

			const canonical = await rawGetRoom(roomId, 'canonical');
			expect(canonical.body.roles.speaker.permissions.recordingControl).toBe(true);
			expect(canonical.body.roles.speaker.permissions).not.toHaveProperty('canRecord');
		});

		it('should expand the legacy retrieval flag to its whole canonical group', async () => {
			const response = await request(app)
				.put(`${roomsPath()}/${roomId}/roles`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send({ roles: { speaker: { permissions: { canRetrieveRecordings: false } } } });
			expect(response.status).toBe(200);

			const canonical = await rawGetRoom(roomId, 'canonical');
			const permissions = canonical.body.roles.speaker.permissions;
			expect(permissions.recordingList).toBe(false);
			expect(permissions.recordingPlay).toBe(false);
			expect(permissions.recordingDownload).toBe(false);
		});

		it('should accept a consistent mix of legacy and canonical spellings', async () => {
			const response = await request(app)
				.put(`${roomsPath()}/${roomId}/roles`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send({ roles: { speaker: { permissions: { canRecord: true, recordingControl: true } } } });
			expect(response.status).toBe(200);
		});

		it('should reject a contradicting legacy/canonical pair with 422 citing both keys', async () => {
			const response = await request(app)
				.put(`${roomsPath()}/${roomId}/roles`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send({ roles: { speaker: { permissions: { canRecord: false, recordingControl: true } } } });
			expect(response.status).toBe(422);

			const details = JSON.stringify(response.body.details ?? response.body);
			expect(details).toContain('canRecord');
			expect(details).toContain('recordingControl');
		});

		it('should reject a partially contradicted split group with 422', async () => {
			const response = await request(app)
				.put(`${roomsPath()}/${roomId}/roles`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send({
					roles: { speaker: { permissions: { canRetrieveRecordings: true, recordingDownload: false } } }
				});
			expect(response.status).toBe(422);
		});
	});

	describe('Output: one key set per response, selectable', () => {
		beforeAll(async () => {
			// Deterministic state: full canonical grant except downloads.
			const response = await request(app)
				.put(`${roomsPath()}/${roomId}/roles`)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.send({
					roles: {
						speaker: {
							permissions: { recordingList: true, recordingPlay: true, recordingDownload: false }
						}
					}
				});
			expect(response.status).toBe(200);
		});

		it('should serve the legacy key set by default, with a Deprecation header', async () => {
			const response = await rawGetRoom(roomId);
			expect(response.status).toBe(200);
			expect(response.headers.deprecation).toBe('true');

			const permissions = response.body.roles.speaker.permissions;

			for (const key of CANONICAL_KEYS) {
				expect(permissions).not.toHaveProperty(key);
			}

			// The split group is only partially granted, so its legacy flag collapses with AND.
			expect(permissions.canRetrieveRecordings).toBe(false);

			for (const key of LEGACY_KEYS) {
				expect(typeof permissions[key]).toBe('boolean');
			}
		});

		it('should serve the canonical key set when the request selects it, without Deprecation', async () => {
			const response = await rawGetRoom(roomId, 'canonical');
			expect(response.status).toBe(200);
			expect(response.headers.deprecation).toBeUndefined();

			const permissions = response.body.roles.speaker.permissions;

			for (const key of LEGACY_KEYS) {
				expect(permissions).not.toHaveProperty(key);
			}

			expect(permissions.recordingList).toBe(true);
			expect(permissions.recordingPlay).toBe(true);
			expect(permissions.recordingDownload).toBe(false);
		});

		it('should serve legacy names when the request selects them explicitly', async () => {
			const response = await rawGetRoom(roomId, 'legacy');
			expect(response.status).toBe(200);
			expect(response.headers.deprecation).toBe('true');
			expect(response.body.roles.speaker.permissions).toHaveProperty('canRecord');
		});

		it('should reject an unknown naming header value with 422', async () => {
			const response = await rawGetRoom(roomId, 'both');
			expect(response.status).toBe(422);
		});

		it('should serialize member permissions with the same selectable naming', async () => {
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
			// Default naming: legacy keys only, custom overlay collapsed to its legacy spelling.
			expect(createResponse.headers.deprecation).toBe('true');
			expect(createResponse.body.customPermissions).toEqual({ canRecord: true });
			expect(createResponse.body.effectivePermissions).not.toHaveProperty('recordingControl');
			expect(createResponse.body.effectivePermissions.canRecord).toBe(true);

			const memberId = createResponse.body.memberId as string;
			const canonicalResponse = await request(app)
				.get(`${roomsPath()}/${roomId}/members/${memberId}`)
				.query({ extraFields: 'effectivePermissions' })
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY)
				.set(PERMISSION_NAMING_HEADER, 'canonical');
			expect(canonicalResponse.status).toBe(200);
			expect(canonicalResponse.body.effectivePermissions.recordingControl).toBe(true);
			expect(canonicalResponse.body.effectivePermissions).not.toHaveProperty('canRecord');
			expect(canonicalResponse.body.customPermissions).toEqual({ recordingControl: true });
		});
	});
});
