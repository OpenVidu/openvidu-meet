import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { TextMatchMode } from '@openvidu-meet/typings';
import { expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	createRoom,
	deleteAllRooms,
	getAllRecordings,
	getRoomMembers,
	getRooms,
	getUsers,
	startTestServer
} from '../../../helpers/request-helpers.js';

describe('Room API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterAll(async () => {
		await deleteAllRooms();
	});

	describe('List filters in regex mode', () => {
		const tooBigQuantifier = 'a{1000000}';
		const reason = 'Regular expression quantifiers cannot exceed 65535';

		it('answers 422, not 500, to a quantifier the datastore cannot compile', async () => {
			const response = await getRooms({ roomNameMatchMode: TextMatchMode.REGEX, roomName: tooBigQuantifier });

			expectValidationError(response, 'roomName', reason);
		});

		it('applies the same bound to the recordings, users and room members lists', async () => {
			const { roomId } = await createRoom({ roomName: 'regex-members' });
			const recordings = await getAllRecordings({
				roomNameMatchMode: TextMatchMode.REGEX,
				roomName: tooBigQuantifier
			});
			const users = await getUsers({ nameMatchMode: TextMatchMode.REGEX, name: tooBigQuantifier });
			const members = await getRoomMembers(roomId, {
				nameMatchMode: TextMatchMode.REGEX,
				name: tooBigQuantifier
			});

			expectValidationError(recordings, 'roomName', reason);
			expectValidationError(users, 'name', reason);
			expectValidationError(members, 'name', reason);
		});

		it('still filters with a pattern the datastore can evaluate', async () => {
			await createRoom({ roomName: 'target-room' });
			await createRoom({ roomName: 'bystander' });

			const response = await getRooms({ roomNameMatchMode: TextMatchMode.REGEX, roomName: '^target-' });

			expect(response.status).toBe(200);
			expect(response.body.rooms.map((room: { roomName: string }) => room.roomName)).toEqual(['target-room']);
		});
	});
});
