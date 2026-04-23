import { Injectable } from '@angular/core';
import { DialogOptions } from '../models/notification.model';

export type DialogPreset = Omit<DialogOptions, 'confirmCallback' | 'cancelCallback'>;

@Injectable({
	providedIn: 'root'
})
export class DialogPresetsService {
	getDeleteUserDialogPreset(name: string, userId: string): DialogPreset {
		return {
			title: 'Delete User',
			icon: 'delete_forever',
			message: `Are you sure you want to permanently delete user <b>${name}</b> (${userId})? This action cannot be undone.`,
			showWarningBox: true,
			warningTitle: 'Important consequences',
			warningMessage: `If the user owns rooms, ownership will be transferred to the root admin. 
            If the user is currently in a meeting, they will be kicked from it immediately.`,
			confirmText: 'Delete',
			cancelText: 'Cancel'
		};
	}

	getBulkDeleteUsersDialogPreset(count: number): DialogPreset {
		return {
			title: 'Delete Users',
			icon: 'delete_forever',
			message: `Are you sure you want to permanently delete <b>${count} user${count > 1 ? 's' : ''}</b>? This action cannot be undone.`,
			showWarningBox: true,
			warningTitle: 'Important consequences',
			warningMessage: `If deleted users own rooms, ownership will be transferred to the root admin. 
            Users currently in a meeting will be kicked from it immediately.`,
			confirmText: 'Delete',
			cancelText: 'Cancel'
		};
	}

	getDeleteRoomDialogPreset(roomId: string): DialogPreset {
		return {
			title: 'Delete Room',
			icon: 'delete_outline',
			message: `Are you sure you want to delete the room <b>${roomId}</b>?`,
			confirmText: 'Delete',
			cancelText: 'Cancel'
		};
	}

	getBulkDeleteRoomsDialogPreset(count: number): DialogPreset {
		return {
			title: 'Delete Rooms',
			icon: 'delete_outline',
			message: `Are you sure you want to delete <b>${count}</b> rooms?`,
			confirmText: 'Delete',
			cancelText: 'Cancel'
		};
	}

	getRemoveMemberDialogPreset(memberName: string, showMeetingKickWarning: boolean): DialogPreset {
		return {
			title: 'Remove Member',
			icon: 'person_remove',
			message: `Are you sure you want to remove <b>${memberName}</b> from this room?`,
			showWarningBox: showMeetingKickWarning,
			warningTitle: 'Active meeting warning',
			warningMessage: 'If this user is currently in the meeting, they will be kicked immediately.',
			confirmText: 'Remove',
			cancelText: 'Cancel'
		};
	}

	getBulkRemoveMembersDialogPreset(count: number, showMeetingKickWarning: boolean): DialogPreset {
		return {
			title: 'Remove Members',
			icon: 'group_remove',
			message: `Are you sure you want to remove <b>${count} member${count > 1 ? 's' : ''}</b> from this room?`,
			showWarningBox: showMeetingKickWarning,
			warningTitle: 'Active meeting warning',
			warningMessage: 'Members currently in the meeting will be kicked immediately.',
			confirmText: 'Remove',
			cancelText: 'Cancel'
		};
	}

	getDeleteRecordingDialogPreset(recordingId: string): DialogPreset {
		return {
			title: 'Delete Recording',
			icon: 'delete_forever',
			message: `Are you sure you want to permanently delete the recording <b>${recordingId}</b>? This action cannot be undone.`,
			confirmText: 'Delete',
			cancelText: 'Cancel'
		};
	}

	getBulkDeleteRecordingsDialogPreset(count: number): DialogPreset {
		return {
			title: 'Delete Recordings',
			icon: 'delete_forever',
			message: `Are you sure you want to permanently delete <b>${count} recording${count > 1 ? 's' : ''}</b>? This action cannot be undone.`,
			confirmText: 'Delete',
			cancelText: 'Cancel'
		};
	}
}
