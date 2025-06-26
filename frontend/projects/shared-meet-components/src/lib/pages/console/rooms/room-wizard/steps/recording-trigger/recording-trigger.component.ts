import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { Subject, takeUntil } from 'rxjs';
import { RoomWizardStateService } from '../../../../../../services/wizard-state.service';
import {
	SelectableCardComponent,
	SelectableOption,
	SelectionEvent
} from '../../../../../../components/selectable-card/selectable-card.component';

interface RecordingTriggerData {
	type: 'manual' | 'auto1' | 'auto2';
}

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
export class RecordingTriggerComponent implements OnInit, OnDestroy {
	triggerForm: FormGroup;
	private destroy$ = new Subject<void>();

	triggerOptions: SelectableOption[] = [
		{
			id: 'manual',
			title: 'Manual Recording',
			description: 'Start recording manually when needed',
			icon: 'touch_app',
			recommended: true,
			isPro: false
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

	constructor(
		private fb: FormBuilder,
		private wizardState: RoomWizardStateService
	) {
		this.triggerForm = this.fb.group({
			triggerType: ['manual'] // default to manual
		});
	}

	ngOnInit() {
		// Load existing data if available
		this.loadExistingData();

		// Subscribe to form changes for auto-save
		this.triggerForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private loadExistingData() {
		const wizardData = this.wizardState.getWizardData();
		const currentData = wizardData?.recordingTrigger as RecordingTriggerData;

		if (currentData !== undefined) {
			this.triggerForm.patchValue({
				triggerType: currentData.type
			});
		}
	}

	private saveFormData(formValue: any) {
		const data: RecordingTriggerData = {
			type: formValue.triggerType
		};

		this.wizardState.updateStepData('recordingTrigger', data);
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
