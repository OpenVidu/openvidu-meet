import type { DialogPreset } from '../../../shared/models/notification.model';

export const deleteRecordingDialogPreset = (recordingId: string): DialogPreset => ({
	title: 'Delete Recording',
	icon: 'delete_forever',
	message: `Are you sure you want to permanently delete the recording <b>${recordingId}</b>? This action cannot be undone.`,
	confirmText: 'Delete',
	cancelText: 'Cancel'
});

export const bulkDeleteRecordingsDialogPreset = (count: number): DialogPreset => ({
	title: 'Delete Recordings',
	icon: 'delete_forever',
	message: `Are you sure you want to permanently delete <b>${count} recording${count > 1 ? 's' : ''}</b>? This action cannot be undone.`,
	confirmText: 'Delete',
	cancelText: 'Cancel'
});
