import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
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
	selector: 'ov-recording-preferences',
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
	templateUrl: './recording-preferences.component.html',
	styleUrl: './recording-preferences.component.scss'
})
export class RecordingPreferencesComponent implements OnInit, OnDestroy {
	recordingForm: FormGroup;
	private destroy$ = new Subject<void>();
	isAnimatingOut = false;

	recordingOptions: SelectableOption[] = [
		{
			id: 'disabled',
			title: 'No Recording',
			description: 'Room will not be recorded. Participants can join without recording concerns.',
			icon: 'videocam_off'
		},
		{
			id: 'enabled',
			title: 'Allow Recording',
			description:
				'Enable recording capabilities for this room. Recordings can be started manually or automatically.',
			icon: 'video_library'
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
			value: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER,
			label: 'Admin, Moderators and Publishers'
		}
	];

	constructor(
		private fb: FormBuilder,
		private wizardState: RoomWizardStateService
	) {
		this.recordingForm = this.fb.group({
			recordingEnabled: ['disabled'], // default to no recording
			allowAccessTo: ['admin'] // default access level
		});
	}

	ngOnInit() {
		this.loadExistingData();

		this.recordingForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});

		// Save initial default value if no existing data
		this.saveInitialDefaultIfNeeded();
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private loadExistingData() {
		const roomOptions = this.wizardState.getRoomOptions();
		const recordingPrefs = roomOptions.preferences?.recordingPreferences;

		if (recordingPrefs !== undefined) {
			this.recordingForm.patchValue({
				recordingEnabled: recordingPrefs.enabled ? 'enabled' : 'disabled',
				allowAccessTo: recordingPrefs.allowAccessTo || MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
			});
		}
	}

	private saveFormData(formValue: any) {
		const enabled = formValue.recordingEnabled === 'enabled';

		const stepData: any = {
			preferences: {
				recordingPreferences: {
					enabled,
					...(enabled && { allowAccessTo: formValue.allowAccessTo })
				}
			}
		};

		this.wizardState.updateStepData('recording', stepData);
	}

	private saveInitialDefaultIfNeeded() {
		const roomOptions = this.wizardState.getRoomOptions();
		const recordingPrefs = roomOptions.preferences?.recordingPreferences;

		// If no existing data, save the default value
		if (recordingPrefs === undefined) {
			this.saveFormData(this.recordingForm.value);
		}
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

	isOptionSelected(optionId: 'disabled' | 'enabled'): boolean {
		return this.recordingForm.value.recordingEnabled === optionId;
	}

	get selectedValue(): string {
		return this.recordingForm.value.recordingEnabled;
	}

	get isRecordingEnabled(): boolean {
		return this.recordingForm.value.recordingEnabled === 'enabled';
	}

	get shouldShowAccessSection(): boolean {
		return this.isRecordingEnabled || this.isAnimatingOut;
	}

	setRecommendedOption() {
		this.recordingForm.patchValue({
			recordingEnabled: 'enabled'
		});
	}

	setDefaultOption() {
		this.recordingForm.patchValue({
			recordingEnabled: 'disabled'
		});
	}

	get currentSelection(): SelectableOption | undefined {
		const selectedId = this.recordingForm.value.recordingEnabled;
		return this.recordingOptions.find((option) => option.id === selectedId);
	}
}
