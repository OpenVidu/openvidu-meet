import { computed, inject, Injectable, signal } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, ValidationErrors, Validators } from '@angular/forms';
import {
	MEET_ROOM_MEMBER_PERMISSIONS_FIELDS,
	MeetRecordingLayout,
	MeetRoomConfig,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomMemberOptions,
	MeetRoomMemberPermissions,
	MeetRoomOptions
} from '@openvidu-meet/typings';
import { WizardNavigationConfig, WizardStepId } from '../models';
import {
	AnyWizardStep,
	RecordingEnabledOption,
	RecordingTriggerType,
	RoomAccessPermissionsControls,
	RoomDetailsFormGroup
} from '../models/wizard-forms.model';

// Default permissions for each role
const DEFAULT_MODERATOR_PERMISSIONS: MeetRoomMemberPermissions = {
	canRecord: true,
	canRetrieveRecordings: true,
	canDeleteRecordings: true,
	canJoinMeeting: true,
	canShareAccessLinks: true,
	canMakeModerator: true,
	canKickParticipants: true,
	canEndMeeting: true,
	canPublishVideo: true,
	canPublishAudio: true,
	canShareScreen: true,
	canReadChat: true,
	canWriteChat: true,
	canChangeVirtualBackground: true
};

const DEFAULT_SPEAKER_PERMISSIONS: MeetRoomMemberPermissions = {
	canRecord: false,
	canRetrieveRecordings: true,
	canDeleteRecordings: false,
	canJoinMeeting: true,
	canShareAccessLinks: false,
	canMakeModerator: false,
	canKickParticipants: false,
	canEndMeeting: false,
	canPublishVideo: true,
	canPublishAudio: true,
	canShareScreen: true,
	canReadChat: true,
	canWriteChat: true,
	canChangeVirtualBackground: true
};

// Default room config following the app's defaults
const DEFAULT_CONFIG: MeetRoomConfig = {
	recording: {
		enabled: true,
		layout: MeetRecordingLayout.GRID
	},
	chat: { enabled: true },
	virtualBackground: { enabled: true },
	e2ee: { enabled: false },
	captions: { enabled: true }
};

/**
 * Service to manage the state of the room creation wizard.
 * Handles step navigation, form data management, and room options building.
 */
@Injectable({
	providedIn: 'root'
})
export class RoomWizardStateService {
	private formBuilder = inject(FormBuilder);

	// Signals for reactive state management
	private _steps = signal<AnyWizardStep[]>([]);
	private _visibleSteps = computed(() => this._steps().filter((step) => step.isVisible));
	private _currentStepIndex = signal<number>(0);
	private _isInitialized = signal<boolean>(false);
	private _editMode = signal<boolean>(false);
	private _roomOptions = signal<MeetRoomOptions>({
		config: DEFAULT_CONFIG
	});
	private _pendingMembers = signal<MeetRoomMemberOptions[]>([]);

	public readonly steps = this._steps.asReadonly();
	public readonly currentStepIndex = this._currentStepIndex.asReadonly();
	public readonly isInitialized = this._isInitialized.asReadonly();
	public readonly editMode = this._editMode.asReadonly();
	public readonly currentStep = computed<AnyWizardStep | undefined>(() => {
		const visibleSteps = this._visibleSteps();
		const currentIndex = this._currentStepIndex();

		if (currentIndex < 0 || currentIndex >= visibleSteps.length) {
			return undefined;
		}

		return visibleSteps[currentIndex];
	});
	public readonly roomOptions = this._roomOptions.asReadonly();
	public readonly pendingMembers = this._pendingMembers.asReadonly();

	/**
	 * Initializes the wizard with base steps and default room options.
	 * @param editMode - Whether the wizard is in edit mode
	 * @param existingData - Existing room options to prefill the wizard
	 */
	initializeWizard(editMode: boolean = false, existingData?: MeetRoomOptions): void {
		this._isInitialized.set(false);
		this._editMode.set(editMode);

		// Initialize room options with defaults merged with existing data
		const initialRoomOptions: MeetRoomOptions = {
			...existingData,
			config: {
				...DEFAULT_CONFIG,
				...(existingData?.config || {})
			}
		};

		this._roomOptions.set(initialRoomOptions);
		this._pendingMembers.set([]);

		// Define wizard steps
		const baseSteps: AnyWizardStep[] = [
			{
				id: WizardStepId.ROOM_DETAILS,
				label: 'Room Details',
				isCompleted: editMode, // In edit mode, mark as completed but not editable
				isActive: !editMode, // Start with roomDetails step active in create mode
				isVisible: true,
				formGroup: this.formBuilder.group(
					{
						roomName: this.formBuilder.nonNullable.control<string | undefined>(
							{
								value: initialRoomOptions.roomName || 'Room',
								disabled: editMode
							},
							editMode ? [] : [Validators.maxLength(50)]
						),
						autoDeletionDate: this.formBuilder.nonNullable.control<Date | undefined>({
							value: initialRoomOptions.autoDeletionDate
								? new Date(initialRoomOptions.autoDeletionDate)
								: undefined,
							disabled: editMode
						}),
						autoDeletionHour: this.formBuilder.nonNullable.control(
							{
								value: initialRoomOptions.autoDeletionDate
									? new Date(initialRoomOptions.autoDeletionDate).getHours()
									: 23,
								disabled: editMode
							},
							editMode ? [] : [Validators.min(0), Validators.max(23)]
						),
						autoDeletionMinute: this.formBuilder.nonNullable.control(
							{
								value: initialRoomOptions.autoDeletionDate
									? new Date(initialRoomOptions.autoDeletionDate).getMinutes()
									: 59,
								disabled: editMode
							},
							editMode ? [] : [Validators.min(0), Validators.max(59)]
						),
						autoDeletionPolicyWithMeeting: this.formBuilder.nonNullable.control({
							value:
								initialRoomOptions.autoDeletionPolicy?.withMeeting ??
								MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS,
							disabled: editMode
						}),
						autoDeletionPolicyWithRecordings: this.formBuilder.nonNullable.control({
							value:
								initialRoomOptions.autoDeletionPolicy?.withRecordings ??
								MeetRoomDeletionPolicyWithRecordings.CLOSE,
							disabled: editMode
						})
					},
					{
						// Apply future date-time validation only if not in edit mode
						validators: editMode
							? []
							: [
									(control: AbstractControl): ValidationErrors | null => {
										const formGroup = control as RoomDetailsFormGroup;
										const { autoDeletionDate, autoDeletionHour, autoDeletionMinute } =
											formGroup.getRawValue();

										if (!autoDeletionDate) return null;

										const selected = new Date(autoDeletionDate);
										selected.setHours(autoDeletionHour, autoDeletionMinute, 0, 0);

										const now = new Date();
										now.setMinutes(now.getMinutes() + 61, 0, 0); // Ensure at least 1 hour in the future

										return selected.getTime() < now.getTime() ? { minFutureDateTime: true } : null;
									}
								]
					}
				)
			},
			{
				id: WizardStepId.ROOM_CONFIG,
				label: 'Room Features',
				isCompleted: editMode,
				isActive: editMode, // Start with Room Features step active in edit mode
				isVisible: true,
				formGroup: this.formBuilder.group({
					chatEnabled: this.formBuilder.nonNullable.control(initialRoomOptions.config!.chat!.enabled),
					virtualBackgroundEnabled: this.formBuilder.nonNullable.control(
						initialRoomOptions.config!.virtualBackground!.enabled
					),
					e2eeEnabled: this.formBuilder.nonNullable.control(initialRoomOptions.config!.e2ee!.enabled),
					captionsEnabled: this.formBuilder.nonNullable.control(initialRoomOptions.config!.captions!.enabled)
				})
			},
			{
				id: WizardStepId.ROOM_ACCESS,
				label: 'Room Access',
				isCompleted: editMode,
				isActive: false,
				isVisible: true,
				formGroup: this.formBuilder.group({
					anonymousModeratorEnabled: this.formBuilder.nonNullable.control(
						initialRoomOptions.access?.anonymous?.moderator?.enabled ?? true
					),
					anonymousSpeakerEnabled: this.formBuilder.nonNullable.control(
						initialRoomOptions.access?.anonymous?.speaker?.enabled ?? true
					),
					registeredEnabled: this.formBuilder.nonNullable.control(
						initialRoomOptions.access?.registered?.enabled ?? false
					),
					moderator: this.formBuilder.group({
						...this.buildPermissionsFormConfig(
							initialRoomOptions.roles?.moderator?.permissions ?? DEFAULT_MODERATOR_PERMISSIONS
						)
					}),
					speaker: this.formBuilder.group({
						...this.buildPermissionsFormConfig(
							initialRoomOptions.roles?.speaker?.permissions ?? DEFAULT_SPEAKER_PERMISSIONS
						)
					})
				})
			},
			{
				id: WizardStepId.RECORDING,
				label: 'Recording Settings',
				isCompleted: editMode, // In edit mode, all editable steps are completed
				isActive: false,
				isVisible: true,
				formGroup: this.formBuilder.group({
					recordingEnabled: this.formBuilder.nonNullable.control<RecordingEnabledOption>(
						initialRoomOptions.config!.recording!.enabled ? 'enabled' : 'disabled'
					),
					anonymousRecordingEnabled: this.formBuilder.nonNullable.control(
						initialRoomOptions.access?.anonymous?.recording?.enabled ?? false
					)
				})
			},
			{
				id: WizardStepId.RECORDING_TRIGGER,
				label: 'Recording Trigger',
				isCompleted: editMode, // In edit mode, all editable steps are completed
				isActive: false,
				isVisible: false, // Initially hidden, will be shown based on recording settings
				formGroup: this.formBuilder.group({
					triggerType: this.formBuilder.nonNullable.control<RecordingTriggerType>('manual')
				})
			},
			{
				id: WizardStepId.RECORDING_LAYOUT,
				label: 'Recording Layout',
				isCompleted: editMode, // In edit mode, all editable steps are completed
				isActive: false,
				isVisible: false, // Initially hidden, will be shown based on recording settings
				formGroup: this.formBuilder.group({
					layout: this.formBuilder.nonNullable.control(
						initialRoomOptions.config!.recording!.layout ?? MeetRecordingLayout.GRID
					)
				})
			}
		];

		this._steps.set(baseSteps);
		const initialStepIndex = editMode ? 1 : 0; // Skip roomDetails step in edit mode
		this._currentStepIndex.set(initialStepIndex);

		// Update step visibility after index is set
		this.updateStepsVisibility();
		this._isInitialized.set(true);
	}

	/**
	 * Gets a step by its ID. The returned step type is narrowed based on the provided step ID.
	 * @param stepId - The ID of the step to retrieve
	 * @returns The step with the specified ID, or undefined if not found
	 */
	getStepById<TStepId extends WizardStepId>(stepId: TStepId): Extract<AnyWizardStep, { id: TStepId }> | undefined {
		return this._steps().find((step): step is Extract<AnyWizardStep, { id: TStepId }> => step.id === stepId);
	}

	/**
	 * Updates room options for a specific step.
	 * This method merges the provided data with the current room options.
	 * @param stepId - The ID of the step being updated
	 * @param stepData - The data to update in the room options
	 */
	updateStepData(stepId: WizardStepId, stepData: Partial<MeetRoomOptions>): void {
		const currentOptions = this._roomOptions();
		const updatedOptions = this.getUpdatedOptionsForStep(stepId, stepData, currentOptions);

		this._roomOptions.set(updatedOptions);
		this.updateStepsVisibility();
	}

	private getUpdatedOptionsForStep(
		stepId: WizardStepId,
		stepData: Partial<MeetRoomOptions>,
		currentOptions: MeetRoomOptions
	): MeetRoomOptions {
		switch (stepId) {
			case WizardStepId.ROOM_DETAILS:
				return this.mergeRoomDetailsData(currentOptions, stepData);
			case WizardStepId.RECORDING:
			case WizardStepId.RECORDING_LAYOUT:
				return this.mergeRecordingData(currentOptions, stepData);
			case WizardStepId.RECORDING_TRIGGER:
				return currentOptions;
			case WizardStepId.ROOM_CONFIG:
				return this.mergeConfigData(currentOptions, stepData);
			case WizardStepId.ROOM_ACCESS:
				return this.mergeRoomAccessData(currentOptions, stepData);
			default:
				console.warn(`Unknown step ID: ${stepId}`);
				return currentOptions;
		}
	}

	private mergeRoomDetailsData(currentOptions: MeetRoomOptions, stepData: Partial<MeetRoomOptions>): MeetRoomOptions {
		return {
			...currentOptions,
			...('roomName' in stepData ? { roomName: stepData.roomName } : {}),
			...('autoDeletionDate' in stepData ? { autoDeletionDate: stepData.autoDeletionDate } : {}),
			...('autoDeletionPolicy' in stepData ? { autoDeletionPolicy: stepData.autoDeletionPolicy } : {})
		};
	}

	private mergeRecordingData(currentOptions: MeetRoomOptions, stepData: Partial<MeetRoomOptions>): MeetRoomOptions {
		return {
			...currentOptions,
			config: this.buildMergedConfig(currentOptions.config, {
				recording: stepData.config?.recording
			}),
			access: {
				...currentOptions.access,
				anonymous: {
					...currentOptions.access?.anonymous,
					moderator: currentOptions.access?.anonymous?.moderator ?? { enabled: true },
					speaker: currentOptions.access?.anonymous?.speaker ?? { enabled: true },
					recording: {
						enabled:
							stepData.access?.anonymous?.recording?.enabled ??
							currentOptions.access?.anonymous?.recording?.enabled ??
							true
					}
				},
				registered: currentOptions.access?.registered ?? { enabled: false }
			}
		};
	}

	private mergeRoomAccessData(currentOptions: MeetRoomOptions, stepData: Partial<MeetRoomOptions>): MeetRoomOptions {
		const currentModeratorPermissions =
			currentOptions.roles?.moderator?.permissions ?? DEFAULT_MODERATOR_PERMISSIONS;
		const currentSpeakerPermissions = currentOptions.roles?.speaker?.permissions ?? DEFAULT_SPEAKER_PERMISSIONS;

		return {
			...currentOptions,
			roles: {
				moderator: {
					permissions: {
						...currentModeratorPermissions,
						...stepData.roles?.moderator?.permissions
					}
				},
				speaker: {
					permissions: {
						...currentSpeakerPermissions,
						...stepData.roles?.speaker?.permissions
					}
				}
			},
			access: {
				anonymous: {
					moderator: {
						enabled:
							stepData.access?.anonymous?.moderator?.enabled ??
							currentOptions.access?.anonymous?.moderator?.enabled ??
							true
					},
					speaker: {
						enabled:
							stepData.access?.anonymous?.speaker?.enabled ??
							currentOptions.access?.anonymous?.speaker?.enabled ??
							true
					},
					recording: {
						enabled: currentOptions.access?.anonymous?.recording?.enabled ?? true
					}
				},
				registered: {
					enabled: stepData.access?.registered?.enabled ?? currentOptions.access?.registered?.enabled ?? false
				}
			}
		};
	}

	private mergeConfigData(currentOptions: MeetRoomOptions, stepData: Partial<MeetRoomOptions>): MeetRoomOptions {
		return {
			...currentOptions,
			config: this.buildMergedConfig(currentOptions.config, stepData.config)
		};
	}

	private buildMergedConfig(
		currentConfig: Partial<MeetRoomConfig> | undefined,
		incomingConfig: Partial<MeetRoomConfig> | undefined
	): MeetRoomConfig {
		return {
			recording: {
				...DEFAULT_CONFIG.recording,
				...currentConfig?.recording,
				...incomingConfig?.recording
			},
			chat: {
				...DEFAULT_CONFIG.chat,
				...currentConfig?.chat,
				...incomingConfig?.chat
			},
			virtualBackground: {
				...DEFAULT_CONFIG.virtualBackground,
				...currentConfig?.virtualBackground,
				...incomingConfig?.virtualBackground
			},
			e2ee: {
				...DEFAULT_CONFIG.e2ee,
				...currentConfig?.e2ee,
				...incomingConfig?.e2ee
			},
			captions: {
				...DEFAULT_CONFIG.captions,
				...currentConfig?.captions,
				...incomingConfig?.captions
			}
		};
	}

	/**
	 * Updates the visibility of wizard steps based on current room options.
	 * For example, recording-related steps are only visible when recording is enabled.
	 */
	private updateStepsVisibility(): void {
		const currentSteps = this._steps();
		const currentOptions = this._roomOptions();

		const recordingEnabled = currentOptions.config?.recording?.enabled ?? false;

		// Update recording steps visibility based on recordingEnabled
		const updatedSteps = currentSteps.map((step) => {
			if (step.id === WizardStepId.RECORDING_LAYOUT) {
				return {
					...step,
					isVisible: recordingEnabled // Only show if recording is enabled
				};
			}
			if (step.id === WizardStepId.RECORDING_TRIGGER) {
				return {
					...step,
					isVisible: false // TODO: Change to true when recording trigger config is implemented
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

		const isEditMode = this._editMode();
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
			finishLabel: isEditMode ? 'Update Room' : 'Create Room'
		};
	}

	/**
	 * Builds a flat form controls config from a permissions object.
	 */
	private buildPermissionsFormConfig(permissions: Partial<MeetRoomMemberPermissions>): RoomAccessPermissionsControls {
		return this.buildBooleanControls(MEET_ROOM_MEMBER_PERMISSIONS_FIELDS, permissions);
	}

	private buildBooleanControls<T extends string>(
		keys: readonly T[],
		values: Partial<Record<T, boolean>>
	): { [K in T]: FormControl<boolean> } {
		const controls = {} as { [K in T]: FormControl<boolean> };
		for (const key of keys) {
			controls[key] = this.formBuilder.nonNullable.control(values[key] ?? false);
		}
		return controls;
	}

	/**
	 * Adds a pending member to the wizard state.
	 * Members are created after the room is successfully created.
	 */
	addPendingMember(member: MeetRoomMemberOptions): void {
		this._pendingMembers.update((members) => [...members, member]);
	}

	/**
	 * Removes a pending member from the wizard state by index.
	 */
	removePendingMember(index: number): void {
		this._pendingMembers.update((members) => members.filter((_, i) => i !== index));
	}

	/**
	 * Resets the wizard to its initial state with default options.
	 */
	resetWizard(): void {
		const defaultOptions: MeetRoomOptions = {
			config: DEFAULT_CONFIG
		};
		this._isInitialized.set(false);
		this._editMode.set(false);
		this._roomOptions.set(defaultOptions);
		this._steps.set([]);
		this._currentStepIndex.set(0);
		this._pendingMembers.set([]);
	}
}
