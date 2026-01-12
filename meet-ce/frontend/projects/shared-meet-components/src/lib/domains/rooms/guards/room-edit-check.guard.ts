import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MeetRoomStatus } from '@openvidu-meet/typings';
import { RoomService } from '../services';

/**
 * Guard that prevents editing a room when there's an active meeting.
 * Redirects to /rooms if the room has an active meeting.
 */
export const checkEditableRoomGuard: CanActivateFn = async (route) => {
	const roomService = inject(RoomService);
	const router = inject(Router);

	const roomId = route.paramMap.get('roomId');

	if (!roomId) {
		console.warn('No roomId provided in route params');
		router.navigate(['/rooms']);
		return false;
	}

	try {
		const room = await roomService.getRoom(roomId);

		if (room.status === MeetRoomStatus.ACTIVE_MEETING) {
			console.warn(`Cannot edit room ${roomId} - active meeting in progress`);
			router.navigate(['/rooms']);
			return false;
		}

		return true;
	} catch (error) {
		console.error(`Error checking room status for ${roomId}:`, error);
		router.navigate(['/rooms']);
		return false;
	}
};
