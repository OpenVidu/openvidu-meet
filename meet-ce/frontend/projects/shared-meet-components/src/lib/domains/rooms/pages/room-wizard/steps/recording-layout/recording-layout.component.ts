import { ChangeDetectionStrategy, Component, computed, inject, Signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MeetRecordingLayout, MeetRoomOptions } from '@openvidu-meet/typings';
import {
	SelectableCardComponent,
	SelectableCardOption,
	SelectionCardEvent
} from '../../../../../../shared/components/selectable-card/selectable-card.component';
import { ThemeService } from '../../../../../../shared/services/theme.service';
import { RecordingLayoutFormGroup, RecordingLayoutFormValue } from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';

@Component({
	selector: 'ov-recording-layout',
	imports: [
		ReactiveFormsModule,
		MatButtonModule,
		MatIconModule,
		MatCardModule,
		MatRadioModule,
		SelectableCardComponent
	],
	templateUrl: './recording-layout.component.html',
	styleUrl: './recording-layout.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordingLayoutComponent {
	private themeService = inject(ThemeService);
	private wizardService = inject(RoomWizardStateService);

	protected theme = this.themeService.currentTheme;

	layoutOptions: Signal<SelectableCardOption[]> = computed(() => {
		return [
			{
				id: MeetRecordingLayout.GRID,
				title: 'Grid Layout',
				description: 'Display participants in an equal-size grid',
				imageUrl: `./assets/layouts/grid_${this.theme()}.png`
			},
			{
				id: MeetRecordingLayout.SPEAKER,
				title: 'Speaker Layout',
				description: 'Highlight the active speaker with other participants below',
				imageUrl: `./assets/layouts/speaker_${this.theme()}.png`,
				isPro: false,
				disabled: false
				// recommended: true
			},
			{
				id: MeetRecordingLayout.SINGLE_SPEAKER,
				title: 'Single Speaker',
				description: 'Show only the active speaker in the recording',
				imageUrl: `./assets/layouts/single_speaker_${this.theme()}.png`,
				isPro: false,
				disabled: false
			}
		];
	});
	selectedOption: Signal<MeetRecordingLayout>;

	layoutForm: RecordingLayoutFormGroup;
	private formValues: Signal<Partial<RecordingLayoutFormValue>>;

	constructor() {
		const recordingLayoutStep = this.wizardService.getStepById(WizardStepId.RECORDING_LAYOUT);
		if (!recordingLayoutStep) {
			throw new Error('recordingLayout step not found in wizard state');
		}
		this.layoutForm = recordingLayoutStep.formGroup;

		// Initialize formValues signal after layoutForm is created
		this.formValues = toSignal(this.layoutForm.valueChanges, {
			initialValue: this.layoutForm.getRawValue()
		});

		// Initialize selectedOption computed signal
		this.selectedOption = computed(() => {
			const formValue = this.formValues();
			return formValue.layout || MeetRecordingLayout.GRID;
		});

		// Subscribe to form changes to save data (using takeUntilDestroyed for automatic cleanup)
		this.layoutForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	private saveFormData(formValue: Partial<RecordingLayoutFormValue>): void {
		const roomOptions = this.wizardService.roomOptions();
		const stepData: Partial<MeetRoomOptions> = {
			config: {
				recording: {
					enabled: roomOptions.config?.recording?.enabled ?? false,
					layout: formValue.layout ?? MeetRecordingLayout.GRID
				}
			}
		};

		this.wizardService.updateStepData(stepData);
	}

	onOptionSelect(event: SelectionCardEvent): void {
		this.layoutForm.patchValue({
			layout: event.optionId as MeetRecordingLayout
		});
	}
}
