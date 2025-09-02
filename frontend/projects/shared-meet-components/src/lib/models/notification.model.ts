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
