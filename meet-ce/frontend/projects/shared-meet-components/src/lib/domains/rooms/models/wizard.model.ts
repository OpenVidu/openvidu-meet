import { FormGroup } from '@angular/forms';

/**
 * Enumeration of wizard step identifiers
 */
/**
 * The features that end-to-end encryption excludes: enabling it turns them off. Recording and live
 * broadcast also turn it off when enabled; live captions cannot be enabled while it is on.
 */
export type E2EEExclusiveFeature = 'recording' | 'broadcast' | 'captions';

export const E2EE_EXCLUSIVE_FEATURES: E2EEExclusiveFeature[] = ['recording', 'broadcast', 'captions'];

export enum WizardStepId {
	ROOM_DETAILS = 'roomDetails',
	MEETING = 'meeting',
	RECORDING = 'recording',
	BROADCAST = 'broadcast',
	ROOM_ACCESS = 'roomAccess'
}

/**
 * Configuration interface for individual wizard steps
 */
export interface WizardStep<TStepId extends WizardStepId = WizardStepId, TFormGroup extends FormGroup = FormGroup> {
	id: TStepId;
	label: string;
	isCompleted: boolean;
	formGroup: TFormGroup;
}

/**
 * Configuration interface for wizard navigation controls
 */
export interface WizardNavigationConfig {
	// Button visibility flags
	showNext: boolean;
	showPrevious: boolean;
	showCancel: boolean;
	showBack: boolean;
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
	action: 'next' | 'previous' | 'cancel' | 'finish' | 'back';
	currentStepIndex?: number;
}
