import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Subject, takeUntil } from 'rxjs';
import { RoomWizardStateService } from '../../../../../../services';

@Component({
	selector: 'ov-room-preferences',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule, MatCardModule, MatButtonModule, MatIconModule, MatSlideToggleModule],
	templateUrl: './room-preferences.component.html',
	styleUrl: './room-preferences.component.scss'
})
export class RoomPreferencesComponent implements OnInit, OnDestroy {
	preferencesForm: FormGroup;
	private destroy$ = new Subject<void>();

	constructor(
		private fb: FormBuilder,
		private roomWizardStateService: RoomWizardStateService
	) {
		this.preferencesForm = this.fb.group({
			chatEnabled: [true],
			virtualBackgroundsEnabled: [true]
		});
	}

	ngOnInit(): void {
		// Load existing data from wizard state
		const roomOptions = this.roomWizardStateService.getRoomOptions();
		const preferences = roomOptions.preferences;

		if (preferences) {
			this.preferencesForm.patchValue({
				chatEnabled: preferences.chatPreferences?.enabled ?? true,
				virtualBackgroundsEnabled: preferences.virtualBackgroundPreferences?.enabled ?? true
			});
		}

		// Auto-save form changes
		this.preferencesForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});

		// Save initial default values if no existing data
		this.saveInitialDefaultIfNeeded();
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

		this.roomWizardStateService.updateStepData('preferences', stepData);
	}

	private saveInitialDefaultIfNeeded(): void {
		const roomOptions = this.roomWizardStateService.getRoomOptions();
		const preferences = roomOptions.preferences;

		// If no existing preferences data, save the default values
		if (!preferences?.chatPreferences || !preferences?.virtualBackgroundPreferences) {
			this.saveFormData(this.preferencesForm.value);
		}
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
		return this.preferencesForm.value.chatEnabled;
	}

	get virtualBackgroundsEnabled(): boolean {
		return this.preferencesForm.value.virtualBackgroundsEnabled;
	}
}
