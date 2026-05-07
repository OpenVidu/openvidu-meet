import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MeetRoomOptions } from '@openvidu-meet/typings';
import {
	SelectableCardComponent,
	SelectableCardOption,
	SelectionCardEvent
} from '../../../../../../shared/components/selectable-card/selectable-card.component';
import { RecordingEnabledOption, RecordingFormGroup, RecordingFormValue } from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';

@Component({
	selector: 'ov-recording-config',
	imports: [
		ReactiveFormsModule,
		MatButtonModule,
		MatIconModule,
		MatCardModule,
		MatRadioModule,
		MatSelectModule,
		MatFormFieldModule,
		MatSlideToggleModule,
		SelectableCardComponent
	],
	templateUrl: './recording-config.component.html',
	styleUrl: './recording-config.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordingConfigComponent {
	private wizardService = inject(RoomWizardStateService);

	recordingForm: RecordingFormGroup;

	recordingOptions: SelectableCardOption[] = [
		{
			id: 'enabled',
			title: 'Allow Recording',
			description:
				'Enable recording features for this room, allowing authorized participants to start and manage recordings.',
			icon: 'video_library'
			// recommended: true
		},
		{
			id: 'disabled',
			title: 'No Recording',
			description: 'Room will not be recorded. Participants can join without recording concerns.',
			icon: 'videocam_off'
		}
	];

	constructor() {
		const recordingStep = this.wizardService.getStepById(WizardStepId.RECORDING);
		if (!recordingStep) {
			throw new Error('recording step not found in wizard state');
		}
		this.recordingForm = recordingStep.formGroup;

		this.recordingForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	private saveFormData(formValue: Partial<RecordingFormValue>) {
		const stepData: Partial<MeetRoomOptions> = {
			config: {
				recording: {
					enabled: formValue.recordingEnabled === 'enabled'
				}
			},
			access: {
				anonymous: {
					recording: {
						enabled: formValue.anonymousRecordingEnabled ?? false
					}
				}
			}
		};

		this.wizardService.updateStepData(stepData);
	}

	onOptionSelect(event: SelectionCardEvent): void {
		if (!this.isRecordingEnabledOption(event.optionId)) {
			return;
		}

		const previouslyEnabled = this.isRecordingEnabled;
		const willBeEnabled = event.optionId === 'enabled';

		const configStep = this.wizardService.getStepById(WizardStepId.ROOM_CONFIG);

		// Handle E2EE state when recording changes
		if (configStep) {
			if (!previouslyEnabled && willBeEnabled) {
				// Enabling recording: save E2EE state and disable it if needed
				const e2eeEnabled = configStep.formGroup.controls.e2eeEnabled.value;

				if (e2eeEnabled) {
					// Save the E2EE state before disabling it
					this.wizardService.setE2EEStateBeforeRecording(true);

					// Disable E2EE when enabling recording
					configStep.formGroup.patchValue(
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
			} else if (previouslyEnabled && !willBeEnabled) {
				// Disabling recording: restore E2EE state if it was saved
				const previousE2EEState = this.wizardService.getE2EEStateBeforeRecording();
				if (previousE2EEState !== undefined) {
					configStep.formGroup.patchValue(
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

					// Clear the saved state
					this.wizardService.clearE2EEStateBeforeRecording();
				}
			}
		}

		this.recordingForm.patchValue({
			recordingEnabled: event.optionId
		});
	}

	private isRecordingEnabledOption(optionId: string): optionId is RecordingEnabledOption {
		return optionId === 'enabled' || optionId === 'disabled';
	}

	get selectedValue(): RecordingEnabledOption {
		return this.recordingForm.controls.recordingEnabled.value;
	}

	get isRecordingEnabled(): boolean {
		return this.selectedValue === 'enabled';
	}
}
