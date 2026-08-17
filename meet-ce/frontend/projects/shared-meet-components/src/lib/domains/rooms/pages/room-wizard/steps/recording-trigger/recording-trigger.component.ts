import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MeetRecordingAutoStartMode, MeetRoomOptions } from '@openvidu-meet/typings';
import {
	SelectableCardComponent,
	SelectableCardOption,
	SelectionCardEvent
} from '../../../../../../shared//components/selectable-card/selectable-card.component';
import { TranslatePipe } from '../../../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../../../shared/services/i18n/translate.service';
import {
	RecordingTriggerFormGroup,
	RecordingTriggerFormValue,
	RecordingTriggerMode,
	triggerFormValueToAutoStart
} from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';

interface AutoStartOption {
	value: MeetRecordingAutoStartMode;
	icon: string;
	title: string;
	description: string;
}

@Component({
	selector: 'ov-recording-trigger',
	imports: [
		ReactiveFormsModule,
		MatButtonModule,
		MatIconModule,
		MatCardModule,
		MatRadioModule,
		SelectableCardComponent,
		TranslatePipe
	],
	templateUrl: './recording-trigger.component.html',
	styleUrl: './recording-trigger.component.scss'
})
export class RecordingTriggerComponent {
	private wizardService = inject(RoomWizardStateService);
	private readonly translateService = inject(TranslateService);

	triggerForm: RecordingTriggerFormGroup;

	// Top-level decision: whether recording starts by itself at all.
	modeOptions: SelectableCardOption[] = [
		{
			id: 'manual',
			title: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.MANUAL_TITLE'),
			description: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.MANUAL_DESC'),
			icon: 'touch_app'
		},
		{
			id: 'auto',
			title: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTO_TITLE'),
			description: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTO_DESC'),
			icon: 'smart_display'
		}
	];

	// Secondary decision, only shown once "Automatic" is picked: which participant threshold
	// triggers the start.
	autoStartOptions: AutoStartOption[] = [
		{
			value: MeetRecordingAutoStartMode.WHEN_FIRST_PARTICIPANT_JOINS,
			icon: 'person',
			title: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTOSTART_MODE_FIRST_TITLE'),
			description: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTOSTART_MODE_FIRST_DESC')
		},
		{
			value: MeetRecordingAutoStartMode.WHEN_SECOND_PARTICIPANT_JOINS,
			icon: 'people',
			title: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTOSTART_MODE_SECOND_TITLE'),
			description: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTOSTART_MODE_SECOND_DESC')
		},
		{
			value: MeetRecordingAutoStartMode.WHEN_MODERATOR_JOINS,
			icon: 'admin_panel_settings',
			title: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTOSTART_MODE_MODERATOR_TITLE'),
			description: this.translateService.translate('ROOMS.WIZARD.RECORDING_TRIGGER.AUTOSTART_MODE_MODERATOR_DESC')
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

	private saveFormData(formValue: Partial<RecordingTriggerFormValue>) {
		const roomOptions = this.wizardService.roomOptions();
		const stepData: Partial<MeetRoomOptions> = {
			config: {
				recording: {
					enabled: roomOptions.config?.recording?.enabled ?? false,
					autoStart: triggerFormValueToAutoStart(formValue)
				}
			}
		};

		this.wizardService.updateStepData(stepData);
	}

	/**
	 * Handle the top-level Manual/Automatic selection from the SelectableCardComponent.
	 */
	onModeChange(event: SelectionCardEvent): void {
		this.triggerForm.patchValue({
			triggerMode: event.optionId as RecordingTriggerMode
		});
	}

	/**
	 * Currently selected top-level mode, for the SelectableCardComponent.
	 */
	get selectedMode(): string {
		return this.triggerForm.value.triggerMode ?? 'manual';
	}

	/**
	 * Whether the secondary participant-threshold choice should be shown.
	 */
	get isAutoMode(): boolean {
		return this.selectedMode === 'auto';
	}
}
