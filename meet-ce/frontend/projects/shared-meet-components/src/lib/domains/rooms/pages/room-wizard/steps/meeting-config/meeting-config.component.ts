import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MeetRoomOptions } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../../../shared/pipes/translate.pipe';
import {
	MAX_DURATION_MINUTES_LIMIT,
	MAX_PARTICIPANTS_LIMIT,
	MIN_DURATION_MINUTES_LIMIT,
	MIN_PARTICIPANTS_LIMIT,
	MeetingConfigFormGroup,
	MeetingConfigFormValue
} from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { E2EEExclusiveFeature } from '../../../../services/wizard-state.service';

const E2EE_EXCLUSIVE_FEATURES: { feature: E2EEExclusiveFeature; stepId: WizardStepId; control: string }[] = [
	{ feature: 'recording', stepId: WizardStepId.RECORDING, control: 'recordingEnabled' },
	{ feature: 'broadcast', stepId: WizardStepId.BROADCAST, control: 'broadcastEnabled' }
];
import { RoomWizardStateService } from '../../../../services';

@Component({
	selector: 'ov-meeting-config',
	imports: [
		ReactiveFormsModule,
		MatFormFieldModule,
		MatIconModule,
		MatInputModule,
		MatSlideToggleModule,
		TranslatePipe
	],
	templateUrl: './meeting-config.component.html',
	styleUrl: './meeting-config.component.scss'
})
export class MeetingConfigComponent {
	private wizardService = inject(RoomWizardStateService);

	readonly minParticipantsLimit = MIN_PARTICIPANTS_LIMIT;
	readonly maxParticipantsLimit = MAX_PARTICIPANTS_LIMIT;
	readonly minDurationMinutesLimit = MIN_DURATION_MINUTES_LIMIT;
	readonly maxDurationMinutesLimit = MAX_DURATION_MINUTES_LIMIT;

	/** Set when the configured recording trigger can never fire at this participant limit. */
	autoStartWarningMessage = this.wizardService.recordingAutoStartWarningMessage;

	meetingForm: MeetingConfigFormGroup;

	constructor() {
		const meetingStep = this.wizardService.getStepById(WizardStepId.MEETING);

		if (!meetingStep) {
			throw new Error('meeting step not found in wizard state');
		}

		this.meetingForm = meetingStep.formGroup;

		this.meetingForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	private saveFormData(formValue: Partial<MeetingConfigFormValue>): void {
		const stepData: Partial<MeetRoomOptions> = {
			config: {
				chat: {
					enabled: formValue.chatEnabled ?? false
				},
				virtualBackground: {
					enabled: formValue.virtualBackgroundEnabled ?? false
				},
				e2ee: {
					enabled: formValue.e2eeEnabled ?? false
				},
				captions: {
					enabled: formValue.captionsEnabled ?? false
				},
				raiseHand: {
					enabled: formValue.raiseHandEnabled ?? false
				},
				reactions: {
					enabled: formValue.reactionsEnabled ?? false
				},
				initialAudioActive: formValue.initialAudioActive ?? true,
				initialVideoActive: formValue.initialVideoActive ?? true,
				maxParticipants: this.normalizedLimit(
					this.meetingForm.controls.maxParticipants,
					formValue.maxParticipants
				),
				maxDurationMinutes: this.normalizedLimit(
					this.meetingForm.controls.maxDurationMinutes,
					formValue.maxDurationMinutes
				)
			}
		};

		this.wizardService.updateStepData(stepData);
	}

	/**
	 * Maps a limit input to its persisted `config` value: an empty input is `null` (the stored
	 * "unlimited" value), and an invalid draft is `undefined` so the wizard's deep-merge keeps the
	 * last valid value while the form invalidity blocks finishing.
	 */
	private normalizedLimit(
		control: FormControl<number | null>,
		value: number | null | undefined
	): number | null | undefined {
		if (control.invalid) {
			return undefined;
		}

		return value ?? null;
	}

	onE2EEToggleChange(event: MatSlideToggleChange): void {
		const isEnabled = event.checked;
		this.meetingForm.patchValue({
			e2eeEnabled: isEnabled
		});

		// Encryption excludes every server-side composition of the meeting: turning it on turns
		// recording and live broadcast off, remembering what they were so turning it off restores them.
		for (const { feature, stepId, control } of E2EE_EXCLUSIVE_FEATURES) {
			const step = this.wizardService.getStepById(stepId);

			if (!step) continue;

			const featureControl = (step.formGroup as FormGroup).get(control) as FormControl<boolean>;

			if (isEnabled) {
				if (featureControl.value) {
					this.wizardService.rememberFeatureStateBeforeE2EE(feature, true);
				}

				this.setFeatureEnabled(feature, featureControl, false);
				continue;
			}

			const previousState = this.wizardService.takeFeatureStateBeforeE2EE(feature);

			if (previousState !== undefined) {
				this.setFeatureEnabled(feature, featureControl, previousState);
			}
		}
	}

	private setFeatureEnabled(feature: E2EEExclusiveFeature, control: FormControl<boolean>, enabled: boolean): void {
		control.patchValue(enabled, { emitEvent: true });
		this.wizardService.updateStepData({ config: { [feature]: { enabled } } });
	}

	onChatToggleChange(event: MatSlideToggleChange): void {
		const isEnabled = event.checked;
		this.meetingForm.patchValue({ chatEnabled: isEnabled });
	}

	onVirtualBackgroundToggleChange(event: MatSlideToggleChange): void {
		const isEnabled = event.checked;
		this.meetingForm.patchValue({ virtualBackgroundEnabled: isEnabled });
	}

	onCaptionsToggleChange(event: MatSlideToggleChange): void {
		const isEnabled = event.checked;
		this.meetingForm.patchValue({ captionsEnabled: isEnabled });
	}

	onRaiseHandToggleChange(event: MatSlideToggleChange): void {
		this.meetingForm.patchValue({ raiseHandEnabled: event.checked });
	}

	onReactionsToggleChange(event: MatSlideToggleChange): void {
		this.meetingForm.patchValue({ reactionsEnabled: event.checked });
	}

	get chatEnabled(): boolean {
		return this.meetingForm.value.chatEnabled ?? false;
	}

	get virtualBackgroundEnabled(): boolean {
		return this.meetingForm.value.virtualBackgroundEnabled ?? false;
	}

	get e2eeEnabled(): boolean {
		return this.meetingForm.value.e2eeEnabled ?? false;
	}

	get captionsEnabled(): boolean {
		return this.meetingForm.value.captionsEnabled ?? false;
	}

	get raiseHandEnabled(): boolean {
		return this.meetingForm.value.raiseHandEnabled ?? false;
	}

	get reactionsEnabled(): boolean {
		return this.meetingForm.value.reactionsEnabled ?? false;
	}
}
