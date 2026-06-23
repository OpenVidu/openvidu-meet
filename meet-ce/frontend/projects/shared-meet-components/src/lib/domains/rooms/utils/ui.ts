import { MeetingEndAction, MeetRoom, MeetRoomStatus, MeetUserRole } from '@openvidu-meet/typings';

/**
 * Utility functions for Room-related UI operations.
 * These are pure functions that can be used across components and pages.
 */
export class RoomUiUtils {
	// ===== STATUS UTILITIES =====

	/**
	 * Gets the i18n key for a room status label (resolve with the `translate` pipe at render).
	 */
	static getStatusLabel(room: MeetRoom): string {
		switch (room.status) {
			case MeetRoomStatus.OPEN:
				return 'ROOMS.UI.STATUS.OPEN';
			case MeetRoomStatus.ACTIVE_MEETING:
				return 'ROOMS.UI.STATUS.ACTIVE_MEETING';
			case MeetRoomStatus.CLOSED:
				return 'ROOMS.UI.STATUS.CLOSED';
			default:
				return room.status;
		}
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
				return 'ROOMS.UI.STATUS_TOOLTIP.OPEN';
			case MeetRoomStatus.ACTIVE_MEETING:
				return 'ROOMS.UI.STATUS_TOOLTIP.ACTIVE_MEETING';
			case MeetRoomStatus.CLOSED:
				return 'ROOMS.UI.STATUS_TOOLTIP.CLOSED';
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
				return 'ROOMS.UI.MEETING_END_TOOLTIP.CLOSE';
			case MeetingEndAction.DELETE:
				return 'ROOMS.UI.MEETING_END_TOOLTIP.DELETE';
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
			return 'ROOMS.UI.AUTO_DELETION_STATUS.DISABLED';
		}

		return RoomUiUtils.isAutoDeletionExpired(room)
			? 'ROOMS.UI.AUTO_DELETION_STATUS.EXPIRED'
			: 'ROOMS.UI.AUTO_DELETION_STATUS.SCHEDULED';
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
			return 'ROOMS.UI.AUTO_DELETION_TOOLTIP.NONE';
		}

		if (RoomUiUtils.isAutoDeletionExpired(room)) {
			return 'ROOMS.UI.AUTO_DELETION_TOOLTIP.EXPIRED';
		}

		return 'ROOMS.UI.AUTO_DELETION_TOOLTIP.SCHEDULED';
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
		return room.status !== MeetRoomStatus.CLOSED ? 'ROOMS.UI.TOGGLE.CLOSE_LABEL' : 'ROOMS.UI.TOGGLE.OPEN_LABEL';
	}

	static getRoomToggleTooltip(room: MeetRoom): string {
		return room.status !== MeetRoomStatus.CLOSED
			? 'ROOMS.UI.TOGGLE.CLOSE_TOOLTIP'
			: 'ROOMS.UI.TOGGLE.OPEN_TOOLTIP';
	}

	/**
	 * Gets the CSS class for the room toggle action
	 */
	static getRoomToggleClass(room: MeetRoom): string {
		return room.status !== MeetRoomStatus.CLOSED ? 'close-action' : 'open-action';
	}

	// ===== PERMISSION/CAPABILITY UTILITIES =====

	/**
	 * Checks if a room can be accessed
	 */
	static canAccessRoom(room: MeetRoom): boolean {
		return !RoomUiUtils.isClosed(room);
	}

	/**
	 * Gets the tooltip text for the access room action
	 */
	static getAccessRoomTooltip(room: MeetRoom): string {
		if (!RoomUiUtils.canAccessRoom(room)) {
			return 'ROOMS.UI.ACCESS_TOOLTIP.CLOSED';
		}

		return 'ROOMS.UI.ACCESS_TOOLTIP.OPEN';
	}

	/**
	 * Checks if the access links can be shared for a room
	 */
	static canShareAccessLinks(room: MeetRoom): boolean {
		return !RoomUiUtils.isClosed(room);
	}

	/**
	 * Checks if a room has access links available to be shared
	 */
	static hasAccessLinks(room: MeetRoom): boolean {
		return !!room.access.anonymous.moderator.url || !!room.access.anonymous.speaker.url;
	}

	/**
	 * Gets the tooltip text for the share access links action
	 */
	static getShareAccessLinksTooltip(room: MeetRoom): string {
		if (!RoomUiUtils.canShareAccessLinks(room)) {
			return 'ROOMS.UI.SHARE_TOOLTIP.CLOSED';
		}

		return 'ROOMS.UI.SHARE_TOOLTIP.OPEN';
	}

	/**
	 * Checks if a room can be managed (edited/deleted) by the current user
	 */
	static canManageRoom(room: MeetRoom, currentUserId: string, currentUserRole?: MeetUserRole): boolean {
		return currentUserRole === MeetUserRole.ADMIN || room.owner === currentUserId;
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
			return 'ROOMS.UI.EDIT_TOOLTIP.ACTIVE';
		}

		return 'ROOMS.UI.EDIT_TOOLTIP.DEFAULT';
	}

	// ==== OTHER UTILITIES =====

	/**
	 * Gets the owner initial from a room
	 */
	static getOwnerInitials(room: MeetRoom): string {
		return room.owner.substring(0, 1).toUpperCase();
	}
}
