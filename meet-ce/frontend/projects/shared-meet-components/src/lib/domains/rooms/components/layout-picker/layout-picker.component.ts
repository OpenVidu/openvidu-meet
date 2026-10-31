import { Component, computed, inject, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MeetRecordingLayout } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ThemeService } from '../../../../shared/services/theme.service';

interface LayoutOption {
	value: MeetRecordingLayout;
	titleKey: string;
	descriptionKey: string;
	image: string;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
	{
		value: MeetRecordingLayout.GRID,
		titleKey: 'ROOMS.WIZARD.RECORDING_LAYOUT.GRID_TITLE',
		descriptionKey: 'ROOMS.WIZARD.RECORDING_LAYOUT.GRID_DESC',
		image: 'grid'
	},
	{
		value: MeetRecordingLayout.SPEAKER,
		titleKey: 'ROOMS.WIZARD.RECORDING_LAYOUT.SPEAKER_TITLE',
		descriptionKey: 'ROOMS.WIZARD.RECORDING_LAYOUT.SPEAKER_DESC',
		image: 'speaker'
	},
	{
		value: MeetRecordingLayout.SINGLE_SPEAKER,
		titleKey: 'ROOMS.WIZARD.RECORDING_LAYOUT.SINGLE_SPEAKER_TITLE',
		descriptionKey: 'ROOMS.WIZARD.RECORDING_LAYOUT.SINGLE_SPEAKER_DESC',
		image: 'single_speaker'
	}
];

/** The layouts a composed stream of the meeting can take, as tiles bound to one form control. */
@Component({
	selector: 'ov-layout-picker',
	imports: [ReactiveFormsModule, TranslatePipe],
	templateUrl: './layout-picker.component.html',
	styleUrl: './layout-picker.component.scss'
})
export class LayoutPickerComponent {
	readonly control = input.required<FormControl<MeetRecordingLayout>>();

	private readonly theme = inject(ThemeService).currentTheme;

	readonly options = computed(() =>
		LAYOUT_OPTIONS.map((option) => ({
			...option,
			imageUrl: `./assets/layouts/${option.image}_${this.theme()}.png`
		}))
	);
}
