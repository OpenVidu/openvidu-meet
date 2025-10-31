import { MeetRoomDeletionPolicyWithMeeting, MeetRoomDeletionPolicyWithRecordings } from '@openvidu-meet/typings';

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
	// Action buttons visibility
	showConfirmButton?: boolean;
	showCancelButton?: boolean;
	showActions?: boolean;
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
