import { computed, Injectable, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { WizardNavigationConfig, WizardStep } from '@lib/models';
import {
	MeetRecordingAccess,
	MeetRoomConfig,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomOptions
} from '@openvidu-meet/typings';

// Default room config following the app's defaults
const DEFAULT_CONFIG: MeetRoomConfig = {
	recording: {
		enabled: true,
		allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
	},
	chat: { enabled: true },
	virtualBackground: { enabled: true }
};

/**
 * Service to manage the state of the room creation wizard.
 * Handles step navigation, form data management, and room options building.
 */
@Injectable({
	providedIn: 'root'
})
export class RoomWizardStateService {
	// Signals for reactive state management
	private _steps = signal<WizardStep[]>([]);
	private _visibleSteps = computed(() => this._steps().filter((step) => step.isVisible));
	private _currentStepIndex = signal<number>(0);
	private _roomOptions = signal<MeetRoomOptions>({
		config: DEFAULT_CONFIG
	});

	public readonly steps = computed(() => this._steps());
	public readonly currentStepIndex = computed(() => this._currentStepIndex());
	public readonly currentStep = computed<WizardStep | undefined>(() => {
		const visibleSteps = this._visibleSteps();
		const currentIndex = this._currentStepIndex();

		if (currentIndex < 0 || currentIndex >= visibleSteps.length) {
			return undefined;
		}

		return visibleSteps[currentIndex];
	});
	public readonly roomOptions = computed(() => this._roomOptions());

	constructor(private formBuilder: FormBuilder) {}

	/**
	 * Initializes the wizard with base steps and default room options.
	 * @param editMode - Whether the wizard is in edit mode
	 * @param existingData - Existing room options to prefill the wizard
	 */
	initializeWizard(editMode: boolean = false, existingData?: MeetRoomOptions): void {
		// Initialize room options with defaults merged with existing data
		const initialRoomOptions: MeetRoomOptions = {
			...existingData,
			config: {
				...DEFAULT_CONFIG,
				...(existingData?.config || {})
			}
		};

		this._roomOptions.set(initialRoomOptions);

		// Define wizard steps
		const baseSteps: WizardStep[] = [
			{
				id: 'roomDetails',
				label: 'Room Details',
				isCompleted: editMode, // In edit mode, mark as completed but not editable
				isActive: !editMode, // Start with roomDetails step active in create mode
				isVisible: true,
				formGroup: this.formBuilder.group(
					{
						roomName: [
							{ value: initialRoomOptions.roomName || 'Room', disabled: editMode },
							editMode ? [] : [Validators.maxLength(50)]
						],
						autoDeletionDate: [
							{
								value: initialRoomOptions.autoDeletionDate
									? new Date(initialRoomOptions.autoDeletionDate)
									: undefined,
								disabled: editMode
							}
						],
						autoDeletionHour: [
							{
								value: initialRoomOptions.autoDeletionDate
									? new Date(initialRoomOptions.autoDeletionDate).getHours()
									: 23,
								disabled: editMode
							},
							editMode ? [] : [Validators.min(0), Validators.max(23)]
						],
						autoDeletionMinute: [
							{
								value: initialRoomOptions.autoDeletionDate
									? new Date(initialRoomOptions.autoDeletionDate).getMinutes()
									: 59,
								disabled: editMode
							},
							editMode ? [] : [Validators.min(0), Validators.max(59)]
						],
						autoDeletionPolicyWithMeeting: [
							{
								value:
									initialRoomOptions.autoDeletionPolicy?.withMeeting ||
									MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS,
								disabled: editMode
							}
						],
						autoDeletionPolicyWithRecordings: [
							{
								value:
									initialRoomOptions.autoDeletionPolicy?.withRecordings ||
									MeetRoomDeletionPolicyWithRecordings.CLOSE,
								disabled: editMode
							}
						]
					},
					{
						// Apply future date-time validation only if not in edit mode
						validators: editMode
							? []
							: [
									(control: AbstractControl): ValidationErrors | null => {
										const date = control.get('autoDeletionDate')?.value as Date | null;
										const hour = control.get('autoDeletionHour')?.value as number | null;
										const minute = control.get('autoDeletionMinute')?.value as number | null;

										if (!date) return null;

										const selected = new Date(date);
										selected.setHours(hour ?? 0, minute ?? 0, 0, 0);

										const now = new Date();
										now.setMinutes(now.getMinutes() + 61, 0, 0); // Ensure at least 1 hour in the future

										return selected.getTime() < now.getTime() ? { minFutureDateTime: true } : null;
									}
								]
					}
				)
			},
			{
				id: 'recording',
				label: 'Recording Settings',
				isCompleted: editMode, // In edit mode, all editable steps are completed
				isActive: editMode, // Only active in edit mode
				isVisible: true,
				formGroup: this.formBuilder.group({
					recordingEnabled: initialRoomOptions.config!.recording.enabled ? 'enabled' : 'disabled',
					allowAccessTo: initialRoomOptions.config!.recording.allowAccessTo
				})
			},
			{
				id: 'recordingTrigger',
				label: 'Recording Trigger',
				isCompleted: editMode, // In edit mode, all editable steps are completed
				isActive: false,
				isVisible: false, // Initially hidden, will be shown based on recording settings
				formGroup: this.formBuilder.group({
					triggerType: 'manual'
				})
			},
			{
				id: 'recordingLayout',
				label: 'Recording Layout',
				isCompleted: editMode, // In edit mode, all editable steps are completed
				isActive: false,
				isVisible: false, // Initially hidden, will be shown based on recording settings
				formGroup: this.formBuilder.group({
					layoutType: 'grid'
				})
			},
			{
				id: 'config',
				label: 'Room Features',
				isCompleted: editMode, // In edit mode, all editable steps are completed
				isActive: false,
				isVisible: true,
				formGroup: this.formBuilder.group({
					chatEnabled: initialRoomOptions.config!.chat.enabled,
					virtualBackgroundsEnabled: initialRoomOptions.config!.virtualBackground.enabled
				})
			}
		];

		this._steps.set(baseSteps);
		const initialStepIndex = editMode ? 1 : 0; // Skip roomDetails step in edit mode
		this._currentStepIndex.set(initialStepIndex);

		// Update step visibility after index is set
		this.updateStepsVisibility();
	}

	/**
	 * Updates room options for a specific step.
	 * This method merges the provided data with the current room options.
	 * @param stepId - The ID of the step being updated
	 * @param stepData - The data to update in the room options
	 */
	updateStepData(stepId: string, stepData: Partial<MeetRoomOptions>): void {
		const currentOptions = this._roomOptions();
		let updatedOptions: MeetRoomOptions;

		switch (stepId) {
			case 'roomDetails':
				updatedOptions = {
					...currentOptions
				};

				// Only update fields that are explicitly provided
				if ('roomName' in stepData) {
					updatedOptions.roomName = stepData.roomName;
				}
				if ('autoDeletionDate' in stepData) {
					updatedOptions.autoDeletionDate = stepData.autoDeletionDate;
				}
				if ('autoDeletionPolicy' in stepData) {
					updatedOptions.autoDeletionPolicy = stepData.autoDeletionPolicy;
				}

				break;
			case 'recording':
				updatedOptions = {
					...currentOptions,
					config: {
						...currentOptions.config,
						recording: {
							...currentOptions.config?.recording,
							...stepData.config?.recording
						}
					} as MeetRoomConfig
				};
				break;
			case 'recordingTrigger':
			case 'recordingLayout':
				// These steps don't update room options
				updatedOptions = { ...currentOptions };
				break;
			case 'config':
				updatedOptions = {
					...currentOptions,
					config: {
						...currentOptions.config,
						chat: {
							...currentOptions.config?.chat,
							...stepData.config?.chat
						},
						virtualBackground: {
							...currentOptions.config?.virtualBackground,
							...stepData.config?.virtualBackground
						},
						recording: {
							...currentOptions.config?.recording,
							...stepData.config?.recording
						}
					} as MeetRoomConfig
				};
				break;
			default:
				console.warn(`Unknown step ID: ${stepId}`);
				updatedOptions = currentOptions;
		}

		this._roomOptions.set(updatedOptions);
		this.updateStepsVisibility();
	}

	/**
	 * Updates the visibility of wizard steps based on current room options.
	 * For example, recording-related steps are only visible when recording is enabled.
	 */
	private updateStepsVisibility(): void {
		const currentSteps = this._steps();
		const currentOptions = this._roomOptions();
		// TODO: Uncomment when recording config is fully implemented
		const recordingEnabled = false; // currentOptions.config?.recording.enabled ?? false;

		// Update recording steps visibility based on recordingEnabled
		const updatedSteps = currentSteps.map((step) => {
			if (step.id === 'recordingTrigger' || step.id === 'recordingLayout') {
				return {
					...step,
					isVisible: recordingEnabled // Only show if recording is enabled
				};
			}
			return step;
		});
		this._steps.set(updatedSteps);
	}

	goToNextStep(): boolean {
		const currentIndex = this._currentStepIndex();
		const visibleSteps = this._visibleSteps();

		if (currentIndex < visibleSteps.length - 1) {
			// Mark current step as completed
			const currentStep = visibleSteps[currentIndex];
			currentStep.isCompleted = true;
			currentStep.isActive = false;

			// Activate next step
			const nextStep = visibleSteps[currentIndex + 1];
			nextStep.isActive = true;

			this._currentStepIndex.set(currentIndex + 1);
			const steps = this._steps();
			this._steps.set([...steps]); // Trigger reactivity
			return true;
		}

		return false;
	}

	goToPreviousStep(): boolean {
		const currentIndex = this._currentStepIndex();
		const visibleSteps = this._visibleSteps();

		if (currentIndex > 0) {
			// Deactivate current step
			const currentStep = visibleSteps[currentIndex];
			currentStep.isActive = false;

			// Activate previous step
			const previousStep = visibleSteps[currentIndex - 1];
			previousStep.isActive = true;

			this._currentStepIndex.set(currentIndex - 1);
			const steps = this._steps();
			this._steps.set([...steps]); // Trigger reactivity
			return true;
		}

		return false;
	}

	goToStep(targetIndex: number): boolean {
		const currentIndex = this._currentStepIndex();
		if (targetIndex === currentIndex) {
			return false; // No change if the target index is the same as current
		}

		const visibleSteps = this._visibleSteps();

		if (targetIndex >= 0 && targetIndex < visibleSteps.length) {
			// Deactivate current step
			const currentStep = this.currentStep();
			if (currentStep) {
				currentStep.isActive = false;
			}

			// Activate target step
			const targetStep = visibleSteps[targetIndex];
			targetStep.isActive = true;

			this._currentStepIndex.set(targetIndex);
			const steps = this._steps();
			this._steps.set([...steps]); // Trigger reactivity
			return true;
		}

		return false;
	}

	getNavigationConfig(): WizardNavigationConfig {
		const currentIndex = this._currentStepIndex();
		const visibleSteps = this._visibleSteps();
		const isFirstStep = currentIndex === 0;
		const isLastStep = currentIndex === visibleSteps.length - 1;

		const isEditMode = this.isEditMode();
		const isSomeStepInvalid = visibleSteps.some((step) => step.formGroup.invalid);

		return {
			showPrevious: !isFirstStep,
			showNext: !isLastStep,
			showCancel: isEditMode,
			showBack: !isEditMode,
			showFinish: isLastStep,
			showSkipAndFinish: false, // Skip and finish is not used in this wizard
			disableFinish: isSomeStepInvalid,
			nextLabel: 'Next',
			previousLabel: 'Previous',
			finishLabel: isEditMode ? 'Update Room' : 'Create Room',
			skipAndFinishLabel: 'Create with defaults'
		};
	}

	/**
	 * Checks if the wizard is in edit mode.
	 * Edit mode is determined by whether the roomDetails step is completed and its form is disabled.
	 * @returns True if in edit mode, false otherwise
	 */
	private isEditMode(): boolean {
		const visibleSteps = this._visibleSteps();
		const roomDetailsStep = visibleSteps.find((step) => step.id === 'roomDetails');
		const isEditMode = !!roomDetailsStep && roomDetailsStep.isCompleted && roomDetailsStep.formGroup.disabled;
		return isEditMode;
	}

	/**
	 * Resets the wizard to its initial state with default options.
	 */
	resetWizard(): void {
		const defaultOptions: MeetRoomOptions = {
			config: DEFAULT_CONFIG
		};
		this._roomOptions.set(defaultOptions);
		this._steps.set([]);
		this._currentStepIndex.set(0);
	}
}
