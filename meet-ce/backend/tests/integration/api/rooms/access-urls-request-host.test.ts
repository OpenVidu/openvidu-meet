import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import type { Express } from 'express';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import {
	createRoom,
	createRoomMember,
	deleteAllRooms,
	getFullPath,
	getRooms,
	startTestServer
} from '../../../helpers/request-helpers.js';

const collectUrls = (value: unknown, found: string[] = []): string[] => {
	if (typeof value === 'string') {
		if (/^https?:\/\//.test(value)) {
			found.push(value);
		}
	} else if (value && typeof value === 'object') {
		Object.values(value).forEach((child) => collectUrls(child, found));
	}

	return found;
};

describe('Room API Tests', () => {
	const ROOMS = 8;
	let app: Express;
	const rooms: { roomId: string; memberId: string }[] = [];

	beforeAll(async () => {
		app = await startTestServer();

		for (let i = 0; i < ROOMS; i++) {
			const room = await createRoom({ roomName: `host-${i}` });
			const member = await createRoomMember(room.roomId, {
				name: `Member ${i}`,
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			rooms.push({ roomId: room.roomId, memberId: member.body.memberId });
		}
	});

	afterAll(async () => {
		await deleteAllRooms();
	});

	describe('Access URLs and the host of the request', () => {
		const getAs = (host: string, path: string) =>
			request(app)
				.get(getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}${path}`))
				.set('Host', host)
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);

		it('builds the URLs of a response on the host that asked for it, also under concurrency', async () => {
			const results = await Promise.all(
				Array.from({ length: 32 }, (_, i) => {
					const host = `h${i}.test`;
					const { roomId, memberId } = rooms[i % rooms.length];
					const path = i % 2 === 0 ? `/rooms/${roomId}` : `/rooms/${roomId}/members/${memberId}`;
					return getAs(host, path).then((response) => ({ host, path, response }));
				})
			);

			const mismatches = results.flatMap(({ host, path, response }) => {
				expect(response.status).toBe(200);
				const urls = collectUrls(response.body);
				expect(urls.length).toBeGreaterThan(0);
				return urls
					.filter((url) => new URL(url).host !== host)
					.map((url) => `${path} asked ${host}, got ${url}`);
			});

			expect(mismatches).toEqual([]);
		});

		it('does not resolve a service from the container once per listed room', async () => {
			const resolutions = jest.spyOn(container, 'get');

			try {
				await getRooms({ maxItems: 1 });
				const resolutionsForOneRoom = resolutions.mock.calls.length;
				resolutions.mockClear();

				const response = await getRooms({ maxItems: ROOMS });
				expect(response.body.rooms).toHaveLength(ROOMS);
				expect(resolutions.mock.calls.length).toBeLessThanOrEqual(resolutionsForOneRoom);
			} finally {
				resolutions.mockRestore();
			}
		});
	});
});
