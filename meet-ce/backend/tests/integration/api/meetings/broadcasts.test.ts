import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import type {
	MeetBroadcastDestination,
	MeetBroadcastInfo,
	MeetMeetingInfo,
	MeetRoomConfig
} from '@openvidu-meet/typings';
import {
	MEET_BROADCAST_REDACTED_STREAM_KEY,
	MeetBroadcastDestinationSource,
	MeetBroadcastDestinationStatus,
	MeetBroadcastStatus,
	MeetRecordingLayout
} from '@openvidu-meet/typings';
import { Express } from 'express';
import request from 'supertest';
import { INTERNAL_CONFIG } from '../../../../src/config/internal-config.js';
import {
	errorBroadcastAlreadyStarted,
	errorBroadcastDestinationLimit,
	errorBroadcastDisabled,
	errorBroadcastNotFound,
	errorBroadcastRoomHasNoParticipants,
	errorInsufficientPermissions
} from '../../../../src/models/error.model.js';
import { expectMeetError } from '../../../helpers/assertion-helpers.js';
import { createRtmpSink, deleteRtmpSinks } from '../../../helpers/broadcast-sink.helper.js';
import { disconnectFakeParticipants, joinFakeParticipant } from '../../../helpers/livekit-cli-helpers.js';
import {
	addBroadcastDestination,
	deleteAllRooms,
	generateRoomMemberToken,
	getBroadcast,
	getBroadcasts,
	getFullPath,
	getRoomConfig,
	startBroadcast,
	startTestServer,
	stopBroadcast,
	updateBroadcastDestination,
	updateRoomRoles
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { waitForBroadcast, waitForMeetingToStart } from '../../../helpers/wait-helpers.js';
import { RoomData } from '../../../interfaces/scenarios.js';

const MEETINGS_PATH = getFullPath(`${INTERNAL_CONFIG.API_BASE_PATH_V1}/meetings`);

// A destination nothing listens on: the broadcast still starts, and a failed destination is a
// status like any other. The lifecycle test streams to a real sink alongside it.
const RTMP_HOST = 'rtmp://rtmp-sink.invalid:1935/live';
const destination = (key: string) => ({ name: `Destination ${key}`, url: `${RTMP_HOST}/${key}-stream-key` });
const REDACTED_URL = `${RTMP_HOST}/${MEET_BROADCAST_REDACTED_STREAM_KEY}`;

const broadcastConfig = (keys: string[]): Partial<MeetRoomConfig> => ({
	broadcast: { enabled: true, destinations: keys.map(destination) }
});

const isRunning = (broadcast?: MeetBroadcastInfo) =>
	broadcast?.status === MeetBroadcastStatus.ACTIVE || broadcast?.status === MeetBroadcastStatus.STARTING;

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
		it('should start a broadcast to every room destination with the moderator token', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a', 'b']));

			const response = await startBroadcast(roomData.room.roomId, {}, roomData.moderatorToken);

			expect(response.status).toBe(201);
			expect(response.headers.location).toContain(
				`/meetings/${roomData.room.roomId}/broadcasts/${response.body.broadcastId}`
			);
			const broadcast = response.body as MeetBroadcastInfo;
			expect(broadcast.status).toBe(MeetBroadcastStatus.STARTING);
			expect(broadcast.roomId).toBe(roomData.room.roomId);
			expect(broadcast.roomName).toBe('BROADCAST_ROOM');
			expect(broadcast.layout).toBe(MeetRecordingLayout.GRID);
			expect(broadcast.destinations).toEqual(
				(await roomDestinationIds(roomData)).map((id, index) => ({
					id,
					name: `Destination ${['a', 'b'][index]}`,
					url: REDACTED_URL,
					source: MeetBroadcastDestinationSource.ROOM,
					status: MeetBroadcastDestinationStatus.CONNECTING
				}))
			);
		});

		it('should stream to the chosen room destinations only, keeping the others stopped', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a', 'b']));
			const [, idB] = await roomDestinationIds(roomData);

			const response = await startBroadcast(roomData.room.roomId, { destinations: [{ id: idB }] });

			expect(response.status).toBe(201);
			expect(response.body.destinations.map((d: { status: string }) => d.status)).toEqual([
				MeetBroadcastDestinationStatus.STOPPED,
				MeetBroadcastDestinationStatus.CONNECTING
			]);
		});

		it('should change a room destination and add one for this meeting only, flagging both', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a']));
			const [idA] = await roomDestinationIds(roomData);

			const response = await startBroadcast(roomData.room.roomId, {
				destinations: [{ id: idA, name: 'A for this meeting' }, destination('extra')]
			});

			expect(response.status).toBe(201);
			expect(response.body.destinations).toEqual([
				expect.objectContaining({ id: idA, name: 'A for this meeting', source: 'room', edited: true }),
				expect.objectContaining({ name: 'Destination extra', url: REDACTED_URL, source: 'meeting' })
			]);
			expect(response.body.destinations[1].id).not.toBe(idA);
		});

		it('should report the broadcast as active in the meeting info and reject a second start', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a']));
			const { roomId } = roomData.room;
			await startBroadcast(roomId);

			const meeting = await request(app)
				.get(`${MEETINGS_PATH}/${roomId}`)
				.set(INTERNAL_CONFIG.ROOM_MEMBER_TOKEN_HEADER, roomData.moderatorToken);
			expect(meeting.status).toBe(200);
			expect((meeting.body as MeetMeetingInfo).broadcastActive).toBe(true);

			const second = await startBroadcast(roomId);
			expectMeetError(second, errorBroadcastAlreadyStarted(roomId));
		});

		it('should refuse to start when broadcast is disabled, the meeting has no participants or a destination is unknown', async () => {
			const disabledRoom = await setupMeetingRoom({ broadcast: { enabled: false, destinations: [] } });
			expectMeetError(
				await startBroadcast(disabledRoom.room.roomId),
				errorBroadcastDisabled(disabledRoom.room.roomId)
			);

			const idleRoom = await setupSingleRoom(false, 'IDLE', broadcastConfig(['a']));
			expectMeetError(
				await startBroadcast(idleRoom.room.roomId),
				errorBroadcastRoomHasNoParticipants(idleRoom.room.roomId)
			);

			const roomData = await setupMeetingRoom(broadcastConfig(['a']));
			const unknown = await startBroadcast(roomData.room.roomId, { destinations: [{ id: 'nope' }] });
			expect(unknown.status).toBe(422);
		});

		it('should require broadcastControl, and the destination permissions for extras and edits', async () => {
			// Roles are settled before the meeting starts, which is when they can still change.
			const roomData = await setupSingleRoom(false, 'BROADCAST_ROOM', broadcastConfig(['a']));
			const { roomId } = roomData.room;
			const rolesUpdate = await updateRoomRoles(roomId, {
				moderator: {
					permissions: {
						...roomData.room.roles.moderator.permissions,
						broadcastAddDestinations: false,
						broadcastEditDestinations: false
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

			expectMeetError(await startBroadcast(roomId, {}, speakerToken), errorInsufficientPermissions());
			expectMeetError(
				await startBroadcast(roomId, { destinations: [destination('extra')] }, moderatorWithoutExtras),
				errorInsufficientPermissions()
			);
			expectMeetError(
				await startBroadcast(roomId, { destinations: [{ id: idA, name: 'Renamed' }] }, moderatorWithoutExtras),
				errorInsufficientPermissions()
			);

			const allowed = await startBroadcast(roomId, { destinations: [{ id: idA }] }, moderatorWithoutExtras);
			expect(allowed.status).toBe(201);
		});
	});

	describe('Broadcast Lifecycle Tests', () => {
		it('should go active, report each destination, accept destination changes and end when stopped', async () => {
			const sinkUrl = await createRtmpSink('a');
			const roomData = await setupMeetingRoom({
				broadcast: { enabled: true, destinations: [{ name: 'Destination a', url: sinkUrl }, destination('b')] }
			});
			const { roomId } = roomData.room;
			const [idA, idB] = await roomDestinationIds(roomData);
			const { broadcastId } = (await startBroadcast(roomId)).body;

			const active = await waitForBroadcast(
				roomId,
				(broadcast) => broadcast?.status === MeetBroadcastStatus.ACTIVE,
				'went active'
			);
			expect(active?.broadcastId).toBe(broadcastId);
			// The reachable destination streams; the unreachable one fails on its own without taking
			// the broadcast down. The broadcast starts with the first destination that receives media.
			const streaming = await waitForBroadcast(
				roomId,
				(broadcast) =>
					broadcast?.destinations[0].status === MeetBroadcastDestinationStatus.ACTIVE &&
					broadcast.destinations[1].status === MeetBroadcastDestinationStatus.FAILED,
				'reported the sink as active and the unreachable destination as failed'
			);
			expect(streaming?.destinations[0].startDate).toBeGreaterThan(0);
			expect(streaming?.startDate).toBe(streaming?.destinations[0].startDate);
			expect(streaming?.destinations[1].error).toBeTruthy();

			const listed = await getBroadcasts(roomId, roomData.speakerToken);
			expect(listed.status).toBe(200);
			expect(listed.body.broadcasts).toHaveLength(1);
			expect(listed.body.broadcasts[0].broadcastId).toBe(broadcastId);
			const single = await getBroadcast(roomId, broadcastId, roomData.speakerToken);
			expect(single.status).toBe(200);
			expect(
				single.body.destinations.every((d: { url: string }) =>
					d.url.endsWith(`/${MEET_BROADCAST_REDACTED_STREAM_KEY}`)
				)
			).toBe(true);

			const retried = await updateBroadcastDestination(roomId, broadcastId, idB, { active: true });
			expect(retried.status).toBe(200);
			expect(retried.body.destinations[1].status).toBe(MeetBroadcastDestinationStatus.CONNECTING);

			const added = await addBroadcastDestination(
				roomId,
				broadcastId,
				{ name: 'Destination c', url: await createRtmpSink('c') },
				roomData.moderatorToken
			);
			expect(added.status).toBe(200);
			expect(added.body.destinations).toHaveLength(3);
			expect(added.body.destinations[2]).toMatchObject({
				source: 'meeting',
				status: 'connecting',
				url: expect.stringContaining(MEET_BROADCAST_REDACTED_STREAM_KEY)
			});
			await waitForBroadcast(
				roomId,
				(broadcast) => broadcast?.destinations[2].status === MeetBroadcastDestinationStatus.ACTIVE,
				'streamed to the destination added for this meeting'
			);

			const stoppedA = await updateBroadcastDestination(roomId, broadcastId, idA, { active: false });
			expect(stoppedA.status).toBe(200);
			expect(stoppedA.body.destinations[0].status).toBe(MeetBroadcastDestinationStatus.STOPPED);
			expect(stoppedA.body.status).toBe(MeetBroadcastStatus.ACTIVE);

			const stopped = await stopBroadcast(roomId, broadcastId, roomData.moderatorToken);
			expect(stopped.status).toBe(202);
			expect(stopped.body.status).toBe(MeetBroadcastStatus.ENDING);

			await waitForBroadcast(roomId, (broadcast) => broadcast === undefined, 'ended');
			expect((await getBroadcasts(roomId)).body.broadcasts).toEqual([]);
			expectMeetError(await stopBroadcast(roomId, broadcastId), errorBroadcastNotFound(broadcastId));
		});

		it('should cap a broadcast at five destinations and refuse a duplicate URL', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a', 'b', 'c', 'd']));
			const { roomId } = roomData.room;
			const { broadcastId } = (await startBroadcast(roomId)).body;

			expect((await addBroadcastDestination(roomId, broadcastId, destination('e'))).status).toBe(200);
			expectMeetError(
				await addBroadcastDestination(roomId, broadcastId, destination('f')),
				errorBroadcastDestinationLimit()
			);

			const duplicate = await addBroadcastDestination(roomId, broadcastId, destination('a'));
			expect(duplicate.status).toBe(422);
		});

		it('should gate destination changes on broadcastControl and adding on broadcastAddDestinations', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a']));
			const { roomId } = roomData.room;
			const [idA] = await roomDestinationIds(roomData);
			const { broadcastId } = (await startBroadcast(roomId)).body;

			expectMeetError(
				await updateBroadcastDestination(roomId, broadcastId, idA, { active: false }, roomData.speakerToken),
				errorInsufficientPermissions()
			);
			expectMeetError(
				await addBroadcastDestination(roomId, broadcastId, destination('x'), roomData.speakerToken),
				errorInsufficientPermissions()
			);
			expectMeetError(
				await stopBroadcast(roomId, broadcastId, roomData.speakerToken),
				errorInsufficientPermissions()
			);
		});

		it('should end the broadcast when the meeting ends', async () => {
			const roomData = await setupMeetingRoom(broadcastConfig(['a']));
			const { roomId } = roomData.room;
			await startBroadcast(roomId);
			await waitForBroadcast(roomId, isRunning, 'started');

			await disconnectFakeParticipants();

			await waitForBroadcast(roomId, (broadcast) => broadcast === undefined, 'ended with the meeting');
		});
	});
});
