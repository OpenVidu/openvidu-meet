import { MeetingEndAction, MeetRoom, MeetRoomStatus } from '@openvidu-meet/typings';

/**
 * Utility functions for Room-related UI operations.
 * These are pure functions that can be used across components and pages.
 */
export class RoomUiUtils {
	// ===== STATUS UTILITIES =====

	/**
	 * Gets the display text for a room status
	 */
	static getStatusLabel(room: MeetRoom): string {
		return room.status.toUpperCase().replace(/_/g, ' ');
	}

	/**
	 * Gets the Material icon name for a room status
	 */
	static getStatusIcon(room: MeetRoom): string {
		switch (room.status) {
			case MeetRoomStatus.OPEN:
				return 'meeting_room';
			case MeetRoomStatus.ACTIVE_MEETING:
				return 'videocam';
			case MeetRoomStatus.CLOSED:
				return 'lock';
		}
	}

	/**
	 * Gets the tooltip text for a room status
	 */
	static getStatusTooltip(room: MeetRoom): string {
		switch (room.status) {
			case MeetRoomStatus.OPEN:
				return 'Room is open and ready to accept participants';
			case MeetRoomStatus.ACTIVE_MEETING:
				return 'A meeting is currently ongoing in this room';
			case MeetRoomStatus.CLOSED:
				return 'Room is closed and not accepting participants';
		}
	}

	/**
	 * Gets the CSS color variable for a room status
	 */
	static getStatusColor(room: MeetRoom): string {
		switch (room.status) {
			case MeetRoomStatus.OPEN:
				return 'var(--ov-meet-color-success)';
			case MeetRoomStatus.ACTIVE_MEETING:
				return 'var(--ov-meet-color-primary)';
			case MeetRoomStatus.CLOSED:
				return 'var(--ov-meet-color-warning)';
			default:
				return 'var(--ov-meet-color-text-secondary)';
		}
	}

	/**
	 * Checks if a room is currently active (has an ongoing meeting)
	 */
	static isActive(room: MeetRoom): boolean {
		return room.status === MeetRoomStatus.ACTIVE_MEETING;
	}

	/**
	 * Checks if a room is closed
	 */
	static isClosed(room: MeetRoom): boolean {
		return room.status === MeetRoomStatus.CLOSED;
	}

	/**
	 * Checks if a room is open
	 */
	static isOpen(room: MeetRoom): boolean {
		return room.status === MeetRoomStatus.OPEN;
	}

	// ===== MEETING END ACTION UTILITIES =====

	/**
	 * Checks if a room has a meeting end action configured
	 */
	static hasMeetingEndAction(room: MeetRoom): boolean {
		return room.status === MeetRoomStatus.ACTIVE_MEETING && room.meetingEndAction !== MeetingEndAction.NONE;
	}

	/**
	 * Gets the tooltip text for a meeting end action
	 */
	static getMeetingEndActionTooltip(room: MeetRoom): string {
		switch (room.meetingEndAction) {
			case MeetingEndAction.CLOSE:
				return 'The room will be closed when the meeting ends';
			case MeetingEndAction.DELETE:
				return 'The room and its recordings will be deleted when the meeting ends';
			default:
				return '';
		}
	}

	/**
	 * Gets the CSS class name for a meeting end action
	 */
	static getMeetingEndActionClass(room: MeetRoom): string {
		switch (room.meetingEndAction) {
			case MeetingEndAction.CLOSE:
				return 'meeting-end-close';
			case MeetingEndAction.DELETE:
				return 'meeting-end-delete';
			default:
				return '';
		}
	}

	// ===== AUTO-DELETION UTILITIES =====

	/**
	 * Checks if a room has auto-deletion configured
	 */
	static hasAutoDeletion(room: MeetRoom): boolean {
		return !!room.autoDeletionDate;
	}

	/**
	 * Checks if a room's auto-deletion date has expired
	 */
	static isAutoDeletionExpired(room: MeetRoom): boolean {
		if (!room.autoDeletionDate) return false;

		// Check if auto-deletion date is more than 1 hour in the past
		const oneHourAgo = Date.now() - 60 * 60 * 1000;
		return room.autoDeletionDate < oneHourAgo;
	}

	/**
	 * Gets the status text for auto-deletion
	 */
	static getAutoDeletionStatus(room: MeetRoom): string {
		if (!room.autoDeletionDate) {
			return 'DISABLED';
		}

		return RoomUiUtils.isAutoDeletionExpired(room) ? 'EXPIRED' : 'SCHEDULED';
	}

	/**
	 * Gets the Material icon name for auto-deletion status
	 */
	static getAutoDeletionIcon(room: MeetRoom): string {
		if (!room.autoDeletionDate) {
			return 'close';
		}

		return RoomUiUtils.isAutoDeletionExpired(room) ? 'warning' : 'auto_delete';
	}

	/**
	 * Gets the tooltip text for auto-deletion status
	 */
	static getAutoDeletionTooltip(room: MeetRoom): string {
		if (!room.autoDeletionDate) {
			return 'No auto-deletion. Room remains until manually deleted';
		}

		if (RoomUiUtils.isAutoDeletionExpired(room)) {
			return 'Auto-deletion date has passed but room was not deleted due to auto-deletion policy';
		}

		return 'Auto-deletion scheduled';
	}

	/**
	 * Gets the CSS class name for auto-deletion status
	 */
	static getAutoDeletionClass(room: MeetRoom): string {
		if (!room.autoDeletionDate) {
			return 'auto-deletion-disabled';
		}

		return RoomUiUtils.isAutoDeletionExpired(room) ? 'auto-deletion-expired' : 'auto-deletion-scheduled';
	}

	// ===== ROOM TOGGLE UTILITIES =====

	/**
	 * Gets the icon for toggling room status (open/close)
	 */
	static getRoomToggleIcon(room: MeetRoom): string {
		return room.status !== MeetRoomStatus.CLOSED ? 'lock' : 'meeting_room';
	}

	/**
	 * Gets the label for toggling room status (open/close)
	 */
	static getRoomToggleLabel(room: MeetRoom): string {
		return room.status !== MeetRoomStatus.CLOSED ? 'Close Room' : 'Open Room';
	}

	static getRoomToggleTooltip(room: MeetRoom): string {
		return room.status !== MeetRoomStatus.CLOSED ? 'Close room' : 'Open room to allow participants to join';
	}

	/**
	 * Gets the CSS class for the room toggle action
	 */
	static getRoomToggleClass(room: MeetRoom): string {
		return room.status !== MeetRoomStatus.CLOSED ? 'close-action' : 'open-action';
	}

	// ===== PERMISSION/CAPABILITY UTILITIES =====

	/**
	 * Checks if a room can be joined
	 */
	static canJoinRoom(room: MeetRoom): boolean {
		return !RoomUiUtils.isClosed(room);
	}

	/**
	 * Gets the tooltip text for the join room action
	 */
	static getJoinRoomTooltip(room: MeetRoom): string {
		if (!RoomUiUtils.canJoinRoom(room)) {
			return 'Room is closed. Reopen the room to allow participants to join';
		}

		return 'Join room';
	}

	/**
	 * Checks if the access link can be copied for a room
	 */
	static canCopyAccessLink(room: MeetRoom): boolean {
		return !RoomUiUtils.isClosed(room);
	}

	/**
	 * Gets the tooltip text for the copy access link action
	 */
	static getCopyAccessLinkTooltip(room: MeetRoom): string {
		if (!RoomUiUtils.canCopyAccessLink(room)) {
			return 'Room is closed. Reopen the room to allow copying the access link';
		}

		return 'Copy access link';
	}

	/**
	 * Checks if a room can be edited
	 */
	static canEditRoom(room: MeetRoom): boolean {
		return !RoomUiUtils.isActive(room);
	}

	/**
	 * Gets the tooltip text for the edit room action
	 */
	static getEditRoomTooltip(room: MeetRoom): string {
		if (!RoomUiUtils.canEditRoom(room)) {
			return 'Room is active. Editing is disabled during an active meeting';
		}

		return 'Edit room details';
	}

	// ==== OTHER UTILITIES =====

	/**
	 * Gets the owner initial from a room
	 */
	static getOwnerInitials(room: MeetRoom): string {
		return room.owner.substring(0, 1).toUpperCase();
	}
}
