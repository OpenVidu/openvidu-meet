import type { DialogPreset } from '../../../shared/models/notification.model';

export const deleteUserDialogPreset = (name: string, userId: string): DialogPreset => ({
	title: 'Delete User',
	icon: 'delete_forever',
	message: `Are you sure you want to permanently delete user <b>${name}</b> (${userId})? This action cannot be undone.`,
	showWarningBox: true,
	warningTitle: 'Important consequences',
	warningMessage: `If the user owns rooms, ownership will be transferred to the root admin. 
            If the user is currently in a meeting, they will be kicked from it immediately.`,
	confirmText: 'Delete',
	cancelText: 'Cancel'
});

export const bulkDeleteUsersDialogPreset = (count: number): DialogPreset => ({
	title: 'Delete Users',
	icon: 'delete_forever',
	message: `Are you sure you want to permanently delete <b>${count} user${count > 1 ? 's' : ''}</b>? This action cannot be undone.`,
	showWarningBox: true,
	warningTitle: 'Important consequences',
	warningMessage: `If deleted users own rooms, ownership will be transferred to the root admin. 
            Users currently in a meeting will be kicked from it immediately.`,
	confirmText: 'Delete',
	cancelText: 'Cancel'
});
