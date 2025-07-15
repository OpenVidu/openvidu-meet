export interface DialogOptions {
	title?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	cancelCallback?: () => void;
	confirmCallback?: () => void;
	// Force delete options
	showForceCheckbox?: boolean;
	forceCheckboxText?: string;
	forceCheckboxDescription?: string;
	forceConfirmCallback?: () => void;
}
