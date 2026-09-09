import { MeetRoomDeletionPolicyWithMeeting, MeetRoomDeletionPolicyWithRecordings } from '@openvidu-meet/typings';

/** A {@link DialogOptions} with the wording filled in and the answers left to the caller. */
export type DialogPreset = Omit<DialogOptions, 'confirmCallback' | 'cancelCallback'>;

export interface DialogOptions {
	icon?: string;
	title?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	confirmCallback?: () => void;
	cancelCallback?: () => void;
	// Action buttons visibility
	showActions?: boolean;
	showConfirmButton?: boolean;
	showCancelButton?: boolean;
	// Warning box options
	showWarningBox?: boolean;
	warningIcon?: string;
	warningTitle?: string;
	warningMessage?: string;
	// Force options
	showForceCheckbox?: boolean;
	forceCheckboxLabel?: string;
	forceMessage?: string;
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

/**
 * A message pinned in the layout, as opposed to the overlays {@link DialogOptions} describes: it
 * waits its turn in a stack the host places wherever it belongs, and says only what to read.
 *
 * Copy travels as translation keys rather than text, so the notification can be raised from a
 * service, where there is no translate pipe, and still follow a language change while it is up.
 */
export interface NotificationOptions {
	/** Names what is being announced, for a caller that replaces its own notification, and for tests. */
	kind: string;
	/** Material icon glyph. */
	icon: string;
	/** Omit for a one-liner, where the message says it all. */
	titleKey?: string;
	messageKey: string;
	messageParams?: Record<string, string | number>;
	/** Key for the close button's accessible label. */
	dismissLabelKey: string;
	/** Something the reader can do about it, offered as a button. Running it takes the notification away. */
	action?: {
		labelKey: string;
		run: () => void;
	};
	/** How loud the glyph reads. Defaults to `neutral`, for something that is not happening yet. */
	tone?: 'alert' | 'warning' | 'neutral';
	/** Milliseconds on screen. Omit for a notification that stays until it is dismissed. */
	durationMs?: number;
}

/** A {@link NotificationOptions} that is on screen, identified so it can be taken away again. */
export interface ShownNotification extends NotificationOptions {
	id: number;
}
