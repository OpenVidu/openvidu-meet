import { MeetRoomDeletionPolicyWithMeeting, MeetRoomDeletionPolicyWithRecordings } from '@lib/typings/ce';

export interface DialogOptions {
	title?: string;
	icon?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	confirmCallback?: () => void;
	cancelCallback?: () => void;
	// Force options
	showForceCheckbox?: boolean;
	forceCheckboxText?: string;
	forceCheckboxDescription?: string;
	forceConfirmCallback?: () => void;
}

export interface DeleteRoomDialogOptions {
	title: string;
	message: string;
	showWithMeetingPolicy: boolean;
	showWithRecordingsPolicy: boolean;
	confirmText?: string;
	confirmCallback: (
		meetingPolicy: MeetRoomDeletionPolicyWithMeeting,
		recordingPolicy: MeetRoomDeletionPolicyWithRecordings
	) => void;
}
