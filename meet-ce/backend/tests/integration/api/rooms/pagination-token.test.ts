import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import type { Response } from 'supertest';
import {
	createRoom,
	createRoomMember,
	deleteAllRooms,
	getAllRecordings,
	getRoomMembers,
	getRooms,
	getUsers,
	startTestServer
} from '../../../helpers/request-helpers.js';

const encode = (cursor: unknown): string => Buffer.from(JSON.stringify(cursor)).toString('base64');

const expectBadToken = (response: Response) => {
	expect(response.status).toBe(400);
	expect(response.body).toEqual({ error: 'Bad Request', message: 'Invalid pagination token' });
};

describe('Room API Tests', () => {
	let roomId: string;

	beforeAll(async () => {
		await startTestServer();

		for (let i = 0; i < 3; i++) {
			({ roomId } = await createRoom({ roomName: `page-${i}` }));
		}

		await createRoomMember(roomId, { name: 'Paged Member', baseRole: MeetRoomMemberRole.SPEAKER });
	});

	afterAll(async () => {
		await deleteAllRooms();
	});

	describe('nextPageToken the server did not mint', () => {
		it.each([
			['garbage', 'x'],
			['an empty object', encode({})],
			['a truncated token', 'eyJ9'],
			['a well-shaped token whose id is not an ObjectId', encode({ fieldValue: 1, id: 'x' })],
			['a query operator smuggled as the sort field value', encode({ fieldValue: { $gt: 1 }, id: 'x' })]
		])('answers 400, not 500, to %s', async (_label, nextPageToken) => {
			expectBadToken(await getRooms({ nextPageToken }));
		});

		it('is rejected the same way by the recordings, users and room members lists', async () => {
			const nextPageToken = encode({ fieldValue: 1, id: 'x' });

			expectBadToken(await getAllRecordings({ nextPageToken }));
			expectBadToken(await getUsers({ nextPageToken }));
			expectBadToken(await getRoomMembers(roomId, { nextPageToken }));
		});

		it('still resumes a listing with a token the server minted', async () => {
			const firstPage = await getRooms({ maxItems: 2 });
			expect(firstPage.status).toBe(200);
			expect(firstPage.body.pagination.isTruncated).toBe(true);

			const secondPage = await getRooms({ maxItems: 2, nextPageToken: firstPage.body.pagination.nextPageToken });

			expect(secondPage.status).toBe(200);
			expect(secondPage.body.rooms).toHaveLength(1);
			expect(secondPage.body.pagination.isTruncated).toBe(false);
		});
	});
});
