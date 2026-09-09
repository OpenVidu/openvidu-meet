import type { DialogPreset } from '../../../shared/models/notification.model';
import type { Translator } from '../../../shared/models/translator.model';

export const deleteRoomDialogPreset = (t: Translator, roomId: string): DialogPreset => ({
	title: t.translate('ROOMS.DIALOGS.DELETE_ROOM_TITLE'),
	icon: 'delete_outline',
	message: t.translate('ROOMS.DIALOGS.DELETE_ROOM_MESSAGE', { roomId }),
	confirmText: t.translate('ROOMS.DIALOGS.DELETE'),
	cancelText: t.translate('ROOMS.COMMON.CANCEL')
});

export const bulkDeleteRoomsDialogPreset = (t: Translator, count: number): DialogPreset => ({
	title: t.translate('ROOMS.DIALOGS.DELETE_ROOMS_TITLE'),
	icon: 'delete_outline',
	message: t.translate('ROOMS.DIALOGS.DELETE_ROOMS_MESSAGE', { count }),
	confirmText: t.translate('ROOMS.DIALOGS.DELETE'),
	cancelText: t.translate('ROOMS.COMMON.CANCEL')
});

export const removeMemberDialogPreset = (
	t: Translator,
	memberName: string,
	showMeetingKickWarning: boolean
): DialogPreset => ({
	title: t.translate('ROOMS.DIALOGS.REMOVE_MEMBER_TITLE'),
	icon: 'person_remove',
	message: t.translate('ROOMS.DIALOGS.REMOVE_MEMBER_MESSAGE', { memberName }),
	showWarningBox: showMeetingKickWarning,
	warningTitle: t.translate('ROOMS.DIALOGS.MEETING_WARNING_TITLE'),
	warningMessage: t.translate('ROOMS.DIALOGS.REMOVE_MEMBER_WARNING'),
	confirmText: t.translate('ROOMS.DIALOGS.REMOVE'),
	cancelText: t.translate('ROOMS.COMMON.CANCEL')
});

export const bulkRemoveMembersDialogPreset = (
	t: Translator,
	count: number,
	showMeetingKickWarning: boolean
): DialogPreset => ({
	title: t.translate('ROOMS.DIALOGS.REMOVE_MEMBERS_TITLE'),
	icon: 'group_remove',
	message: t.translate(
		count === 1 ? 'ROOMS.DIALOGS.REMOVE_MEMBERS_MESSAGE_ONE' : 'ROOMS.DIALOGS.REMOVE_MEMBERS_MESSAGE_MANY',
		{ count }
	),
	showWarningBox: showMeetingKickWarning,
	warningTitle: t.translate('ROOMS.DIALOGS.MEETING_WARNING_TITLE'),
	warningMessage: t.translate('ROOMS.DIALOGS.REMOVE_MEMBERS_WARNING'),
	confirmText: t.translate('ROOMS.DIALOGS.REMOVE'),
	cancelText: t.translate('ROOMS.COMMON.CANCEL')
});
