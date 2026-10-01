import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import type { MeetBroadcastDestination, MeetRoom, MeetRoomOptions } from '@openvidu-meet/typings';
import {
	MEET_BROADCAST_REDACTED_STREAM_KEY,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout
} from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import {
	errorBroadcastEnabledWithoutDestinations,
	errorBroadcastRedactedDestinationUrl,
	errorBroadcastUnknownDestination
} from '../../../../src/models/error.model.js';
import { RoomRepository } from '../../../../src/repositories/room.repository.js';
import { expectMeetError, expectValidationError } from '../../../helpers/assertion-helpers.js';
import {
	createRoom,
	deleteAllRooms,
	getFullPath,
	getRoom,
	getRoomConfig,
	getRooms,
	startTestServer,
	updateRoomConfig
} from '../../../helpers/request-helpers.js';

const ROOMS_PATH = getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/rooms`);

const RTMP_HOST = 'rtmps://a.rtmp.youtube.com/live2';
const REDACTED_URL = `${RTMP_HOST}/${MEET_BROADCAST_REDACTED_STREAM_KEY}`;
const destination = (key: string) => ({ name: `Destination ${key}`, url: `${RTMP_HOST}/${key}-stream-key` });

const storedUrls = (roomId: string) => container.get(RoomRepository).findBroadcastDestinationUrls(roomId);

describe('Broadcast Room Configuration Tests', () => {
	let app: Express;

	beforeAll(async () => {
		app = await startTestServer();
	});

	const createRoomRequest = (options: MeetRoomOptions) =>
		request(app).post(ROOMS_PATH).set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY).send(options);

	afterEach(async () => {
		await deleteAllRooms();
	});

	const createBroadcastRoom = (keys: string[]): Promise<MeetRoom> =>
		createRoom(
			{
				roomName: 'broadcast-config',
				config: { broadcast: { enabled: true, destinations: keys.map(destination) } }
			},
			undefined,
			{ xExtraFields: 'config' }
		);

	describe('Create Room Tests', () => {
		it('should create a room with broadcast disabled and no destinations by default', async () => {
			const room = await createRoom({ roomName: 'defaults' }, undefined, { xExtraFields: 'config' });

			expect(room.config.broadcast).toEqual({
				enabled: false,
				destinations: [],
				layout: MeetRecordingLayout.GRID,
				encoding: MeetRecordingEncodingPreset.H264_720P_30
			});
			expect(await storedUrls(room.roomId)).toEqual({});
		});

		it('should stream in the grid layout unless the room chooses another one', async () => {
			const grid = await createBroadcastRoom(['a']);
			expect(grid.config.broadcast.layout).toBe(MeetRecordingLayout.GRID);

			const speaker = await createRoom(
				{
					roomName: 'broadcast-speaker',
					config: {
						broadcast: {
							enabled: true,
							destinations: [destination('a')],
							layout: MeetRecordingLayout.SINGLE_SPEAKER
						}
					}
				},
				undefined,
				{ xExtraFields: 'config' }
			);
			expect(speaker.config.broadcast.layout).toBe(MeetRecordingLayout.SINGLE_SPEAKER);
		});

		it('should reject a layout that is not one of the recording layouts', async () => {
			const response = await createRoomRequest({
				roomName: 'bad-layout',
				config: {
					broadcast: { enabled: false, destinations: [], layout: 'mosaic' as MeetRecordingLayout }
				}
			});

			expectValidationError(response, 'config.broadcast.layout', 'Invalid enum value');
		});

		it('should assign an id to each destination and never serve its stream key', async () => {
			const room = await createBroadcastRoom(['a', 'b']);
			const { destinations } = room.config.broadcast;

			expect(destinations).toEqual([
				{ id: expect.any(String), name: 'Destination a', url: REDACTED_URL },
				{ id: expect.any(String), name: 'Destination b', url: REDACTED_URL }
			]);
			expect(destinations[0].id).not.toBe(destinations[1].id);
			expect(await storedUrls(room.roomId)).toEqual({
				[destinations[0].id!]: destination('a').url,
				[destinations[1].id!]: destination('b').url
			});

			for (const response of [
				await getRoom(room.roomId, undefined, 'config'),
				await getRooms({ maxItems: 10 }, { xExtraFields: 'config' }),
				await getRoomConfig(room.roomId)
			]) {
				expect(response.status).toBe(200);
				expect(JSON.stringify(response.body)).not.toContain('stream-key');
			}
		});

		it('should create a room with broadcast disabled and no destinations when the block leaves them out', async () => {
			const room = await createRoom(
				{ roomName: 'no-list', config: { broadcast: { enabled: false } } },
				undefined,
				{
					xExtraFields: 'config'
				}
			);

			expect(room.config.broadcast.destinations).toEqual([]);
			expect(await storedUrls(room.roomId)).toEqual({});
		});

		it('should reject enabling broadcast without destinations, more than five destinations and a non-RTMP URL', async () => {
			for (const broadcast of [{ enabled: true, destinations: [] }, { enabled: true }]) {
				expectMeetError(
					await createRoomRequest({ roomName: 'x', config: { broadcast } }),
					errorBroadcastEnabledWithoutDestinations()
				);
			}

			const tooMany = await createRoomRequest({
				roomName: 'x',
				config: { broadcast: { enabled: true, destinations: ['a', 'b', 'c', 'd', 'e', 'f'].map(destination) } }
			});
			expectValidationError(tooMany, 'config.broadcast.destinations', 'Cannot have more than 5 destinations');

			const httpUrl = await createRoomRequest({
				roomName: 'x',
				config: {
					broadcast: { enabled: true, destinations: [{ name: 'Web', url: 'https://youtube.com/live' }] }
				}
			});
			expectValidationError(
				httpUrl,
				'config.broadcast.destinations.0.url',
				'Destination url must be an rtmp:// or rtmps:// URL'
			);
		});

		it('should disable broadcast when end-to-end encryption is enabled', async () => {
			const room = await createRoom(
				{
					roomName: 'e2ee',
					config: { e2ee: { enabled: true }, broadcast: { enabled: true, destinations: [destination('a')] } }
				},
				undefined,
				{ xExtraFields: 'config' }
			);

			expect(room.config.broadcast.enabled).toBe(false);
			expect(room.config.broadcast.destinations).toHaveLength(1);
		});
	});

	describe('Update Room Config Tests', () => {
		it('should keep the saved URL of a destination echoed back redacted and replace a full one', async () => {
			const room = await createBroadcastRoom(['a', 'b']);
			const [a, b] = room.config.broadcast.destinations as Required<MeetBroadcastDestination>[];

			const response = await updateRoomConfig(room.roomId, {
				broadcast: {
					enabled: true,
					destinations: [
						{ id: a.id, name: 'A renamed', url: a.url },
						{ id: b.id, name: b.name, url: `${RTMP_HOST}/b-new-key` },
						destination('c')
					]
				}
			});

			expect(response.status).toBe(200);
			const { destinations } = response.body.broadcast;
			expect(destinations).toEqual([
				{ id: a.id, name: 'A renamed', url: REDACTED_URL },
				{ id: b.id, name: b.name, url: REDACTED_URL },
				{ id: expect.any(String), name: 'Destination c', url: REDACTED_URL }
			]);
			expect(await storedUrls(room.roomId)).toEqual({
				[a.id]: destination('a').url,
				[b.id]: `${RTMP_HOST}/b-new-key`,
				[destinations[2].id]: destination('c').url
			});
		});

		it('should drop the destinations left out of the list, together with their URLs', async () => {
			const room = await createBroadcastRoom(['a', 'b']);
			const [, b] = room.config.broadcast.destinations as Required<MeetBroadcastDestination>[];

			const response = await updateRoomConfig(room.roomId, {
				broadcast: { enabled: true, destinations: [{ id: b.id, name: b.name, url: b.url }] }
			});

			expect(response.status).toBe(200);
			expect(response.body.broadcast.destinations).toEqual([{ id: b.id, name: b.name, url: REDACTED_URL }]);
			expect(await storedUrls(room.roomId)).toEqual({ [b.id]: destination('b').url });
		});

		it('should change only the layout, keeping the destinations the update leaves out', async () => {
			const room = await createBroadcastRoom(['a', 'b']);
			const savedUrls = await storedUrls(room.roomId);

			const changed = await updateRoomConfig(room.roomId, {
				broadcast: { enabled: true, layout: MeetRecordingLayout.SPEAKER }
			});

			expect(changed.status).toBe(200);
			expect(changed.body.broadcast).toEqual({ ...room.config.broadcast, layout: MeetRecordingLayout.SPEAKER });
			expect(await storedUrls(room.roomId)).toEqual(savedUrls);

			const kept = await updateRoomConfig(room.roomId, { broadcast: { enabled: true } });
			expect(kept.status).toBe(200);
			expect(kept.body.broadcast.layout).toBe(MeetRecordingLayout.SPEAKER);
		});

		it('should turn broadcast off and on again without losing the destinations or their stream keys', async () => {
			const room = await createBroadcastRoom(['a']);
			const savedUrls = await storedUrls(room.roomId);

			const off = await updateRoomConfig(room.roomId, { broadcast: { enabled: false } });
			expect(off.status).toBe(200);
			expect(off.body.broadcast).toEqual({ ...room.config.broadcast, enabled: false });

			const on = await updateRoomConfig(room.roomId, { broadcast: { enabled: true } });
			expect(on.status).toBe(200);
			expect(on.body.broadcast).toEqual(room.config.broadcast);
			expect(await storedUrls(room.roomId)).toEqual(savedUrls);
		});

		it('should refuse to enable broadcast in a room with no destinations, sent or saved', async () => {
			const room = await createRoom({ roomName: 'empty' });

			expectMeetError(
				await updateRoomConfig(room.roomId, { broadcast: { enabled: true } }),
				errorBroadcastEnabledWithoutDestinations()
			);

			const withList = await updateRoomConfig(room.roomId, {
				broadcast: { enabled: true, destinations: [destination('a')] }
			});
			expect(withList.status).toBe(200);

			expectMeetError(
				await updateRoomConfig(room.roomId, { broadcast: { enabled: true, destinations: [] } }),
				errorBroadcastEnabledWithoutDestinations()
			);
		});

		it('should keep the destinations when the update leaves the broadcast block out', async () => {
			const room = await createBroadcastRoom(['a']);

			const response = await updateRoomConfig(room.roomId, { chat: { enabled: false } });

			expect(response.status).toBe(200);
			expect(response.body.broadcast).toEqual(room.config.broadcast);
			expect(Object.keys(await storedUrls(room.roomId))).toEqual([room.config.broadcast.destinations[0].id]);
		});

		it('should reject an unknown destination id and a redacted URL for a new destination or with another host', async () => {
			const room = await createBroadcastRoom(['a']);
			const [saved] = room.config.broadcast.destinations;

			expectMeetError(
				await updateRoomConfig(room.roomId, {
					broadcast: {
						enabled: true,
						destinations: [{ ...saved, url: saved.url.replace('a.rtmp.youtube.com', 'b.rtmp.youtube.com') }]
					}
				}),
				errorBroadcastRedactedDestinationUrl()
			);
			expect(await storedUrls(room.roomId)).toEqual({ [saved.id!]: destination('a').url });

			expectMeetError(
				await updateRoomConfig(room.roomId, {
					broadcast: { enabled: true, destinations: [{ id: 'nope', name: 'Nope', url: REDACTED_URL }] }
				}),
				errorBroadcastUnknownDestination('nope')
			);
			expectMeetError(
				await updateRoomConfig(room.roomId, {
					broadcast: { enabled: true, destinations: [{ name: 'New', url: REDACTED_URL }] }
				}),
				errorBroadcastRedactedDestinationUrl()
			);
		});

		it('should disable broadcast when end-to-end encryption gets enabled', async () => {
			const room = await createBroadcastRoom(['a']);

			const response = await updateRoomConfig(room.roomId, { e2ee: { enabled: true } });

			expect(response.status).toBe(200);
			expect(response.body.broadcast.enabled).toBe(false);
			expect(response.body.recording.enabled).toBe(false);
		});
	});
});
