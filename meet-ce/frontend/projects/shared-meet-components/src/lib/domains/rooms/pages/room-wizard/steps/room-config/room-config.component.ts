import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MeetRoomOptions } from '@openvidu-meet/typings';
import {
	RecordingEnabledOption,
	RoomConfigFormGroup,
	RoomConfigFormValue
} from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services';

@Component({
	selector: 'ov-room-config',
	imports: [ReactiveFormsModule, MatIconModule, MatSlideToggleModule],
	templateUrl: './room-config.component.html',
	styleUrl: './room-config.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomConfigComponent {
	private wizardService = inject(RoomWizardStateService);

	roomConfigForm: RoomConfigFormGroup;

	// Store the previous recording state before E2EE disables it
	private recordingStateBeforeE2EE?: RecordingEnabledOption;

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
				}
			}
		};

		this.wizardService.updateStepData(WizardStepId.ROOM_CONFIG, stepData);
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
				this.recordingStateBeforeE2EE = currentRecordingValue;
			}

			// Disable recording automatically
			recordingForm.patchValue(
				{
					recordingEnabled: 'disabled'
				},
				{ emitEvent: true }
			);
		} else {
			// Restore the previous recording state when E2EE is disabled
			if (this.recordingStateBeforeE2EE !== undefined) {
				recordingForm.patchValue(
					{
						recordingEnabled: this.recordingStateBeforeE2EE
					},
					{ emitEvent: true }
				);

				// Clear the saved state
				this.recordingStateBeforeE2EE = undefined;
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
