import { Component, computed, inject, Signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MeetRecordingLayout } from '@openvidu-meet/typings';
import { SelectableCardComponent, SelectableCardOption, SelectionCardEvent, ThemeService } from '../../../../../../shared';
import { RoomWizardStateService } from '../../../../services';

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
	styleUrl: './recording-layout.component.scss'
})
export class RecordingLayoutComponent {
	private themeService = inject(ThemeService);
	private wizardService = inject(RoomWizardStateService);
	protected theme = this.themeService.currentTheme;
	layoutForm: FormGroup;
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

	private formValues: Signal<any>;
	selectedOption: Signal<MeetRecordingLayout>;

	constructor() {
		const currentStep = this.wizardService.currentStep();
		this.layoutForm = currentStep!.formGroup;

		// Initialize formValues signal after layoutForm is created
		this.formValues = toSignal(this.layoutForm.valueChanges, {
			initialValue: this.layoutForm.value
		});

		// Initialize selectedOption computed signal
		this.selectedOption = computed(() => {
			const formValue = this.formValues();
			return formValue?.layout || MeetRecordingLayout.GRID;
		});

		// Subscribe to form changes to save data (using takeUntilDestroyed for automatic cleanup)
		this.layoutForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	private saveFormData(formValue: any) {
		const roomOptions = this.wizardService.roomOptions();
		if (roomOptions.config?.recording) {
			roomOptions.config.recording.layout = formValue.layout;
			this.wizardService.updateStepData('recordingLayout', formValue);
		}
	}

	onOptionSelect(event: SelectionCardEvent): void {
		this.layoutForm.patchValue({
			layout: event.optionId
		});
	}
}
