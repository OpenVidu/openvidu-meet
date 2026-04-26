import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import {
	SelectableCardComponent,
	SelectableCardOption,
	SelectionCardEvent
} from '../../../../../../shared//components/selectable-card/selectable-card.component';
import { RecordingTriggerFormGroup, RecordingTriggerType } from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';

@Component({
	selector: 'ov-recording-trigger',
	imports: [
		ReactiveFormsModule,
		MatButtonModule,
		MatIconModule,
		MatCardModule,
		MatRadioModule,
		SelectableCardComponent
	],
	templateUrl: './recording-trigger.component.html',
	styleUrl: './recording-trigger.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordingTriggerComponent {
	private wizardService = inject(RoomWizardStateService);

	triggerForm: RecordingTriggerFormGroup;
	triggerOptions: SelectableCardOption[] = [
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

	constructor() {
		const recordingTriggerStep = this.wizardService.getStepById(WizardStepId.RECORDING_TRIGGER);
		if (!recordingTriggerStep) {
			throw new Error('recordingTrigger step not found in wizard state');
		}
		this.triggerForm = recordingTriggerStep.formGroup;

		this.triggerForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	private saveFormData(formValue: any) {
		// Note: Recording trigger type is not part of MeetRoomOptions
		// For now, just keep the form state
	}

	/**
	 * Handle option selection from the SelectableCardComponent
	 */
	onOptionChange(event: SelectionCardEvent): void {
		this.triggerForm.patchValue({
			triggerType: event.optionId as RecordingTriggerType
		});
	}

	/**
	 * Get the currently selected option ID for the SelectableCardComponent
	 */
	get selectedOption(): string {
		return this.triggerForm.value.triggerType ?? 'manual';
	}
}
