import { FormGroup } from '@angular/forms';

/**
 * Configuration interface for individual wizard steps
 */
export interface WizardStep {
	id: string;
	label: string;
	isCompleted: boolean;
	isActive: boolean;
	isVisible: boolean;
	formGroup: FormGroup;
}

/**
 * Configuration interface for wizard navigation controls
 */
export interface WizardNavigationConfig {
	// Button visibility flags
	showPrevious: boolean;
	showNext: boolean;
	showCancel: boolean;
	showFinish: boolean;
	showSkipAndFinish: boolean; // Used for quick create actions
	disableFinish?: boolean;

	// Button labels
	nextLabel?: string;
	previousLabel?: string;
	cancelLabel?: string;
	finishLabel?: string;
	skipAndFinishLabel?: string;
}

/**
 * Event interface for wizard navigation actions
 */
export interface WizardNavigationEvent {
	action: 'next' | 'previous' | 'cancel' | 'finish';
	currentStepIndex?: number;
}
