import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MeetRecordingAutoStartMode } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../../../shared/pipes/translate.pipe';
import { LayoutPickerComponent } from '../../../../components/layout-picker/layout-picker.component';
import { TranslateService } from '../../../../../../shared/services/i18n/translate.service';
import { RecordingFormGroup, RecordingFormValue, RecordingTrigger } from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';

interface TriggerOption {
	value: RecordingTrigger;
	title: string;
	description: string;
}

@Component({
	selector: 'ov-recording-config',
	imports: [
		ReactiveFormsModule,
		MatFormFieldModule,
		MatIconModule,
		MatSelectModule,
		MatSlideToggleModule,
		LayoutPickerComponent,
		TranslatePipe
	],
	templateUrl: './recording-config.component.html',
	styleUrl: './recording-config.component.scss'
})
export class RecordingConfigComponent {
	private wizardService = inject(RoomWizardStateService);
	private readonly translateService = inject(TranslateService);

	recordingForm: RecordingFormGroup;

	/** Set when the selected trigger can never fire at the room's configured participant limit. */
	autoStartWarningMessage = this.wizardService.recordingAutoStartWarningMessage;

	triggerOptions: TriggerOption[] = [
		{
			value: 'manual',
			title: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.MANUAL_TITLE'),
			description: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.MANUAL_DESC')
		},
		{
			value: MeetRecordingAutoStartMode.WHEN_FIRST_PARTICIPANT_JOINS,
			title: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTOSTART_MODE_FIRST_TITLE'),
			description: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTOSTART_MODE_FIRST_DESC')
		},
		{
			value: MeetRecordingAutoStartMode.WHEN_SECOND_PARTICIPANT_JOINS,
			title: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTOSTART_MODE_SECOND_TITLE'),
			description: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTOSTART_MODE_SECOND_DESC')
		},
		{
			value: MeetRecordingAutoStartMode.WHEN_MODERATOR_JOINS,
			title: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTOSTART_MODE_MODERATOR_TITLE'),
			description: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTOSTART_MODE_MODERATOR_DESC')
		}
	];

	constructor() {
		const recordingStep = this.wizardService.getStepById(WizardStepId.RECORDING);

		if (!recordingStep) {
			throw new Error('recording step not found in wizard state');
		}

		this.recordingForm = recordingStep.formGroup;

		this.recordingForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
			this.saveFormData(this.recordingForm.getRawValue());
		});
	}

	private saveFormData(formValue: RecordingFormValue) {
		this.wizardService.updateStepData({
			config: {
				recording: {
					enabled: formValue.recordingEnabled,
					// null, not undefined, so the wizard's deep-merge stores "manual" instead of keeping the last preset
					autoStart: formValue.trigger === 'manual' ? null : formValue.trigger,
					layout: formValue.layout
				}
			},
			access: {
				anonymous: {
					recording: {
						enabled: formValue.anonymousRecordingEnabled
					}
				}
			}
		});
	}

	onRecordingToggleChange(event: MatSlideToggleChange): void {
		const meetingStep = this.wizardService.getStepById(WizardStepId.MEETING);

		if (!meetingStep) return;

		// Handle E2EE state when recording changes
		if (event.checked) {
			// Enabling recording: save E2EE state and disable it if needed
			const e2eeEnabled = meetingStep.formGroup.controls.e2eeEnabled.value;

			if (e2eeEnabled) {
				// Save the E2EE state before disabling it
				this.wizardService.rememberE2EEStateBeforeFeature('recording', true);

				// Disable E2EE when enabling recording
				meetingStep.formGroup.patchValue(
					{
						e2eeEnabled: false
					},
					{ emitEvent: true }
				);

				this.wizardService.updateStepData({
					config: {
						e2ee: {
							enabled: false
						}
					}
				});
			}
		} else {
			// Disabling recording: restore E2EE state if it was saved
			const previousE2EEState = this.wizardService.takeE2EEStateBeforeFeature('recording');

			if (previousE2EEState !== undefined) {
				meetingStep.formGroup.patchValue(
					{
						e2eeEnabled: previousE2EEState
					},
					{ emitEvent: true }
				);

				this.wizardService.updateStepData({
					config: {
						e2ee: {
							enabled: previousE2EEState
						}
					}
				});
			}
		}
	}

	get isRecordingEnabled(): boolean {
		return this.recordingForm.controls.recordingEnabled.value;
	}

	get selectedTriggerDescription(): string {
		const trigger = this.recordingForm.controls.trigger.value;
		return this.triggerOptions.find((option) => option.value === trigger)?.description ?? '';
	}

	get isE2EEEnabled(): boolean {
		const meetingStep = this.wizardService.getStepById(WizardStepId.MEETING);
		return meetingStep?.formGroup.controls.e2eeEnabled.value ?? false;
	}
}
