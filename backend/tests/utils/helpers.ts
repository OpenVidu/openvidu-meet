/* eslint-disable @typescript-eslint/no-explicit-any */
import { createApp, registerDependencies } from '../../src/server.js';
import request from 'supertest';
import { Express } from 'express';

import { SERVER_PORT } from '../../src/environment.js';
import { Server } from 'http';

let server: Server;
const baseUrl = '/meet/health';

const BASE_URL = '/meet/api/v1';
const INTERNAL_BASE_URL = '/meet/internal-api/v1';
const AUTH_URL = `${INTERNAL_BASE_URL}/auth`;

export const startTestServer = async (): Promise<Express> => {
	registerDependencies();
	const app = createApp();

	return await new Promise<Express>((resolve, reject) => {
		server = app.listen(SERVER_PORT, async () => {
			try {
				// Check if the server is responding by hitting the health check route
				const response = await request(app).get(baseUrl);

				if (response.status === 200) {
					console.log('Test server started and healthy!');
					resolve(app);
				} else {
					reject(new Error('Test server not healthy'));
				}
			} catch (error: any) {
				reject(new Error('Failed to initialize server or global preferences: ' + error.message));
			}
		});

		// Handle server errors
		server.on('error', (error: any) => reject(new Error(`Test server startup error: ${error.message}`)));
	});
};

/**
 * Stops the test server.
 * It will call `server.close()` to gracefully shut down the server.
 */
export const stopTestServer = async (): Promise<void> => {
	if (server) {
		return new Promise<void>((resolve, reject) => {
			server.close((err) => {
				if (err) {
					reject(new Error(`Failed to stop server: ${err.message}`));
				} else {
					console.log('Test server stopped.');
					resolve();
				}
			});
		});
	} else {
		console.log('Server is not running.');
	}
};

export const login = async (app: Express, username?: string, password?: string) => {
	const response = await request(app)
		.post(`${AUTH_URL}/login`)
		.send({
			username,
			password
		})
		.expect(200);

	const cookies = response.headers['set-cookie'] as unknown as string[];
	const accessTokenCookie = cookies.find((cookie) => cookie.startsWith('OvMeetAccessToken=')) as string;
	return accessTokenCookie;
};

export const deleteAllRooms = async (app: Express) => {
	let nextPageToken = undefined;

	do {
		const response: any = await request(app)
			.get(`${BASE_URL}/rooms`)
			// set header to accept json
			.set('X-API-KEY', 'meet-api-key')
			.query({
				fields: 'roomId',
				maxItems: 100,
				nextPageToken
			})
			.expect(200);

		nextPageToken = response.body.pagination?.nextPageToken ?? undefined;
		const roomIds = response.body.rooms.map((room: any) => room.roomId);

		if (roomIds.length === 0) {
			break;
		}

		await request(app)
			.delete(`${BASE_URL}/rooms`)
			.query({
				roomIds: roomIds.join(','),
				force: true
			})
			.set('X-API-KEY', 'meet-api-key');
	} while (nextPageToken);
};
