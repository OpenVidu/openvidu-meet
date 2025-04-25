import { afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import ms from 'ms';
import { setInternalConfig } from '../../../../src/config/internal-config.js';
import {
	createRoom,
	deleteAllRooms,
	disconnectFakeParticipants,
	getRoom,
	getRooms,
	joinFakeParticipant,
	runRoomGarbageCollector,
	sleep,
	startTestServer
} from '../../../utils/helpers.js';

describe('Room Garbage Collector Tests', () => {
	beforeAll(() => {
		setInternalConfig({
			MIN_FUTURE_TIME_FOR_ROOM_AUTODELETION_DATE: '0s'
		});
		startTestServer();
	});

	afterEach(async () => {
		// Remove all rooms created
		await deleteAllRooms();
	});

	it('should delete a room with a past auto-deletion date if no participant is present', async () => {
		const createdRoom = await createRoom({
			roomIdPrefix: 'test-gc',
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

	it('should mark room for deletion but not delete when expiration date has passed and participants exist', async () => {
		const createdRoom = await createRoom({
			roomIdPrefix: 'test-gc-participants',
			autoDeletionDate: Date.now() + ms('1s')
		});

		await joinFakeParticipant(createdRoom.roomId, 'test-participant');

		await runRoomGarbageCollector();

		// The room should not be deleted but marked for deletion
		const response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(200);
		expect(response.body.markedForDeletion).toBe(true);
	});

	it('should not touch a room with a future auto-deletion date', async () => {
		const createdRoom = await createRoom({
			roomIdPrefix: 'test-gc-future',
			autoDeletionDate: Date.now() + ms('1h')
		});

		await runRoomGarbageCollector();

		const response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(200);
		expect(response.body.markedForDeletion).toBeFalsy();
	});

	it('should delete a room after the last participant leaves when it was marked for deletion', async () => {
		const createdRoom = await createRoom({
			roomIdPrefix: 'test-gc-lifecycle',
			autoDeletionDate: Date.now() + ms('1s')
		});

		await joinFakeParticipant(createdRoom.roomId, 'test-participant');

		// Wait for the auto-deletion date to pass
		await sleep('1s');

		// Should mark the room for deletion but not delete it yet
		await runRoomGarbageCollector();

		let response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(200);
		expect(response.body.markedForDeletion).toBe(true);
		expect(response.body.autoDeletionDate).toBeTruthy();
		expect(response.body.autoDeletionDate).toBeLessThan(Date.now());

		await disconnectFakeParticipants();

		// Wait to receive webhook room_finished
		await sleep('4s');

		// Verify that the room is deleted
		response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(404);
	});

	it('should never delete a room without an auto-deletion date', async () => {
		const createdRoom = await createRoom({
			roomIdPrefix: 'test-gc-no-date'
		});

		await runRoomGarbageCollector();

		let response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(200);

		await runRoomGarbageCollector();
		response = await getRoom(createdRoom.roomId);
		expect(response.status).toBe(200);
		expect(response.body.markedForDeletion).toBeFalsy();
		expect(response.body.autoDeletionDate).toBeFalsy();
	});

	it('should handle multiple expired rooms in one batch', async () => {
		const rooms = await Promise.all([
			createRoom({ roomIdPrefix: 'test-gc-multi-1', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomIdPrefix: 'test-gc-multi-2', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomIdPrefix: 'test-gc-multi-3', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomIdPrefix: 'test-gc-multi-4', autoDeletionDate: Date.now() + ms('1h') }),
			createRoom({ roomIdPrefix: 'test-gc-multi-5', autoDeletionDate: Date.now() + ms('1h') }),
			createRoom({ roomIdPrefix: 'test-gc-multi-6', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomIdPrefix: 'test-gc-multi-7', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomIdPrefix: 'test-gc-multi-8', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomIdPrefix: 'test-gc-multi-9', autoDeletionDate: Date.now() + ms('1s') }),
			createRoom({ roomIdPrefix: 'test-gc-multi-10', autoDeletionDate: Date.now() + ms('1s') })
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

		const response = await getRooms();
		const { body } = response;

		expect(response.status).toBe(200);
		expect(body.rooms.length).toBe(2); // Only 2 rooms should remain
	});
});
