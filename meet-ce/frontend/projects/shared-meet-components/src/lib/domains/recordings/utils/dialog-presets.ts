import type { DialogPreset } from '../../../shared/models/notification.model';
import type { Translator } from '../../../shared/models/translator.model';

export const deleteRecordingDialogPreset = (t: Translator, recordingId: string): DialogPreset => ({
	title: t.translate('RECORDINGS.DIALOGS.DELETE_RECORDING_TITLE'),
	icon: 'delete_forever',
	message: t.translate('RECORDINGS.DIALOGS.DELETE_RECORDING_MESSAGE', { recordingId }),
	confirmText: t.translate('RECORDINGS.DIALOGS.DELETE'),
	cancelText: t.translate('RECORDINGS.DIALOGS.CANCEL')
});

export const bulkDeleteRecordingsDialogPreset = (t: Translator, count: number): DialogPreset => ({
	title: t.translate('RECORDINGS.DIALOGS.DELETE_RECORDINGS_TITLE'),
	icon: 'delete_forever',
	message: t.translate(
		count === 1
			? 'RECORDINGS.DIALOGS.DELETE_RECORDINGS_MESSAGE_ONE'
			: 'RECORDINGS.DIALOGS.DELETE_RECORDINGS_MESSAGE_MANY',
		{ count }
	),
	confirmText: t.translate('RECORDINGS.DIALOGS.DELETE'),
	cancelText: t.translate('RECORDINGS.DIALOGS.CANCEL')
});
