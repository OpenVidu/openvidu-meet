import type { TranslateParams } from '../services/i18n/translate.service';

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

/**
 * Copy for a notification: text already in the participant's language, or a translation key
 * resolved as the notification is shown, so one raised from a service, where there is no translate
 * pipe, still follows a language change while it is up.
 */
export type NotificationText = string | { key: string; params?: TranslateParams };

/** How loud the glyph reads. `neutral` is for something that is not happening yet. */
export type NotificationTone = 'alert' | 'warning' | 'neutral';

/**
 * Which stack the notification joins:
 * - `corner`: the floating one in the top-right corner, which {@link NotificationService} puts up on
 *   its own, so any screen can raise a notification without hosting anything.
 * - `pinned`: the one an `ov-notifications` outlet places in the layout, for a screen with somewhere
 *   of its own for them. A screen that hosts no outlet shows nothing.
 */
export type NotificationPlacement = 'corner' | 'pinned';

/**
 * A message shown without stopping what the reader is doing, as opposed to the overlays
 * {@link DialogOptions} describes: it waits its turn in a stack and says only what to read.
 */
export interface NotificationOptions {
	/** Names what is being announced, for a caller that replaces its own notification, and for tests. */
	kind: string;
	/** Material icon glyph. */
	icon: string;
	/** Omit for a one-liner, where the message says it all. */
	title?: NotificationText;
	message: NotificationText;
	/** Something the reader can do about it, offered as a button. Running it takes the notification away. */
	action?: {
		label: NotificationText;
		run: () => void;
	};
	/** Defaults to `neutral`. */
	tone?: NotificationTone;
	/** Defaults to `corner`. */
	placement?: NotificationPlacement;
	/** Milliseconds on screen. Omit for a notification that stays until it is dismissed. */
	durationMs?: number;
}

/** A {@link NotificationOptions} that is on screen, identified so it can be taken away again. */
export interface ShownNotification extends NotificationOptions {
	id: number;
}
