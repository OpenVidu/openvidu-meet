import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Subject, takeUntil } from 'rxjs';
import { RoomWizardStateService } from '../../../../../../services';
import {
	SelectableCardComponent,
	SelectableOption,
	SelectionEvent
} from '../../../../../../components/selectable-card/selectable-card.component';
import { MeetRecordingAccess } from '../../../../../../../../../../../typings/src/room-preferences';

interface RecordingPreferencesData {
	enabled: boolean;
	allowAccessTo?: MeetRecordingAccess;
}

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
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private loadExistingData() {
		const wizardData = this.wizardState.getWizardData();
		const currentData = wizardData?.recording as RecordingPreferencesData;

		if (currentData !== undefined) {
			this.recordingForm.patchValue({
				recordingEnabled: currentData.enabled ? 'enabled' : 'disabled',
				allowAccessTo: currentData.allowAccessTo || 'admin'
			});
		}
	}

	private saveFormData(formValue: any) {
		const data: RecordingPreferencesData = {
			enabled: formValue.recordingEnabled === 'enabled',
			...(formValue.recordingEnabled === 'enabled' && {
				allowAccessTo: formValue.allowAccessTo
			})
		};

		this.wizardState.updateStepData('recording', data);
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
