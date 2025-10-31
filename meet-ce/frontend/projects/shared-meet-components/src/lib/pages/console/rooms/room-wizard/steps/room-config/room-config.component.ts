import { Component, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RoomWizardStateService } from '../../../../../../services';
import { Subject, takeUntil } from 'rxjs';

@Component({
    selector: 'ov-room-config',
    imports: [ReactiveFormsModule, MatCardModule, MatIconModule, MatSlideToggleModule],
    templateUrl: './room-config.component.html',
    styleUrl: './room-config.component.scss'
})
export class RoomConfigComponent implements OnDestroy {
	configForm: FormGroup;

	private destroy$ = new Subject<void>();
	// Store the previous recording state before E2EE disables it
	private recordingStateBeforeE2EE: string | null = null;

	constructor(private wizardService: RoomWizardStateService) {
		const currentStep = this.wizardService.currentStep();
		this.configForm = currentStep!.formGroup;

		this.configForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private saveFormData(formValue: any): void {
		const isE2EEEnabled = formValue.e2eeEnabled ?? false;

		const stepData: any = {
			config: {
				chat: {
					enabled: formValue.chatEnabled ?? false
				},
				virtualBackground: {
					enabled: formValue.virtualBackgroundsEnabled ?? false
				},
				e2ee: {
					enabled: isE2EEEnabled
				}
			}
		};

		this.wizardService.updateStepData('config', stepData);
	}

	onE2EEToggleChange(event: any): void {
		const isEnabled = event.checked;
		this.configForm.patchValue({
			e2eeEnabled: isEnabled
		});

		const recordingStep = this.wizardService.steps().find(step => step.id === 'recording');
		if (!recordingStep) return;

		if (isEnabled) {
			// Save the current recording state before disabling it
			const currentRecordingValue = recordingStep.formGroup.get('recordingEnabled')?.value;

			// Only save if it's not already 'disabled' (to preserve user's original choice)
			if (currentRecordingValue !== 'disabled') {
				this.recordingStateBeforeE2EE = currentRecordingValue;
			}

			// Disable recording automatically
			recordingStep.formGroup.patchValue({
				recordingEnabled: 'disabled'
			}, { emitEvent: true });
		} else {
			// Restore the previous recording state when E2EE is disabled
			if (this.recordingStateBeforeE2EE !== null) {
				recordingStep.formGroup.patchValue({
					recordingEnabled: this.recordingStateBeforeE2EE
				}, { emitEvent: true });

				// Clear the saved state
				this.recordingStateBeforeE2EE = null;
			}
		}
	}

	onChatToggleChange(event: any): void {
		const isEnabled = event.checked;
		this.configForm.patchValue({ chatEnabled: isEnabled });
	}

	onVirtualBackgroundToggleChange(event: any): void {
		const isEnabled = event.checked;
		this.configForm.patchValue({ virtualBackgroundsEnabled: isEnabled });
	}

	get chatEnabled(): boolean {
		return this.configForm.value.chatEnabled || false;
	}

	get virtualBackgroundsEnabled(): boolean {
		return this.configForm.value.virtualBackgroundEnabled ?? false;
	}

	get e2eeEnabled(): boolean {
		return this.configForm.value.e2eeEnabled ?? false;
	}
}
