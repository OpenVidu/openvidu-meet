import { Component, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RoomWizardStateService } from '@lib/services';
import { Subject, takeUntil } from 'rxjs';

@Component({
	selector: 'ov-room-preferences',
	standalone: true,
	imports: [ReactiveFormsModule, MatCardModule, MatIconModule, MatSlideToggleModule],
	templateUrl: './room-preferences.component.html',
	styleUrl: './room-preferences.component.scss'
})
export class RoomPreferencesComponent implements OnDestroy {
	preferencesForm: FormGroup;

	private destroy$ = new Subject<void>();

	constructor(private wizardService: RoomWizardStateService) {
		const currentStep = this.wizardService.currentStep();
		this.preferencesForm = currentStep!.formGroup;

		this.preferencesForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private saveFormData(formValue: any): void {
		const stepData: any = {
			preferences: {
				chatPreferences: {
					enabled: formValue.chatEnabled
				},
				virtualBackgroundPreferences: {
					enabled: formValue.virtualBackgroundsEnabled
				}
			}
		};

		this.wizardService.updateStepData('preferences', stepData);
	}

	onChatToggleChange(event: any): void {
		const isEnabled = event.checked;
		this.preferencesForm.patchValue({ chatEnabled: isEnabled });
	}

	onVirtualBackgroundToggleChange(event: any): void {
		const isEnabled = event.checked;
		this.preferencesForm.patchValue({ virtualBackgroundsEnabled: isEnabled });
	}

	get chatEnabled(): boolean {
		return this.preferencesForm.value.chatEnabled || false;
	}

	get virtualBackgroundsEnabled(): boolean {
		return this.preferencesForm.value.virtualBackgroundsEnabled || false;
	}
}
