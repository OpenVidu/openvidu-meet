import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type {
	MeetBroadcastDestination,
	MeetBroadcastInfo,
	MeetMeetingInfo,
	MeetRoomConfig
} from '@openvidu-meet/typings';
import { MEET_BROADCAST_REDACTED_STREAM_KEY, MeetBroadcastStatus, MeetRecordingLayout } from '@openvidu-meet/typings';
import { Express } from 'express';
import { EgressClient, ServerError, StreamOutput, StreamProtocol } from 'livekit-server-sdk';
import request from 'supertest';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import { MEET_ENV } from '../../../../src/environment.js';
import {
	errorBroadcastAlreadyStarted,
	errorBroadcastDestinationInUse,
	errorBroadcastDisabled,
	errorBroadcastNotFound,
	errorBroadcastRoomHasNoParticipants,
	errorBroadcastStartUnknownDestination,
	errorEgressNotAvailable,
	errorInsufficientPermissions
} from '../../../../src/models/error.model.js';
import { LiveKitService } from '../../../../src/services/livekit.service.js';
import { expectMeetError } from '../../../helpers/assertion-helpers.js';
import { createRtmpSink, deleteRtmpSinks } from '../../../helpers/broadcast-sink.helper.js';
import { disconnectFakeParticipants, joinFakeParticipant } from '../../../helpers/livekit-cli-helpers.js';
import {
	createWebhook,
	deleteAllRooms,
	deleteAllWebhooks,
	deleteRoom,
	generateRoomMemberToken,
	getBroadcast,
	getBroadcasts,
	getFullPath,
	getRoomConfig,
	startBroadcasts,
	startTestServer,
	stopBroadcasts,
	updateRoomRoles
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom, startWebhookServer, stopWebhookServer } from '../../../helpers/test-scenarios.js';
import {
	waitForBroadcast,
	waitForBroadcasts,
	waitForMeetingToStart,
	waitForNoActiveEgress
} from '../../../helpers/wait-helpers.js';
import { RoomData } from '../../../interfaces/scenarios.js';

const MEETINGS_PATH = getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/meetings`);

// A destination nothing listens on: the broadcast still starts, and fails on its own once the media
// server gives up on it. The lifecycle test streams to a real sink alongside it.
const RTMP_HOST = 'rtmp://rtmp-sink.invalid:1935/live';
const destination = (key: string) => ({ name: `Destination ${key}`, url: `${RTMP_HOST}/${key}-stream-key` });
const REDACTED_URL = `${RTMP_HOST}/${MEET_BROADCAST_REDACTED_STREAM_KEY}`;

const broadcastConfig = (keys: string[]): Partial<MeetRoomConfig> => ({
	broadcast: { enabled: true, destinations: keys.map(destination) }
});

type StartDestination = { destinationId: string } | { name: string; url: string };

/** Starts one broadcast, to that destination alone, and answers it alongside the response. */
const startOne = async (roomId: string, target: StartDestination, roomMemberToken?: string) => {
	const options =
		'destinationId' in target
			? { destinationIds: [target.destinationId] }
			: { destinationIds: [], destinations: [target] };
	const response = await startBroadcasts(roomId, options, roomMemberToken);
	return { response, broadcast: response.body.broadcasts?.[0] as MeetBroadcastInfo };
};

describe('Broadcasts API Tests', () => {
	let app: Express;

	beforeAll(async () => {
		app = await startTestServer();
	});

	afterEach(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteRtmpSinks();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteRtmpSinks();
	});

	const setupMeetingRoom = async (config: Partial<MeetRoomConfig>): Promise<RoomData> => {
		const roomData = await setupSingleRoom(false, 'BROADCAST_ROOM', config);
		await joinFakeParticipant(roomData.room.roomId, 'PUBLISHER');
		await waitForMeetingToStart(roomData.room.roomId);
		return roomData;
	};

	const roomDestinationIds = async (roomData: RoomData): Promise<string[]> => {
		const { body } = await getRoomConfig(roomData.room.roomId);
		return body.broadcast.destinations.map(({ id }: MeetBroadcastDestination) => id);
	};

	describe('Start Broadcast Tests', () => {
		it('should start a broadcast to a room destination with the moderator token', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a', 'b']));
			const [idA] = await roomDestinationIds(roomData);

			const response = await startBroadcasts(
				roomData.room.roomId,
				{ destinationIds: [idA] },
				roomData.moderatorToken
			);

			expect(response.status).toBe(201);
			expect(response.body).toEqual({
				broadcasts: [
					{
						broadcastId: expect.stringMatching(new RegExp(`^${roomData.room.roomId}--`)),
						roomId: roomData.room.roomId,
						roomName: 'BROADCAST_ROOM',
						status: MeetBroadcastStatus.STARTING,
						destination: { id: idA, name: 'Destination a', url: REDACTED_URL },
						layout: MeetRecordingLayout.GRID,
						encoding: expect.any(String)
					}
				]
			});
		});

		it('should start one broadcast per destination in one request, the room ones and one for this meeting', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a', 'b']));
			const { roomId } = roomData.room;
			const [idA, idB] = await roomDestinationIds(roomData);

			const response = await startBroadcasts(roomId, {
				destinationIds: [idA, idB],
				destinations: [destination('extra')]
			});

			expect(response.status).toBe(201);
			const started = response.body.broadcasts as MeetBroadcastInfo[];
			expect(started.map(({ destination }) => [destination.name, destination.id])).toEqual([
				['Destination a', idA],
				['Destination b', idB],
				['Destination extra', undefined]
			]);
			expect(new Set(started.map(({ broadcastId }) => broadcastId)).size).toBe(3);
			const listed = await getBroadcasts(roomId, roomData.speakerToken);
			expect(listed.body.broadcasts.map(({ broadcastId }: MeetBroadcastInfo) => broadcastId)).toEqual(
				started.map(({ broadcastId }) => broadcastId)
			);
		});

		it('should start every room destination not streamed to yet when the request names none', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a', 'b']));
			const { roomId } = roomData.room;
			const [idA, idB] = await roomDestinationIds(roomData);
			await startOne(roomId, { destinationId: idA });

			const rest = await startBroadcasts(roomId);

			expect(rest.status).toBe(201);
			expect(rest.body.broadcasts.map(({ destination }: MeetBroadcastInfo) => destination.id)).toEqual([idB]);
			expectMeetError(await startBroadcasts(roomId), errorBroadcastAlreadyStarted(roomId));
		});

		it('should stream to the room destinations too when destinationIds is omitted, and to none of them when it is empty', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a', 'b']));
			const { roomId } = roomData.room;
			const [idA, idB] = await roomDestinationIds(roomData);

			const onlyExtra = await startBroadcasts(roomId, { destinationIds: [], destinations: [destination('x')] });
			expect(onlyExtra.status).toBe(201);
			expect(onlyExtra.body.broadcasts.map(({ destination }: MeetBroadcastInfo) => destination.name)).toEqual([
				'Destination x'
			]);

			const withRoom = await startBroadcasts(roomId, { destinations: [destination('y')] });
			expect(withRoom.status).toBe(201);
			expect(
				withRoom.body.broadcasts.map(({ destination }: MeetBroadcastInfo) => [destination.name, destination.id])
			).toEqual([
				['Destination a', idA],
				['Destination b', idB],
				['Destination y', undefined]
			]);
		});

		it('should report the meeting as broadcast and refuse a second broadcast to the same destination or stream key', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a']));
			const { roomId } = roomData.room;
			const [idA] = await roomDestinationIds(roomData);
			await startOne(roomId, { destinationId: idA });

			const meeting = await request(app)
				.get(`${MEETINGS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(meeting.status).toBe(200);
			expect((meeting.body as MeetMeetingInfo).broadcastActive).toBe(true);

			expectMeetError(
				(await startOne(roomId, { destinationId: idA })).response,
				errorBroadcastDestinationInUse(REDACTED_URL)
			);
			expectMeetError(
				(await startOne(roomId, destination('a'))).response,
				errorBroadcastDestinationInUse(REDACTED_URL)
			);
			expectMeetError(
				(await startOne(roomId, { name: 'Mirror', url: 'rtmp://mirror-sink.invalid/app/a-stream-key' }))
					.response,
				errorBroadcastDestinationInUse('rtmp://mirror-sink.invalid/app/********')
			);
		});

		it('should refuse to start when broadcast is disabled, the meeting has no participants, or a destination is unknown, malformed or repeated', async () => {
			const disabledRoom = await setupMeetingRoom({ broadcast: { enabled: false, destinations: [] } });
			expectMeetError(
				(await startOne(disabledRoom.room.roomId, destination('x'))).response,
				errorBroadcastDisabled(disabledRoom.room.roomId)
			);

			const idleRoom = await setupSingleRoom(false, 'IDLE', broadcastConfig(['a']));
			expectMeetError(
				await startBroadcasts(idleRoom.room.roomId),
				errorBroadcastRoomHasNoParticipants(idleRoom.room.roomId)
			);

			const roomData = await setupMeetingRoom(broadcastConfig(['a']));
			const { roomId } = roomData.room;
			const [idA] = await roomDestinationIds(roomData);
			expectMeetError(
				await startBroadcasts(roomId, { destinationIds: [idA, 'nope'] }),
				errorBroadcastStartUnknownDestination('nope')
			);
			const [idOfAnotherRoom] = await roomDestinationIds(idleRoom);
			expectMeetError(
				await startBroadcasts(roomId, { destinationIds: [idOfAnotherRoom] }),
				errorBroadcastStartUnknownDestination(idOfAnotherRoom)
			);

			const refused = [
				{ destinationIds: [] },
				{ destinationIds: [], destinations: [] },
				{ destinations: [{ destinationId: idA, ...destination('renamed') }] },
				{ destinationIds: [], destinations: [{ name: 'Redacted', url: REDACTED_URL }] },
				{ destinationIds: [idA], destinations: [{ name: 'Same as a', url: destination('a').url }] },
				{
					destinationIds: [idA],
					destinations: [{ name: 'Key of a elsewhere', url: 'rtmp://mirror-sink.invalid/app/a-stream-key' }]
				}
			];

			for (const options of refused) {
				expect((await startBroadcasts(roomId, options)).status).toBe(422);
			}

			expect((await getBroadcasts(roomId)).body.broadcasts).toEqual([]);
		});

		it('should return 503 when no egress service takes the broadcast, leaving the room free to go live', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a']));
			const { roomId } = roomData.room;
			const startEgress = jest
				.spyOn(EgressClient.prototype, 'startRoomCompositeEgress')
				.mockRejectedValueOnce(
					new ServerError('Service Unavailable', 'twirp error unknown: no response from servers', 503)
				);

			let response: Awaited<ReturnType<typeof startBroadcasts>>;

			try {
				response = await startBroadcasts(roomId);
			} finally {
				startEgress.mockRestore();
			}

			expectMeetError(response, errorEgressNotAvailable());
			expect((await getBroadcasts(roomId)).body.broadcasts).toEqual([]);
			expect((await startBroadcasts(roomId)).status).toBe(201);
		});

		it('should require broadcastControl, and broadcastAddDestinations for a destination of this meeting', async () => {
			// Roles are settled before the meeting starts, which is when they can still change.
			const roomData = await setupSingleRoom(false, 'BROADCAST_ROOM', broadcastConfig(['a']));
			const { roomId } = roomData.room;
			const rolesUpdate = await updateRoomRoles(roomId, {
				moderator: {
					permissions: {
						...roomData.room.roles.moderator.permissions,
						broadcastAddDestinations: false
					}
				}
			});
			expect(rolesUpdate.status).toBe(200);
			const moderatorWithoutExtras = await generateRoomMemberToken(roomId, {
				secret: roomData.moderatorSecret,
				joinMeeting: false
			});
			const speakerToken = await generateRoomMemberToken(roomId, {
				secret: roomData.speakerSecret,
				joinMeeting: false
			});
			await joinFakeParticipant(roomId, 'PUBLISHER');
			await waitForMeetingToStart(roomId);
			const [idA] = await roomDestinationIds(roomData);

			expectMeetError(await startBroadcasts(roomId, {}, speakerToken), errorInsufficientPermissions());
			expectMeetError(
				await startBroadcasts(
					roomId,
					{ destinationIds: [idA], destinations: [destination('extra')] },
					moderatorWithoutExtras
				),
				errorInsufficientPermissions()
			);

			const allowed = await startBroadcasts(roomId, { destinationIds: [idA] }, moderatorWithoutExtras);
			expect(allowed.status).toBe(201);
		});
	});

	describe('Broadcast Fields Tests', () => {
		const asApiKey = (req: request.Test) => req.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);

		it('should limit every broadcast response to the fields the query and the X-Fields header ask for', async () => {
			// A real sink keeps the broadcast running through every request below.
			const sinkUrl = await createRtmpSink('fields');
			const roomData = await setupMeetingRoom({
				broadcast: { enabled: true, destinations: [{ name: 'Sink', url: sinkUrl }] }
			});
			const { roomId } = roomData.room;
			const broadcastsPath = getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/broadcasts`);

			const started = await asApiKey(request(app).post(`${broadcastsPath}?fields=broadcastId,status,bogus`)).send(
				{ roomId }
			);
			expect(started.status).toBe(201);
			expect(started.body).toEqual({
				broadcasts: [{ broadcastId: expect.any(String), status: MeetBroadcastStatus.STARTING }]
			});
			const [{ broadcastId }] = started.body.broadcasts;
			const broadcastPath = `${broadcastsPath}/${broadcastId}`;

			const fetched = await asApiKey(request(app).get(`${broadcastPath}?fields=status`)).set(
				'X-Fields',
				'roomId'
			);
			expect(fetched.status).toBe(200);
			expect(Object.keys(fetched.body).sort()).toEqual(['roomId', 'status']);

			const listed = await asApiKey(request(app).get(broadcastsPath).query({ roomId })).set(
				'X-Fields',
				'broadcastId'
			);
			expect(listed.body).toEqual({ broadcasts: [{ broadcastId }] });

			const unknownOnly = await asApiKey(request(app).get(`${broadcastPath}?fields=bogus`));
			expect(unknownOnly.body).toMatchObject({ broadcastId, roomId, destination: { url: expect.any(String) } });

			const stopped = await asApiKey(request(app).post(`${broadcastsPath}/stop`))
				.set('X-Fields', 'status')
				.send({ roomId, broadcastIds: [broadcastId] });
			expect(stopped.status).toBe(200);
			expect(stopped.body).toEqual({ broadcasts: [{ status: expect.stringMatching(/^(complete|aborted)$/) }] });
		});
	});

	describe('Broadcast Id Tests', () => {
		it('should reject a list without its room and a malformed broadcast id, and find no broadcast of an unknown room', async () => {
			const listed = await request(app)
				.get(getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/broadcasts`))
				.set(INTERNAL_CONFIG.API_KEY_HEADER, MEET_ENV.INITIAL_API_KEY);
			expect(listed.status).toBe(422);

			expect((await getBroadcast('no-room-in-it')).status).toBe(422);
			expect((await stopBroadcasts('unknown_room', { broadcastIds: ['no-room-in-it'] })).status).toBe(422);
			expect((await getBroadcast('unknown_room--Qm4tZ8vR1c')).status).toBe(404);
			expect((await stopBroadcasts('unknown_room', { broadcastIds: ['unknown_room--Qm4tZ8vR1c'] })).status).toBe(
				404
			);
		});
	});

	describe('Broadcast Lifecycle Tests', () => {
		const webhooks: { event: string; creationDate: number; data: MeetBroadcastInfo }[] = [];

		beforeAll(async () => {
			await startWebhookServer(5080, (req) => webhooks.push(req.body));
			await deleteAllWebhooks();
			await createWebhook({ url: 'http://localhost:5080/webhook' });
		});

		afterAll(async () => {
			await stopWebhookServer();
			await deleteAllWebhooks();
		});

		/** The broadcast webhooks of one broadcast, in the order the server created them. */
		const webhooksOf = (broadcastId: string) =>
			webhooks
				.filter(({ event, data }) => event.startsWith('broadcast') && data.broadcastId === broadcastId)
				.sort((a, b) => a.creationDate - b.creationDate)
				.map(({ event, data }) => `${event}:${data.status}`);

		it('should go active with media, fail on its own when the destination is unreachable, and end when stopped', async () => {
			const sinkUrl = await createRtmpSink('a');
			const roomData = await setupMeetingRoom({
				broadcast: { enabled: true, destinations: [{ name: 'Destination a', url: sinkUrl }, destination('b')] }
			});
			const { roomId } = roomData.room;
			const [, idB] = await roomDestinationIds(roomData);
			const [broadcastA, broadcastB] = (await startBroadcasts(roomId)).body.broadcasts as MeetBroadcastInfo[];

			// The reachable destination streams; the unreachable one fails on its own without taking
			// the other down.
			const active = await waitForBroadcast(
				roomId,
				broadcastA.broadcastId,
				(broadcast) => broadcast?.status === MeetBroadcastStatus.ACTIVE,
				'went active'
			);
			expect(active?.startDate).toBeGreaterThan(0);
			await waitForBroadcast(
				roomId,
				broadcastB.broadcastId,
				(broadcast) => broadcast === undefined,
				'failed and left the list'
			);
			expect((await getBroadcast(broadcastB.broadcastId)).status).toBe(404);

			const single = await getBroadcast(broadcastA.broadcastId, roomData.speakerToken);
			expect(single.status).toBe(200);
			expect(single.body.destination.url).toContain(`/${MEET_BROADCAST_REDACTED_STREAM_KEY}`);
			expect(single.body.destination.url).not.toContain(sinkUrl.split('/').pop());

			// The failed destination can be streamed to again, as a new broadcast, alongside one for
			// this meeting.
			const more = await startBroadcasts(
				roomId,
				{ destinationIds: [idB], destinations: [{ name: 'Destination c', url: await createRtmpSink('c') }] },
				roomData.moderatorToken
			);
			expect(more.status).toBe(201);
			const [retried, added] = more.body.broadcasts as MeetBroadcastInfo[];
			expect(retried.broadcastId).not.toBe(broadcastB.broadcastId);
			await waitForBroadcast(
				roomId,
				added.broadcastId,
				(broadcast) => broadcast?.status === MeetBroadcastStatus.ACTIVE,
				'streamed to the destination added for this meeting'
			);
			// The retried destination is still unreachable, so it fails on its own again.
			await waitForBroadcast(
				roomId,
				retried.broadcastId,
				(broadcast) => broadcast === undefined,
				'failed again and left the list'
			);

			const stopA = { broadcastIds: [broadcastA.broadcastId] };
			const stoppedA = await stopBroadcasts(roomId, stopA, roomData.moderatorToken);
			expect(stoppedA.status).toBe(200);
			expect(stoppedA.body).toEqual({
				broadcasts: [
					expect.objectContaining({
						broadcastId: broadcastA.broadcastId,
						status: MeetBroadcastStatus.COMPLETE,
						startDate: active?.startDate,
						endDate: expect.any(Number),
						duration: expect.any(Number)
					})
				]
			});
			expectMeetError(await stopBroadcasts(roomId, stopA), errorBroadcastNotFound(broadcastA.broadcastId));

			const stoppedRest = await stopBroadcasts(roomId);
			expect(stoppedRest.status).toBe(200);
			expect(stoppedRest.body.broadcasts.map(({ broadcastId }: MeetBroadcastInfo) => broadcastId)).toEqual([
				added.broadcastId
			]);

			await waitForBroadcasts(roomId, (broadcasts) => broadcasts.length === 0, 'all ended');
			await waitForNoActiveEgress(roomId, 30_000);
			expect((await stopBroadcasts(roomId)).body).toEqual({ broadcasts: [] });

			// Each broadcast is reported to the webhooks on its own, started first and ended last.
			const broadcastIds = [broadcastA, broadcastB, retried, added].map(({ broadcastId }) => broadcastId);

			for (let attempt = 0; attempt < 20; attempt++) {
				if (broadcastIds.every((id) => webhooksOf(id).at(-1)?.startsWith('broadcastEnded'))) break;

				await new Promise((resolve) => setTimeout(resolve, 500));
			}

			const live = ['broadcastStarted:starting', 'broadcastUpdated:active', 'broadcastEnded:complete'];
			const unreachable = ['broadcastStarted:starting', 'broadcastEnded:failed'];
			expect(webhooksOf(broadcastA.broadcastId)).toEqual(live);
			expect(webhooksOf(added.broadcastId)).toEqual(live);
			expect(webhooksOf(broadcastB.broadcastId)).toEqual(unreachable);
			expect(webhooksOf(retried.broadcastId)).toEqual(unreachable);
			expect(
				webhooks.find(
					({ event, data }) => event === 'broadcastEnded' && data.broadcastId === broadcastB.broadcastId
				)?.data.error
			).toEqual(expect.any(String));

			const delivered = JSON.stringify(webhooks);
			expect(delivered).not.toContain(sinkUrl.split('/').pop());
			expect(delivered).not.toContain('ov-stream-tag');
		});

		it('should stop an egress that streams the meeting without a broadcast of it', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a']));
			const { roomId } = roomData.room;

			await container
				.get(LiveKitService)
				.startRoomComposite(
					roomId,
					new StreamOutput({ protocol: StreamProtocol.RTMP, urls: [await createRtmpSink('lost')] }),
					{ layout: MeetRecordingLayout.GRID }
				);

			await waitForNoActiveEgress(roomId, 30_000);
			expect((await getBroadcasts(roomId)).body.broadcasts).toEqual([]);
		});

		it('should abort a broadcast stopped before any media reached its destination', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a']));
			const { roomId } = roomData.room;
			const { broadcast } = await startOne(roomId, { destinationId: (await roomDestinationIds(roomData))[0] });

			const stopIt = { broadcastIds: [broadcast.broadcastId] };
			const otherRoom = await setupSingleRoom(false, 'OTHER_ROOM');
			expectMeetError(
				await stopBroadcasts(otherRoom.room.roomId, stopIt),
				errorBroadcastNotFound(broadcast.broadcastId)
			);

			const stopped = await stopBroadcasts(roomId, stopIt);

			expect(stopped.status).toBe(200);
			const [aborted] = stopped.body.broadcasts;
			expect(aborted).toMatchObject({ status: MeetBroadcastStatus.ABORTED });
			expect(aborted.startDate).toBeUndefined();
			expect(aborted.endDate).toBeUndefined();
		});

		it('should gate stopping on broadcastControl', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a']));
			const { roomId } = roomData.room;
			const { broadcast } = await startOne(roomId, { destinationId: (await roomDestinationIds(roomData))[0] });

			expectMeetError(
				await stopBroadcasts(roomId, { broadcastIds: [broadcast.broadcastId] }, roomData.speakerToken),
				errorInsufficientPermissions()
			);
		});

		it('should end the broadcasts when the meeting ends', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a']));
			const { roomId } = roomData.room;
			await startBroadcasts(roomId);
			await waitForBroadcasts(roomId, (broadcasts) => broadcasts.length === 1, 'started');

			await disconnectFakeParticipants();

			await waitForBroadcasts(roomId, (broadcasts) => broadcasts.length === 0, 'ended with the meeting');
		});

		it('should stop a broadcast still starting when its room is deleted, leaving no egress behind', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a']));
			const { roomId } = roomData.room;
			await startBroadcasts(roomId);

			await deleteRoom(roomId, { withMeeting: 'force', withRecordings: 'force' });

			await waitForNoActiveEgress(roomId, 15_000);
		});
	});
});
