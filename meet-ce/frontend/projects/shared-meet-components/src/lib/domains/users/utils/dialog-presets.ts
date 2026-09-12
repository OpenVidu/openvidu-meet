import type { DialogPreset } from '../../../shared/models/notification.model';
import type { Translator } from '../../../shared/models/translator.model';

export const deleteUserDialogPreset = (t: Translator, name: string, userId: string): DialogPreset => ({
	title: t.translate('USERS.DIALOGS.DELETE_USER_TITLE'),
	icon: 'delete_forever',
	message: t.translate('USERS.DIALOGS.DELETE_USER_MESSAGE', { name, userId }),
	showWarningBox: true,
	warningTitle: t.translate('USERS.DIALOGS.WARNING_TITLE'),
	warningMessage: t.translate('USERS.DIALOGS.DELETE_USER_WARNING'),
	confirmText: t.translate('USERS.DIALOGS.DELETE'),
	cancelText: t.translate('USERS.COMMON.CANCEL')
});

export const bulkDeleteUsersDialogPreset = (t: Translator, count: number): DialogPreset => ({
	title: t.translate('USERS.DIALOGS.DELETE_USERS_TITLE'),
	icon: 'delete_forever',
	message: t.translate(
		count === 1 ? 'USERS.DIALOGS.DELETE_USERS_MESSAGE_ONE' : 'USERS.DIALOGS.DELETE_USERS_MESSAGE_MANY',
		{ count }
	),
	showWarningBox: true,
	warningTitle: t.translate('USERS.DIALOGS.WARNING_TITLE'),
	warningMessage: t.translate('USERS.DIALOGS.DELETE_USERS_WARNING'),
	confirmText: t.translate('USERS.DIALOGS.DELETE'),
	cancelText: t.translate('USERS.COMMON.CANCEL')
});
