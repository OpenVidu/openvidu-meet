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
	isOptional?: boolean;
	order: number;
	validationFormGroup: FormGroup;
	description?: string;
	icon?: string;
}

/**
 * Configuration interface for wizard navigation controls
 * Supports theming and responsive behavior
 */
export interface WizardNavigationConfig {
	// Button visibility
	showPrevious: boolean;
	showNext: boolean;
	showCancel: boolean;
	showFinish: boolean;
	showQuickCreate?: boolean; // Optional for quick create functionality

	// Button labels (customizable)
	nextLabel?: string;
	previousLabel?: string;
	cancelLabel?: string;
	finishLabel?: string;

	// Button states
	isNextDisabled: boolean;
	isPreviousDisabled: boolean;
	isFinishDisabled?: boolean;

	// UI states
	isLoading?: boolean;
	isCompact?: boolean;

	// Accessibility
	ariaLabel?: string;
}

/**
 * Event interface for wizard navigation actions
 */
export interface WizardNavigationEvent {
	action: 'next' | 'previous' | 'cancel' | 'finish';
	currentStepId?: number;
	targetStepId?: string;
	data?: any;
}
