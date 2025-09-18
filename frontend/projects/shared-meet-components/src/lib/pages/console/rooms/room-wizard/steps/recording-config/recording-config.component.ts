import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { SelectableCardComponent, SelectableOption, SelectionEvent } from '@lib/components';
import { RoomWizardStateService } from '@lib/services';
import { MeetRecordingAccess } from '@lib/typings/ce';
import { Subject, takeUntil } from 'rxjs';

interface RecordingAccessOption {
	value: MeetRecordingAccess;
	label: string;
}

@Component({
	selector: 'ov-recording-config',
	standalone: true,
	imports: [
		CommonModule,
		ReactiveFormsModule,
		MatButtonModule,
		MatIconModule,
		MatCardModule,
		MatRadioModule,
		MatSelectModule,
		MatFormFieldModule,
		SelectableCardComponent
	],
	templateUrl: './recording-config.component.html',
	styleUrl: './recording-config.component.scss'
})
export class RecordingConfigComponent implements OnDestroy {
	recordingForm: FormGroup;
	isAnimatingOut = false;

	recordingOptions: SelectableOption[] = [
		{
			id: 'enabled',
			title: 'Allow Recording',
			description:
				'Enable recording capabilities for this room. Recordings can be started manually or automatically.',
			icon: 'video_library'
			// recommended: true
		},
		{
			id: 'disabled',
			title: 'No Recording',
			description: 'Room will not be recorded. Participants can join without recording concerns.',
			icon: 'videocam_off'
		}
	];
	recordingAccessOptions: RecordingAccessOption[] = [
		{
			value: MeetRecordingAccess.ADMIN,
			label: 'Only Admin'
		},
		{
			value: MeetRecordingAccess.ADMIN_MODERATOR,
			label: 'Admin and Moderators'
		},
		{
			value: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER,
			label: 'Admin, Moderators and Speakers'
		}
	];

	private destroy$ = new Subject<void>();

	constructor(private wizardState: RoomWizardStateService) {
		const currentStep = this.wizardState.currentStep();
		this.recordingForm = currentStep!.formGroup;

		this.recordingForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private saveFormData(formValue: any) {
		const enabled = formValue.recordingEnabled === 'enabled';

		const stepData: any = {
			config: {
				recording: {
					enabled,
					...(enabled && { allowAccessTo: formValue.allowAccessTo })
				}
			}
		};

		this.wizardState.updateStepData('recording', stepData);
	}

	onOptionSelect(event: SelectionEvent): void {
		const previouslyEnabled = this.isRecordingEnabled;
		const willBeEnabled = event.optionId === 'enabled';

		// If we are disabling the recording, we want to animate out
		if (previouslyEnabled && !willBeEnabled) {
			this.isAnimatingOut = true;
			// Wait for the animation to finish before updating the form
			setTimeout(() => {
				this.recordingForm.patchValue({
					recordingEnabled: event.optionId
				});
				this.isAnimatingOut = false;
			}, 100); // Animation duration
		} else {
			// If we are enabling or keeping it enabled, just update the form
			this.recordingForm.patchValue({
				recordingEnabled: event.optionId
			});
		}
	}

	get selectedValue(): string {
		return this.recordingForm.value.recordingEnabled || 'disabled';
	}

	get isRecordingEnabled(): boolean {
		return this.selectedValue === 'enabled';
	}

	get shouldShowAccessSection(): boolean {
		return this.isRecordingEnabled || this.isAnimatingOut;
	}
}
