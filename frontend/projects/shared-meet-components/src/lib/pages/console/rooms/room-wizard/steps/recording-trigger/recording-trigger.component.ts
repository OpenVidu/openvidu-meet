import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { SelectableCardComponent, SelectableOption, SelectionEvent } from '@lib/components';
import { RoomWizardStateService } from '@lib/services';
import { Subject, takeUntil } from 'rxjs';

@Component({
	selector: 'ov-recording-trigger',
	standalone: true,
	imports: [
		CommonModule,
		ReactiveFormsModule,
		MatButtonModule,
		MatIconModule,
		MatCardModule,
		MatRadioModule,
		SelectableCardComponent
	],
	templateUrl: './recording-trigger.component.html',
	styleUrl: './recording-trigger.component.scss'
})
export class RecordingTriggerComponent implements OnDestroy {
	triggerForm: FormGroup;
	triggerOptions: SelectableOption[] = [
		{
			id: 'manual',
			title: 'Manual Recording',
			description: 'Start recording manually when needed',
			icon: 'touch_app'
			// recommended: true
		},
		{
			id: 'auto1',
			title: 'Auto 1 Participant',
			description: 'Auto-start recording when 1 participant joins',
			icon: 'person',
			isPro: true,
			disabled: true
		},
		{
			id: 'auto2',
			title: 'Auto 2 Participants',
			description: 'Auto-start recording when 2 participants join',
			icon: 'people',
			isPro: true,
			disabled: true
		}
	];

	private destroy$ = new Subject<void>();

	constructor(private wizardService: RoomWizardStateService) {
		const currentStep = this.wizardService.currentStep();
		this.triggerForm = currentStep!.formGroup;

		this.triggerForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private saveFormData(formValue: any) {
		// Note: Recording trigger type is not part of MeetRoomOptions
		// For now, just keep the form state
	}

	/**
	 * Handle option selection from the SelectableCardComponent
	 */
	onOptionChange(event: SelectionEvent): void {
		this.triggerForm.patchValue({
			triggerType: event.optionId
		});
	}

	/**
	 * Get the currently selected option ID for the SelectableCardComponent
	 */
	get selectedOption(): string {
		return this.triggerForm.value.triggerType || 'manual';
	}
}
