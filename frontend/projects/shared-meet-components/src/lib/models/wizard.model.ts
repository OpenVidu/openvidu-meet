export interface WizardStep {
	id: string;
	label: string;
	isCompleted: boolean;
	isActive: boolean;
	isVisible: boolean;
	isOptional?: boolean;
	order: number;
}

export interface WizardNavigationConfig {
	showPrevious: boolean;
	showNext: boolean;
	showCancel: boolean;
	showFinish: boolean;
	nextLabel: string;
	previousLabel: string;
	isNextDisabled: boolean;
	isPreviousDisabled: boolean;
}
