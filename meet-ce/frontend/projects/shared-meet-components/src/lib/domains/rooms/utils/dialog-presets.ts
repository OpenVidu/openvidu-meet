import type { DialogPreset } from '../../../shared/models/notification.model';

export const deleteRoomDialogPreset = (roomId: string): DialogPreset => ({
	title: 'Delete Room',
	icon: 'delete_outline',
	message: `Are you sure you want to delete the room <b>${roomId}</b>?`,
	confirmText: 'Delete',
	cancelText: 'Cancel'
});

export const bulkDeleteRoomsDialogPreset = (count: number): DialogPreset => ({
	title: 'Delete Rooms',
	icon: 'delete_outline',
	message: `Are you sure you want to delete <b>${count}</b> rooms?`,
	confirmText: 'Delete',
	cancelText: 'Cancel'
});

export const removeMemberDialogPreset = (memberName: string, showMeetingKickWarning: boolean): DialogPreset => ({
	title: 'Remove Member',
	icon: 'person_remove',
	message: `Are you sure you want to remove <b>${memberName}</b> from this room?`,
	showWarningBox: showMeetingKickWarning,
	warningTitle: 'Active meeting warning',
	warningMessage: 'If this user is currently in the meeting, they will be kicked immediately.',
	confirmText: 'Remove',
	cancelText: 'Cancel'
});

export const bulkRemoveMembersDialogPreset = (count: number, showMeetingKickWarning: boolean): DialogPreset => ({
	title: 'Remove Members',
	icon: 'group_remove',
	message: `Are you sure you want to remove <b>${count} member${count > 1 ? 's' : ''}</b> from this room?`,
	showWarningBox: showMeetingKickWarning,
	warningTitle: 'Active meeting warning',
	warningMessage: 'Members currently in the meeting will be kicked immediately.',
	confirmText: 'Remove',
	cancelText: 'Cancel'
});
