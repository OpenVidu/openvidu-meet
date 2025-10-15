import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import ms from 'ms';
import { setInternalConfig } from '../../../../src/config/internal-config.js';
import { MeetRoomHelper } from '../../../../src/helpers/room.helper.js';
import {
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings
} from '@openvidu-meet/typings';
import {
	createRoom,
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	endMeeting,
	generateParticipantToken,
	getRoom,
	joinFakeParticipant,
	runRoomGarbageCollector,
	sleep,
	startRecording,
	startTestServer
} from '../../../helpers/request-helpers.js';

describe('Room Garbage Collector Tests', () => {
	beforeAll(() => {
		setInternalConfig({
			MIN_FUTURE_TIME_FOR_ROOM_AUTODELETION_DATE: '0s'
		});
		startTestServer();
	});

	afterAll(async () => {
		// Remove all rooms created
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllRecordings();
	});

	it('should delete a room with a past auto-deletion date if no active meeting', async () => {
		const createdRoom = await createRoom({
			roomName: 'test-gc',
			autoDeletionDate: Date.now() + ms('1s')
		});

		let response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(200);

		// Wait for auto-deletion date to pass
		await sleep('2s');

		// Run garbage collector
		await runRoomGarbageCollector();

		response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(404);
	});

	it('should schedule room to be deleted when expiration date has passed and there is a active meeting', async () => {
		const createdRoom = await createRoom({
			roomName: 'test-gc-participants',
			autoDeletionDate: Date.now() + ms('1s')
		});
		await joinFakeParticipant(createdRoom.roomId, 'test-participant');

		await runRoomGarbageCollector();

		// The room should not be deleted but scheduled for deletion
		const response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(200);
		expect(response.body).toHaveProperty('status', 'active_meeting');
		expect(response.body).toHaveProperty('meetingEndAction', 'delete');
	});

	it('should not touch a room with a future auto-deletion date', async () => {
		const createdRoom = await createRoom({
			roomName: 'test-gc-future',
			autoDeletionDate: Date.now() + ms('1h')
		});

		await runRoomGarbageCollector();

		const response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(200);
		expect(response.body).toHaveProperty('status', 'open');
		expect(response.body).toHaveProperty('meetingEndAction', 'none');
	});

	it('should delete a room scheduled for deletion when the the meeting ends', async () => {
		const room = await createRoom({
			roomName: 'test-gc-lifecycle',
			autoDeletionDate: Date.now() + ms('1s')
		});
		await joinFakeParticipant(room.roomId, 'test-participant');

		await runRoomGarbageCollector();

		// The room should not be deleted but scheduled for deletion
		let response = await getRoom(room.roomId);
		expect(response.status).toBe(200);
		expect(response.body).toHaveProperty('status', 'active_meeting');
		expect(response.body).toHaveProperty('meetingEndAction', 'delete');

		// End the meeting
		const { moderatorSecret } = MeetRoomHelper.extractSecretsFromRoom(room);
		const moderatorToken = await generateParticipantToken(room.roomId, moderatorSecret, 'moderator');
		await endMeeting(room.roomId, moderatorToken);

		// Verify that the room is deleted
		response = await getRoom(room.roomId);
		expect(response.status).toBe(404);
	});

	it('should never delete a room without an auto-deletion date', async () => {
		const createdRoom = await createRoom({
			roomName: 'test-gc-no-date'
		});

		await runRoomGarbageCollector();

		const response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(200);
		expect(response.body).toHaveProperty('status', 'open');
		expect(response.body).toHaveProperty('meetingEndAction', 'none');
	});

	it('should handle multiple expired rooms in one batch', async () => {
		const rooms = await Promise.all([
			createRoom({ roomName: 'test-gc-multi-1', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomName: 'test-gc-multi-2', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomName: 'test-gc-multi-3', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomName: 'test-gc-multi-4', autoDeletionDate: Date.now() + ms('1h') }),
			createRoom({ roomName: 'test-gc-multi-5', autoDeletionDate: Date.now() + ms('1h') }),
			createRoom({ roomName: 'test-gc-multi-6', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomName: 'test-gc-multi-7', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomName: 'test-gc-multi-8', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomName: 'test-gc-multi-9', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomName: 'test-gc-multi-10', autoDeletionDate: Date.now() + ms('1s') })
		]);

		// Make sure all rooms are expired
		await sleep('2s');

		await runRoomGarbageCollector();

		for (const room of rooms) {
			const response = await getRoom(room.roomId);

			if (room.autoDeletionDate! < Date.now()) {
				expect(response.status).toBe(404); // Should be deleted
			} else {
				expect(response.status).toBe(200); // Should still exist
			}
		}
	});

	it('should handle expired rooms correctly when specifying autoDeletionPolicy', async () => {
		// Create both rooms in parallel
		const [room1, room2] = await Promise.all([
			createRoom({
				roomName: 'test-gc-policy-1',
				autoDeletionDate: Date.now() + ms('1s'),
				autoDeletionPolicy: {
					withMeeting: MeetRoomDeletionPolicyWithMeeting.FORCE,
					withRecordings: MeetRoomDeletionPolicyWithRecordings.CLOSE
				}
			}),
			createRoom({
				roomName: 'test-gc-policy-2',
				autoDeletionDate: Date.now() + ms('1s'),
				autoDeletionPolicy: {
					withMeeting: MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS,
					withRecordings: MeetRoomDeletionPolicyWithRecordings.FORCE
				}
			})
		]);

		// Join participants
		await joinFakeParticipant(room1.roomId, 'participant1');
		await joinFakeParticipant(room2.roomId, 'participant2');

		// Start recording
		const { moderatorSecret } = MeetRoomHelper.extractSecretsFromRoom(room1);
		const moderatorToken = await generateParticipantToken(room1.roomId, moderatorSecret, 'moderator');
		await startRecording(room1.roomId, moderatorToken);

		await runRoomGarbageCollector();

		const response = await getRoom(room1.roomId);
		expect(response.status).toBe(200);
		expect(response.body).toHaveProperty('status', 'closed');
		expect(response.body).toHaveProperty('meetingEndAction', 'none');

		const response2 = await getRoom(room2.roomId);
		expect(response2.status).toBe(200);
		expect(response2.body).toHaveProperty('status', 'active_meeting');
		expect(response2.body).toHaveProperty('meetingEndAction', 'delete');
	});
});
