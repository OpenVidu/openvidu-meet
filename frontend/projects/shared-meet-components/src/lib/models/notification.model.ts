export interface DialogOptions {
	title?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	cancelCallback?: () => void;
	confirmCallback?: () => void;
}
