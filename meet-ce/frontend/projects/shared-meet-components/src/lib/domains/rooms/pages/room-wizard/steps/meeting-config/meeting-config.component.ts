import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MeetRoomOptions } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../../../shared/pipes/translate.pipe';
import {
	MAX_DURATION_MINUTES_LIMIT,
	MAX_PARTICIPANTS_LIMIT,
	MIN_DURATION_MINUTES_LIMIT,
	MIN_PARTICIPANTS_LIMIT,
	MeetingConfigFormGroup,
	MeetingConfigFormValue
} from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services';

@Component({
	selector: 'ov-meeting-config',
	imports: [
		ReactiveFormsModule,
		MatFormFieldModule,
		MatIconModule,
		MatInputModule,
		MatSlideToggleModule,
		TranslatePipe
	],
	templateUrl: './meeting-config.component.html',
	styleUrl: './meeting-config.component.scss'
})
export class MeetingConfigComponent {
	private wizardService = inject(RoomWizardStateService);

	readonly minParticipantsLimit = MIN_PARTICIPANTS_LIMIT;
	readonly maxParticipantsLimit = MAX_PARTICIPANTS_LIMIT;
	readonly minDurationMinutesLimit = MIN_DURATION_MINUTES_LIMIT;
	readonly maxDurationMinutesLimit = MAX_DURATION_MINUTES_LIMIT;

	/** Set when the configured recording trigger can never fire at this participant limit. */
	autoStartWarningMessage = this.wizardService.recordingAutoStartWarningMessage;

	meetingForm: MeetingConfigFormGroup;

	constructor() {
		const meetingStep = this.wizardService.getStepById(WizardStepId.MEETING);

		if (!meetingStep) {
			throw new Error('meeting step not found in wizard state');
		}

		this.meetingForm = meetingStep.formGroup;

		this.meetingForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	private saveFormData(formValue: Partial<MeetingConfigFormValue>): void {
		const stepData: Partial<MeetRoomOptions> = {
			config: {
				chat: {
					enabled: formValue.chatEnabled ?? false
				},
				virtualBackground: {
					enabled: formValue.virtualBackgroundEnabled ?? false
				},
				e2ee: {
					enabled: formValue.e2eeEnabled ?? false
				},
				captions: {
					enabled: formValue.captionsEnabled ?? false
				},
				initialAudioActive: formValue.initialAudioActive ?? true,
				initialVideoActive: formValue.initialVideoActive ?? true,
				maxParticipants: this.normalizedLimit(
					this.meetingForm.controls.maxParticipants,
					formValue.maxParticipants
				),
				maxDurationMinutes: this.normalizedLimit(
					this.meetingForm.controls.maxDurationMinutes,
					formValue.maxDurationMinutes
				)
			}
		};

		this.wizardService.updateStepData(stepData);
	}

	/**
	 * Maps a limit input to its persisted `config` value: an empty input is `null` (the stored
	 * "unlimited" value), and an invalid draft is `undefined` so the wizard's deep-merge keeps the
	 * last valid value while the form invalidity blocks finishing.
	 */
	private normalizedLimit(
		control: FormControl<number | null>,
		value: number | null | undefined
	): number | null | undefined {
		if (control.invalid) {
			return undefined;
		}

		return value ?? null;
	}

	onE2EEToggleChange(event: MatSlideToggleChange): void {
		const isEnabled = event.checked;
		this.meetingForm.patchValue({
			e2eeEnabled: isEnabled
		});

		const recordingStep = this.wizardService.getStepById(WizardStepId.RECORDING);

		if (!recordingStep) return;

		const recordingForm = recordingStep.formGroup;

		if (isEnabled) {
			// Save the current recording state before disabling it, only when it is on, to preserve the
			// user's original choice
			if (recordingForm.controls.recordingEnabled.value) {
				this.wizardService.setRecordingStateBeforeE2EE(true);
			}

			// Disable recording automatically
			recordingForm.patchValue(
				{
					recordingEnabled: false
				},
				{ emitEvent: true }
			);

			this.wizardService.updateStepData({
				config: {
					recording: {
						enabled: false
					}
				}
			});
		} else {
			// Restore the previous recording state when E2EE is disabled
			const previousRecordingState = this.wizardService.getRecordingStateBeforeE2EE();

			if (previousRecordingState !== undefined) {
				recordingForm.patchValue(
					{
						recordingEnabled: previousRecordingState
					},
					{ emitEvent: true }
				);

				this.wizardService.updateStepData({
					config: {
						recording: {
							enabled: previousRecordingState
						}
					}
				});

				// Clear the saved state
				this.wizardService.clearRecordingStateBeforeE2EE();
			}
		}
	}

	onChatToggleChange(event: MatSlideToggleChange): void {
		const isEnabled = event.checked;
		this.meetingForm.patchValue({ chatEnabled: isEnabled });
	}

	onVirtualBackgroundToggleChange(event: MatSlideToggleChange): void {
		const isEnabled = event.checked;
		this.meetingForm.patchValue({ virtualBackgroundEnabled: isEnabled });
	}

	onCaptionsToggleChange(event: MatSlideToggleChange): void {
		const isEnabled = event.checked;
		this.meetingForm.patchValue({ captionsEnabled: isEnabled });
	}

	get chatEnabled(): boolean {
		return this.meetingForm.value.chatEnabled ?? false;
	}

	get virtualBackgroundEnabled(): boolean {
		return this.meetingForm.value.virtualBackgroundEnabled ?? false;
	}

	get e2eeEnabled(): boolean {
		return this.meetingForm.value.e2eeEnabled ?? false;
	}

	get captionsEnabled(): boolean {
		return this.meetingForm.value.captionsEnabled ?? false;
	}
}
