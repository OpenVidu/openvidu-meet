import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
	MeetingEndAction,
	MeetRoom,
	MeetRoomDeletionErrorCode,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomDeletionSuccessCode,
	MeetRoomStatus
} from '@openvidu-meet/typings';
import { expectValidRoom } from '../../../helpers/assertion-helpers.js';
import {
	bulkDeleteRooms,
	createRoom,
	deleteAllRecordings,
	deleteAllRooms,
	disconnectFakeParticipants,
	endMeeting,
	getRoom,
	startTestServer
} from '../../../helpers/request-helpers.js';
import { setupSingleRoom, setupSingleRoomWithRecording } from '../../../helpers/test-scenarios.js';

describe('Room API Tests', () => {
	beforeAll(async () => {
		await startTestServer();
	});

	afterAll(async () => {
		await disconnectFakeParticipants();
		await deleteAllRooms();
		await deleteAllRecordings();
	});

	describe('Bulk Delete Room Tests', () => {
		it('should return 200 when all rooms are processed for deletion successfully', async () => {
			const { roomId } = await createRoom();

			const response = await bulkDeleteRooms([roomId]);
			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				message: 'All rooms successfully processed for deletion',
				successful: expect.arrayContaining([
					{
						roomId,
						successCode: MeetRoomDeletionSuccessCode.ROOM_DELETED,
						message: expect.any(String)
					}
				])
			});
		});

		it('should return 400 when some rooms fail to process for deletion', async () => {
			const room1 = await createRoom();
			const { room: room2 } = await setupSingleRoom(true);

			const response = await bulkDeleteRooms([room1.roomId, room2.roomId]);
			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				message: '1 room(s) failed to process while deleting',
				successful: expect.arrayContaining([
					{
						roomId: room1.roomId,
						successCode: MeetRoomDeletionSuccessCode.ROOM_DELETED,
						message: expect.any(String)
					}
				]),
				failed: expect.arrayContaining([
					{
						roomId: room2.roomId,
						error: MeetRoomDeletionErrorCode.ROOM_HAS_ACTIVE_MEETING,
						message: expect.any(String)
					}
				])
			});
		});

		it('should return 400 when all rooms fail to process for deletion', async () => {
			const { room } = await setupSingleRoom(true);

			const response = await bulkDeleteRooms([room.roomId]);
			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				message: '1 room(s) failed to process while deleting',
				successful: [],
				failed: expect.arrayContaining([
					{
						roomId: room.roomId,
						error: MeetRoomDeletionErrorCode.ROOM_HAS_ACTIVE_MEETING,
						message: expect.any(String)
					}
				])
			});
		});

		it('should successfully delete the room requesting the same roomId multiple times', async () => {
			const { roomId } = await createRoom();

			const response = await bulkDeleteRooms([roomId, roomId, roomId]);
			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				message: 'All rooms successfully processed for deletion',
				successful: expect.arrayContaining([
					{
						roomId,
						successCode: MeetRoomDeletionSuccessCode.ROOM_DELETED,
						message: expect.any(String)
					}
				])
			});
		});

		it('should successfully delete valid roomIds while ignoring invalid ones', async () => {
			const { roomId } = await createRoom();

			const response = await bulkDeleteRooms([roomId, '!!@##$']);
			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				message: 'All rooms successfully processed for deletion',
				successful: expect.arrayContaining([
					{
						roomId,
						successCode: MeetRoomDeletionSuccessCode.ROOM_DELETED,
						message: expect.any(String)
					}
				])
			});
		});

		it('should handle a large number of room IDs', async () => {
			// Create 20 rooms
			const rooms = await Promise.all(
				Array.from({ length: 20 }, (_, i) => createRoom({ roomName: `bulk-${i}` }))
			);

			const response = await bulkDeleteRooms(rooms.map((r) => r.roomId));
			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				message: 'All rooms successfully processed for deletion',
				successful: expect.arrayContaining(
					rooms.map((room) => ({
						roomId: room.roomId,
						successCode: MeetRoomDeletionSuccessCode.ROOM_DELETED,
						message: expect.any(String)
					}))
				)
			});

			// Verify all rooms are deleted
			for (const room of rooms) {
				const getResponse = await getRoom(room.roomId);
				expect(getResponse.status).toBe(404);
			}
		});

		it('should handle deletion when specifying withMeeting and withRecordings parameters', async () => {
			const [room1, { room: room2 }, { room: room3 }, { room: room4, moderatorToken }] = await Promise.all([
				createRoom(), // Room without active meeting or recordings
				setupSingleRoom(true), // Room with active meeting
				setupSingleRoomWithRecording(true), // Room with active meeting and recordings
				setupSingleRoomWithRecording(true) // Room with recordings
			]);
			await endMeeting(room4.roomId, moderatorToken);
			const fakeRoomId = 'fakeRoomId'; // Non-existing room

			const response = await bulkDeleteRooms(
				[room1.roomId, room2.roomId, room3.roomId, room4.roomId, fakeRoomId],
				MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS,
				MeetRoomDeletionPolicyWithRecordings.CLOSE
			);
			expect(response.status).toBe(400);
			expect(response.body).toEqual({
				message: '1 room(s) failed to process while deleting',
				successful: expect.arrayContaining([
					{
						roomId: room1.roomId,
						successCode: MeetRoomDeletionSuccessCode.ROOM_DELETED,
						message: expect.any(String)
					},
					{
						roomId: room2.roomId,
						successCode: MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_SCHEDULED_TO_BE_DELETED,
						message: expect.any(String),
						room: expect.any(Object)
					},
					{
						roomId: room3.roomId,
						successCode: MeetRoomDeletionSuccessCode.ROOM_WITH_ACTIVE_MEETING_SCHEDULED_TO_BE_CLOSED,
						message: expect.any(String),
						room: expect.any(Object)
					},
					{
						roomId: room4.roomId,
						successCode: MeetRoomDeletionSuccessCode.ROOM_CLOSED,
						message: expect.any(String),
						room: expect.any(Object)
					}
				]),
				failed: expect.arrayContaining([
					{
						roomId: fakeRoomId,
						error: 'Room Error',
						message: expect.stringContaining('does not exist')
					}
				])
			});

			// Check successful rooms properties
			const successfulRoom2 = response.body.successful.find(
				(s: { roomId: string; successCode: MeetRoomDeletionSuccessCode; message: string; room?: MeetRoom }) =>
					s.room?.roomId === room2.roomId
			);
			expectValidRoom(
				successfulRoom2.room,
				successfulRoom2.room.roomName,
				undefined,
				undefined,
				undefined,
				MeetRoomStatus.ACTIVE_MEETING,
				MeetingEndAction.DELETE
			);
			const successfulRoom3 = response.body.successful.find(
				(r: { roomId: string; successCode: MeetRoomDeletionSuccessCode; message: string; room?: MeetRoom }) =>
					r.room?.roomId === room3.roomId
			);
			expectValidRoom(
				successfulRoom3.room,
				successfulRoom3.room.roomName,
				undefined,
				undefined,
				undefined,
				MeetRoomStatus.ACTIVE_MEETING,
				MeetingEndAction.CLOSE
			);
			const successfulRoom4 = response.body.successful.find(
				(r: { roomId: string; successCode: MeetRoomDeletionSuccessCode; message: string; room?: MeetRoom }) =>
					r.room?.roomId === room4.roomId
			);
			expectValidRoom(
				successfulRoom4.room,
				successfulRoom4.room.roomName,
				undefined,
				undefined,
				undefined,
				MeetRoomStatus.CLOSED,
				MeetingEndAction.NONE
			);
		});
	});

	describe('Bulk delete Room Validation failures', () => {
		it('should handle empty roomIds array (no rooms deleted)', async () => {
			const response = await bulkDeleteRooms([]);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain(
				'At least one valid roomId is required after sanitization'
			);
		});
		it('should fail when roomIds contains an ID that becomes empty after sanitization', async () => {
			const response = await bulkDeleteRooms([',,,,']);

			expect(response.status).toBe(422);

			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain(
				'At least one valid roomId is required after sanitization'
			);
		});

		it('should validate roomIds and return 422 when all are invalid', async () => {
			const response = await bulkDeleteRooms(['!!@##$', '!!@##$', ',', '.,-------}{¡$#<+']);

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain(
				'At least one valid roomId is required after sanitization'
			);
		});

		it('should fail when withMeeting parameter is invalid', async () => {
			const response = await bulkDeleteRooms(['testRoom'], 'invalid_value');

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('Invalid enum value');
		});

		it('should fail when withRecordings parameter is invalid', async () => {
			const response = await bulkDeleteRooms(['testRoom'], 'force', 'invalid_value');

			expect(response.status).toBe(422);
			expect(response.body.error).toContain('Unprocessable Entity');
			expect(JSON.stringify(response.body.details)).toContain('Invalid enum value');
		});
	});
});
