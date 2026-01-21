import { Component, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MeetRoomOptions } from '@openvidu-meet/typings';
import { Subject, takeUntil } from 'rxjs';
import {
	SelectableCardComponent,
	SelectableCardOption,
	SelectionCardEvent
} from '../../../../../../shared/components/selectable-card/selectable-card.component';
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
		SelectableCardComponent
	],
	templateUrl: './recording-config.component.html',
	styleUrl: './recording-config.component.scss'
})
export class RecordingConfigComponent implements OnDestroy {
	recordingForm: FormGroup;
	isAnimatingOut = false;

	// Store the previous E2EE state before recording disables it
	private e2eeStateBeforeRecording: boolean | null = null;

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

	private destroy$ = new Subject<void>();

	constructor(private wizardState: RoomWizardStateService) {
		const currentStep = this.wizardState.currentStep();
		this.recordingForm = currentStep!.formGroup;

		this.recordingForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private saveFormData(formValue: any) {
		const enabled = formValue.recordingEnabled === 'enabled';

		const stepData: Partial<MeetRoomOptions> = {
			config: {
				recording: {
					enabled,
					...(enabled && { allowAccessTo: formValue.allowAccessTo })
				}
			}
		};

		this.wizardState.updateStepData('recording', stepData);
	}

	onOptionSelect(event: SelectionCardEvent): void {
		const previouslyEnabled = this.isRecordingEnabled;
		const willBeEnabled = event.optionId === 'enabled';

		const configStep = this.wizardState.steps().find((step) => step.id === 'config');

		// Handle E2EE state when recording changes
		if (configStep) {
			if (!previouslyEnabled && willBeEnabled) {
				// Enabling recording: save E2EE state and disable it if needed
				const e2eeEnabled = configStep.formGroup.get('e2eeEnabled')?.value;

				if (e2eeEnabled) {
					// Save the E2EE state before disabling it
					this.e2eeStateBeforeRecording = true;

					// Disable E2EE when enabling recording
					configStep.formGroup.patchValue(
						{
							e2eeEnabled: false
						},
						{ emitEvent: true }
					);
				}
			} else if (previouslyEnabled && !willBeEnabled) {
				// Disabling recording: restore E2EE state if it was saved
				if (this.e2eeStateBeforeRecording !== null) {
					configStep.formGroup.patchValue(
						{
							e2eeEnabled: this.e2eeStateBeforeRecording
						},
						{ emitEvent: true }
					);

					// Clear the saved state
					this.e2eeStateBeforeRecording = null;
				}
			}
		}

		// Handle recording form update with animation
		if (previouslyEnabled && !willBeEnabled) {
			this.isAnimatingOut = true;
			// Wait for the animation to finish before updating the form
			setTimeout(() => {
				this.recordingForm.patchValue({
					recordingEnabled: event.optionId
				});
				this.isAnimatingOut = false;
			}, 100); // Animation duration
		} else {
			// If we are enabling or keeping it enabled, just update the form
			this.recordingForm.patchValue({
				recordingEnabled: event.optionId
			});
		}
	}

	get selectedValue(): string {
		return this.recordingForm.value.recordingEnabled || 'disabled';
	}

	get isRecordingEnabled(): boolean {
		return this.selectedValue === 'enabled';
	}

	get shouldShowAccessSection(): boolean {
		return this.isRecordingEnabled || this.isAnimatingOut;
	}
}
