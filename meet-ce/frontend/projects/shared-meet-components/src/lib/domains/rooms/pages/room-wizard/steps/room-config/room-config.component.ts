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
	RoomConfigFormGroup,
	RoomConfigFormValue
} from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services';

@Component({
	selector: 'ov-room-config',
	imports: [
		ReactiveFormsModule,
		MatFormFieldModule,
		MatIconModule,
		MatInputModule,
		MatSlideToggleModule,
		TranslatePipe
	],
	templateUrl: './room-config.component.html',
	styleUrl: './room-config.component.scss'
})
export class RoomConfigComponent {
	private wizardService = inject(RoomWizardStateService);

	readonly maxParticipantsLimit = MAX_PARTICIPANTS_LIMIT;
	readonly maxDurationMinutesLimit = MAX_DURATION_MINUTES_LIMIT;

	roomConfigForm: RoomConfigFormGroup;

	constructor() {
		const roomConfigStep = this.wizardService.getStepById(WizardStepId.ROOM_CONFIG);

		if (!roomConfigStep) {
			throw new Error('roomConfig step not found in wizard state');
		}

		this.roomConfigForm = roomConfigStep.formGroup;

		this.roomConfigForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	private saveFormData(formValue: Partial<RoomConfigFormValue>): void {
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
				maxParticipants: this.normalizedLimit(
					this.roomConfigForm.controls.maxParticipants,
					formValue.maxParticipants
				),
				maxDurationMinutes: this.normalizedLimit(
					this.roomConfigForm.controls.maxDurationMinutes,
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
		this.roomConfigForm.patchValue({
			e2eeEnabled: isEnabled
		});

		const recordingStep = this.wizardService.getStepById(WizardStepId.RECORDING);

		if (!recordingStep) return;

		const recordingForm = recordingStep.formGroup;

		if (isEnabled) {
			// Save the current recording state before disabling it
			const currentRecordingValue = recordingForm.controls.recordingEnabled.value;

			// Only save if it's not already 'disabled' (to preserve user's original choice)
			if (currentRecordingValue !== 'disabled') {
				this.wizardService.setRecordingStateBeforeE2EE(currentRecordingValue);
			}

			// Disable recording automatically
			recordingForm.patchValue(
				{
					recordingEnabled: 'disabled'
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
							enabled: previousRecordingState === 'enabled'
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
		this.roomConfigForm.patchValue({ chatEnabled: isEnabled });
	}

	onVirtualBackgroundToggleChange(event: MatSlideToggleChange): void {
		const isEnabled = event.checked;
		this.roomConfigForm.patchValue({ virtualBackgroundEnabled: isEnabled });
	}

	onCaptionsToggleChange(event: MatSlideToggleChange): void {
		const isEnabled = event.checked;
		this.roomConfigForm.patchValue({ captionsEnabled: isEnabled });
	}

	get chatEnabled(): boolean {
		return this.roomConfigForm.value.chatEnabled ?? false;
	}

	get virtualBackgroundEnabled(): boolean {
		return this.roomConfigForm.value.virtualBackgroundEnabled ?? false;
	}

	get e2eeEnabled(): boolean {
		return this.roomConfigForm.value.e2eeEnabled ?? false;
	}

	get captionsEnabled(): boolean {
		return this.roomConfigForm.value.captionsEnabled ?? false;
	}
}
