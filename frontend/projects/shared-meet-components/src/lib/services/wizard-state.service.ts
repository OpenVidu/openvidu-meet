import { inject, Injectable } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { WizardNavigationConfig, WizardStep } from '@lib/models';
import { MeetRecordingAccess, MeetRoomOptions, MeetRoomPreferences } from '@lib/typings/ce';
import { BehaviorSubject } from 'rxjs';

/**
 * Service to manage the state of the room creation wizard.
 * Handles step navigation, form data management, and room options building.
 */
@Injectable({
	providedIn: 'root'
})
export class RoomWizardStateService {
	private readonly _formBuilder = inject(FormBuilder);

	// Observables for reactive state management
	private readonly _currentStepIndex = new BehaviorSubject<number>(0);
	private readonly _steps = new BehaviorSubject<WizardStep[]>([]);
	private readonly _roomOptions = new BehaviorSubject<MeetRoomOptions>({
		preferences: {
			recordingPreferences: {
				enabled: false,
				allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			},
			chatPreferences: { enabled: true },
			virtualBackgroundPreferences: { enabled: true }
		}
	});

	public readonly currentStepIndex$ = this._currentStepIndex.asObservable();
	public readonly steps$ = this._steps.asObservable();
	public readonly roomOptions$ = this._roomOptions.asObservable();

	// Default room preferences following the platform's defaults
	private readonly DEFAULT_PREFERENCES: MeetRoomPreferences = {
		recordingPreferences: {
			enabled: false,
			allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
		},
		chatPreferences: { enabled: true },
		virtualBackgroundPreferences: { enabled: true }
	};

	/**
	 * Initializes the wizard with base steps and default room options.
	 * @param editMode - Whether the wizard is in edit mode
	 * @param existingData - Existing room options to prefill the wizard
	 */
	initializeWizard(editMode: boolean = false, existingData?: MeetRoomOptions): void {
		// Initialize room options with defaults merged with existing data
		console.log('Initializing wizard - editMode:', editMode, 'existingData:', existingData);

		const mergedPreferences: MeetRoomPreferences = {
			...this.DEFAULT_PREFERENCES,
			...existingData?.preferences
		};

		const initialRoomOptions: MeetRoomOptions = {
			...existingData,
			preferences: mergedPreferences
		};

		console.log('Initial room options created:', initialRoomOptions);
		this._roomOptions.next(initialRoomOptions);
		console.log('Wizard initialized with options:', initialRoomOptions);

		// Define base wizard steps
		const baseSteps: WizardStep[] = [
			{
				id: 'basic',
				label: 'Room Details',
				isCompleted: editMode, // In edit mode, mark as completed but not editable
				isActive: !editMode, // Start with basic step active in create mode
				isVisible: true,
				validationFormGroup: this._formBuilder.group({
					roomPrefix: [
						{ value: initialRoomOptions.roomIdPrefix || '', disabled: editMode },
						editMode ? [] : [Validators.minLength(2)]
					],
					deletionDate: [{ value: initialRoomOptions.autoDeletionDate || '', disabled: editMode }]
				}),
				order: 1
			},
			{
				id: 'recording',
				label: 'Recording Settings',
				isCompleted: editMode, // In edit mode, all editable steps are completed
				isActive: editMode, // Start with recording step in edit mode
				isVisible: true,
				validationFormGroup: this._formBuilder.group({
					enabled: [
						initialRoomOptions.preferences?.recordingPreferences?.enabled ??
							this.DEFAULT_PREFERENCES.recordingPreferences.enabled
					]
				}),
				order: 2
			},
			{
				id: 'preferences',
				label: 'Room Features',
				isCompleted: editMode, // In edit mode, all editable steps are completed
				isActive: false,
				isVisible: true,
				validationFormGroup: this._formBuilder.group({
					chatPreferences: this._formBuilder.group({
						enabled: [
							initialRoomOptions.preferences?.chatPreferences?.enabled ??
								this.DEFAULT_PREFERENCES.chatPreferences.enabled
						]
					}),
					virtualBackgroundPreferences: this._formBuilder.group({
						enabled: [
							initialRoomOptions.preferences?.virtualBackgroundPreferences?.enabled ??
								this.DEFAULT_PREFERENCES.virtualBackgroundPreferences.enabled
						]
					})
				}),
				order: 5
			}
		];

		this._steps.next(baseSteps);

		// Set initial step index based on mode
		const initialStepIndex = editMode ? 1 : 0; // Skip basic step in edit mode
		this._currentStepIndex.next(initialStepIndex);

		this.updateStepVisibility();
	}

	/**
	 * Updates room options for a specific step.
	 * This method merges the provided data with the current room options.
	 * @param stepId - The ID of the step being updated
	 * @param stepData - The data to update in the room options
	 */
	updateStepData(stepId: string, stepData: Partial<MeetRoomOptions>): void {
		console.log(`updateStepData called - stepId: '${stepId}', stepData:`, stepData);
		const currentOptions = this._roomOptions.value;
		let updatedOptions: MeetRoomOptions;

		switch (stepId) {
			case 'basic':
				updatedOptions = {
					...currentOptions
				};
				// Only update fields that are explicitly provided
				if ('roomIdPrefix' in stepData) {
					updatedOptions.roomIdPrefix = stepData.roomIdPrefix;
				}
				if ('autoDeletionDate' in stepData) {
					updatedOptions.autoDeletionDate = stepData.autoDeletionDate;
				}
				break;

			case 'recording':
				updatedOptions = {
					...currentOptions,
					preferences: {
						...currentOptions.preferences,
						recordingPreferences: {
							...currentOptions.preferences?.recordingPreferences,
							...stepData.preferences?.recordingPreferences
						}
					} as MeetRoomPreferences
				};
				break;

			case 'recordingTrigger':
			case 'recordingLayout':
				// These steps don't directly modify room options but could store additional metadata
				updatedOptions = { ...currentOptions };
				break;

			case 'preferences':
				updatedOptions = {
					...currentOptions,
					preferences: {
						...currentOptions.preferences,
						chatPreferences: {
							...currentOptions.preferences?.chatPreferences,
							...stepData.preferences?.chatPreferences
						},
						virtualBackgroundPreferences: {
							...currentOptions.preferences?.virtualBackgroundPreferences,
							...stepData.preferences?.virtualBackgroundPreferences
						},
						recordingPreferences: {
							...currentOptions.preferences?.recordingPreferences,
							...stepData.preferences?.recordingPreferences
						}
					} as MeetRoomPreferences
				};
				break;

			default:
				console.warn(`Unknown step ID: ${stepId}`);
				updatedOptions = currentOptions;
		}

		this._roomOptions.next(updatedOptions);
		console.log(`Updated room options for step '${stepId}':`, updatedOptions);
		this.updateStepVisibility();
	}

	/**
	 * Updates the visibility of wizard steps based on current room options.
	 * For example, recording-related steps are only visible when recording is enabled.
	 */
	private updateStepVisibility(): void {
		const currentSteps = this._steps.value;
		const currentOptions = this._roomOptions.value;
		const recordingEnabled = currentOptions.preferences?.recordingPreferences?.enabled ?? false;

		// Determine if we're in edit mode by checking if basic step is completed and disabled
		const basicStep = currentSteps.find((step) => step.id === 'basic');
		const isEditMode = !!basicStep?.validationFormGroup?.disabled;

		// Remove recording-specific steps if they exist
		const filteredSteps = currentSteps.filter((step) => !['recordingTrigger', 'recordingLayout'].includes(step.id));

		if (recordingEnabled) {
			// Add recording-specific steps
			const recordingSteps: WizardStep[] = [
				{
					id: 'recordingTrigger',
					label: 'Recording Trigger',
					isCompleted: isEditMode, // In edit mode, mark as completed
					isActive: false,
					isVisible: true,
					validationFormGroup: this._formBuilder.group({
						type: ['manual']
					}),
					order: 3
				},
				{
					id: 'recordingLayout',
					label: 'Recording Layout',
					isCompleted: isEditMode, // In edit mode, mark as completed
					isActive: false,
					isVisible: true,
					validationFormGroup: this._formBuilder.group({
						layout: ['GRID'],
						access: ['moderator-only']
					}),
					order: 4
				}
			];

			// Insert recording steps at the correct position (after recording step)
			filteredSteps.splice(2, 0, ...recordingSteps);
		}

		// Reorder steps based on visibility
		filteredSteps.forEach((step, index) => {
			step.order = index + 1;
		});

		this._steps.next(filteredSteps);
	}

	goToNextStep(): boolean {
		const currentIndex = this._currentStepIndex.value;
		const steps = this._steps.value;
		const visibleSteps = steps.filter((step) => step.isVisible);
		if (currentIndex < visibleSteps.length - 1) {
			// Mark current step as completed
			const currentStep = visibleSteps[currentIndex];
			currentStep.isCompleted = true;
			currentStep.isActive = false;

			// Activate next step
			const nextStep = visibleSteps[currentIndex + 1];
			nextStep.isActive = true;

			this._currentStepIndex.next(currentIndex + 1);
			this._steps.next([...steps]);
			return true;
		}
		return false;
	}

	goToPreviousStep(): boolean {
		const currentIndex = this._currentStepIndex.value;
		const steps = this._steps.value;
		const visibleSteps = steps.filter((step) => step.isVisible);

		if (currentIndex > 0) {
			// Deactivate current step
			const currentStep = visibleSteps[currentIndex];
			currentStep.isActive = false;

			// Activate previous step
			const previousStep = visibleSteps[currentIndex - 1];
			previousStep.isActive = true;

			this._currentStepIndex.next(currentIndex - 1);
			this._steps.next([...steps]);
			return true;
		}
		return false;
	}

	getCurrentStep(): WizardStep | null {
		const steps = this._steps.value;
		const visibleSteps = steps.filter((step) => step.isVisible);
		const currentIndex = this._currentStepIndex.value;

		return visibleSteps[currentIndex] || null;
	}

	getCurrentStepIndex(): number {
		return this._currentStepIndex.value;
	}

	getVisibleSteps(): WizardStep[] {
		return this._steps.value.filter((step) => step.isVisible);
	}

	goToStep(targetIndex: number): boolean {
		const visibleSteps = this.getVisibleSteps();
		if (targetIndex >= 0 && targetIndex < visibleSteps.length) {
			// Deactivate current step
			const currentStep = this.getCurrentStep();
			if (currentStep) {
				currentStep.isActive = false;
			}

			// Activate target step
			const targetStep = visibleSteps[targetIndex];
			targetStep.isActive = true;

			this._currentStepIndex.next(targetIndex);
			this._steps.next([...this._steps.value]);
			return true;
		}
		return false;
	}

	getNavigationConfig(): WizardNavigationConfig {
		const currentIndex = this._currentStepIndex.value;
		const steps = this._steps.value;
		const visibleSteps = steps.filter((step) => step.isVisible);
		const isLastStep = currentIndex === visibleSteps.length - 1;
		const isFirstStep = currentIndex === 0;

		// Determine if we're in edit mode
		const basicStep = steps.find((step) => step.id === 'basic');
		const isEditMode = !!(basicStep?.isCompleted && basicStep.validationFormGroup?.disabled);

		return {
			showPrevious: !isFirstStep,
			showNext: !isLastStep,
			showCancel: true,
			showFinish: isLastStep,
			showQuickCreate: !isEditMode,
			nextLabel: 'Next',
			previousLabel: 'Previous',
			finishLabel: isEditMode ? 'Update Room' : 'Create Room',
			isNextDisabled: false,
			isPreviousDisabled: isFirstStep
		};
	}

	/**
	 * Gets the current room options configured in the wizard.
	 * @returns The current MeetRoomOptions object
	 */
	getRoomOptions(): MeetRoomOptions {
		const options = this._roomOptions.getValue();
		console.log('Getting room options:', options);
		return options;
	}

	/**
	 * Checks if the wizard was skipped (user is still on the first step).
	 * @returns True if the wizard was skipped, false otherwise
	 */
	isWizardSkipped(): boolean {
		return this._currentStepIndex.getValue() === 0;
	}

	/**
	 * Resets the wizard to its initial state with default options.
	 */
	resetWizard(): void {
		const defaultOptions: MeetRoomOptions = {
			preferences: this.DEFAULT_PREFERENCES
		};

		this._roomOptions.next(defaultOptions);
		this._currentStepIndex.next(0);
		this.initializeWizard();
	}
}
