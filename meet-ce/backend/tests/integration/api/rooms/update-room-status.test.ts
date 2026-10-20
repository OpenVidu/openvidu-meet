import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { MeetRoomDeletionPolicyWithMeeting, MeetRoomStatus } from '@openvidu-meet/typings';
import { container } from '../../../../src/config/dependency-injector.config.js';
import { RoomScheduledTasksService } from '../../../../src/services/room-scheduled-tasks.service.js';
import { WebhookDispatcherService } from '../../../../src/services/webhook-dispatcher.service.js';
import { disconnectFakeParticipants } from '../../../helpers/livekit-cli-helpers.js';
import {
	createRoom,
	deleteAllRooms,
	deleteRoom,
	endMeeting,
	getRoom,
	startTestServer,
	updateRoomStatus
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom } from '../../../helpers/test-scenarios.js';
import { waitForMeetingToEnd, waitForRoomToClose, waitForRoomToDelete } from '../../../helpers/wait-helpers.js';

describe('Room API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterEach(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
	});

	describe('Update Room Status Tests', () => {
		it('should successfully update room status to open', async () => {
			const createdRoom = await createRoom({
				roomName: 'update-test'
			});

			// Update the room status
			const response = await updateRoomStatus(createdRoom.roomId, MeetRoomStatus.OPEN);
			expect(response.status).toBe(200);
			expect(response.body.roomId).toBe(createdRoom.roomId);
			expect(response.body.status).toEqual('open');

			// Verify with a get request
			const getResponse = await getRoom(createdRoom.roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.status).toEqual('open');
		});

		it('should successfully update room status to closed', async () => {
			const createdRoom = await createRoom({
				roomName: 'update-test'
			});

			// Update the room status
			const response = await updateRoomStatus(createdRoom.roomId, MeetRoomStatus.CLOSED);
			expect(response.status).toBe(200);
			expect(response.body.roomId).toBe(createdRoom.roomId);
			expect(response.body.status).toEqual('closed');

			// Verify with a get request
			const getResponse = await getRoom(createdRoom.roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.status).toEqual('closed');
		});

		it('should schedule room to be closed when meeting ends if there is an active meeting', async () => {
			const roomData = await setupSingleRoom(true);

			// Update the room status
			const response = await updateRoomStatus(roomData.room.roomId, MeetRoomStatus.CLOSED);
			expect(response.status).toBe(202);
			expect(response.body.status).toEqual('active_meeting');
			expect(response.body.meetingEndAction).toEqual('close');

			// Verify with a get request
			let getResponse = await getRoom(roomData.room.roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.status).toEqual('active_meeting');
			expect(getResponse.body.meetingEndAction).toEqual('close');

			// End meeting and verify closed status
			await endMeeting(roomData.room.roomId, roomData.moderatorToken);
			await waitForRoomToClose(roomData.room.roomId);
			getResponse = await getRoom(roomData.room.roomId);
			expect(getResponse.status).toBe(200);
			expect(getResponse.body.status).toEqual('closed');
			expect(getResponse.body.meetingEndAction).toEqual('none');
		});

		it('should cancel a scheduled close when reopened during the meeting, which stays active', async () => {
			const roomData = await setupSingleRoom(true);
			const { roomId } = roomData.room;
			expect((await updateRoomStatus(roomId, MeetRoomStatus.CLOSED)).status).toBe(202);

			const response = await updateRoomStatus(roomId, MeetRoomStatus.OPEN);
			expect(response.status).toBe(200);
			expect(response.body.status).toEqual('active_meeting');
			expect(response.body.meetingEndAction).toEqual('none');

			// The reconciliation of open rooms with a live meeting no longer finds it
			const sendMeetingStarted = jest.spyOn(container.get(WebhookDispatcherService), 'sendMeetingStartedWebhook');
			await container.get(RoomScheduledTasksService)['reconcileOpenRoomsGC']();
			expect(sendMeetingStarted).not.toHaveBeenCalled();
			sendMeetingStarted.mockRestore();

			await endMeeting(roomId, roomData.moderatorToken);
			await waitForMeetingToEnd(roomId);
			const getResponse = await getRoom(roomId);
			expect(getResponse.body.status).toEqual('open');
		});

		it('should keep a scheduled deletion when closed during the meeting', async () => {
			const roomData = await setupSingleRoom(true);
			const { roomId } = roomData.room;
			await deleteRoom(roomId, { withMeeting: MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS });

			const response = await updateRoomStatus(roomId, MeetRoomStatus.CLOSED);
			expect(response.status).toBe(202);
			expect(response.body.status).toEqual('active_meeting');
			expect(response.body.meetingEndAction).toEqual('delete');

			await endMeeting(roomId, roomData.moderatorToken);
			await waitForRoomToDelete(roomId);
			expect((await getRoom(roomId)).status).toBe(404);
		});

		it('should refuse to reopen a room scheduled for deletion and leave it unchanged', async () => {
			const roomData = await setupSingleRoom(true);
			const { roomId } = roomData.room;
			await deleteRoom(roomId, { withMeeting: MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS });

			const response = await updateRoomStatus(roomId, MeetRoomStatus.OPEN);
			expect(response.status).toBe(409);

			const getResponse = await getRoom(roomId);
			expect(getResponse.body.status).toEqual('active_meeting');
			expect(getResponse.body.meetingEndAction).toEqual('delete');
		});

		it('should fail with 404 when updating non-existent room', async () => {
			const nonExistentRoomId = 'non-existent-room';

			const response = await updateRoomStatus(nonExistentRoomId, MeetRoomStatus.CLOSED);

			expect(response.status).toBe(404);
			expect(response.body.message).toContain(`'${nonExistentRoomId}' does not exist`);
		});
	});

	describe('Update Room Status Field Filtering Tests', () => {
		it('should exclude config and roles by default and advertise them in _extraFields', async () => {
			const createdRoom = await createRoom({ roomName: 'status-fields-default' });

			const response = await updateRoomStatus(createdRoom.roomId, MeetRoomStatus.CLOSED);

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('roomId', createdRoom.roomId);
			expect(response.body).toHaveProperty('status', 'closed');
			expect(response.body).not.toHaveProperty('config');
			expect(response.body).not.toHaveProperty('roles');
			expect(response.body._extraFields).toEqual(expect.arrayContaining(['config', 'roles']));
		});

		it('should return only the requested fields via the X-Fields header', async () => {
			const createdRoom = await createRoom({ roomName: 'status-fields-header' });

			const response = await updateRoomStatus(createdRoom.roomId, MeetRoomStatus.CLOSED, {
				xFields: 'roomId,status'
			});

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('roomId', createdRoom.roomId);
			expect(response.body).toHaveProperty('status', 'closed');
			expect(response.body).not.toHaveProperty('roomName');
		});

		it('should include config and roles when requested via the X-ExtraFields header', async () => {
			const createdRoom = await createRoom({ roomName: 'status-extrafields-header' });

			const response = await updateRoomStatus(createdRoom.roomId, MeetRoomStatus.CLOSED, {
				xExtraFields: 'config,roles'
			});

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('config');
			expect(response.body).toHaveProperty('roles');
		});
	});

	describe('Update Room Status Validation failures', () => {
		let roomId: string;

		beforeAll(async () => {
			const room = await createRoom();
			roomId = room.roomId;
		});

		it('should fail when status is invalid', async () => {
			const response = await updateRoomStatus(roomId, 'invalid_status' as MeetRoomStatus);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('Invalid enum value');
		});

		it('should fail when status is active_meeting', async () => {
			const response = await updateRoomStatus(roomId, MeetRoomStatus.ACTIVE_MEETING);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain("Invalid enum value. Expected 'open' | 'closed'");
		});
	});
});
