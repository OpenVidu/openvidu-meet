import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
	MeetRoomAutoDeletionPolicy,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomOptions
} from '@openvidu-meet/typings';
import { RoomDetailsFormGroup, RoomDetailsFormValue } from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services';

@Component({
	selector: 'ov-room-details',
	imports: [
		ReactiveFormsModule,
		MatButtonModule,
		MatIconModule,
		MatInputModule,
		MatFormFieldModule,
		MatDatepickerModule,
		MatNativeDateModule,
		MatSelectModule,
		MatTooltipModule
	],
	templateUrl: './room-details.component.html',
	styleUrl: './room-details.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomWizardRoomDetailsComponent {
	private wizardService = inject(RoomWizardStateService);

	roomDetailsForm: RoomDetailsFormGroup;

	// Arrays for time selection
	hours = Array.from({ length: 24 }, (_, i) => ({ value: i, display: i.toString().padStart(2, '0') }));
	minutes = Array.from({ length: 60 }, (_, i) => ({ value: i, display: i.toString().padStart(2, '0') }));

	meetingPolicyOptions = [
		{
			value: MeetRoomDeletionPolicyWithMeeting.FORCE,
			label: 'Force',
			description:
				'The meeting will be ended, and the room will be deleted without waiting for participants to leave.'
		},
		{
			value: MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS,
			label: 'When meeting ends',
			description: 'The room will be deleted when the meeting ends.'
		}
	];
	recordingPolicyOptions = [
		{
			value: MeetRoomDeletionPolicyWithRecordings.FORCE,
			label: 'Force',
			description: 'The room and its recordings will be deleted.'
		},
		{
			value: MeetRoomDeletionPolicyWithRecordings.CLOSE,
			label: 'Close',
			description: 'The room will be closed instead of deleted, maintaining its recordings.'
		}
	];

	constructor() {
		const roomDetailsStep = this.wizardService.getStepById(WizardStepId.ROOM_DETAILS);
		if (!roomDetailsStep) {
			throw new Error('roomDetails step not found in wizard state');
		}
		this.roomDetailsForm = roomDetailsStep.formGroup;

		this.roomDetailsForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	private saveFormData(formValue: Partial<RoomDetailsFormValue>): void {
		let autoDeletionDateTime: number | undefined = undefined;
		let autoDeletionPolicy: MeetRoomAutoDeletionPolicy | undefined = undefined;

		// If date is selected
		if (formValue.autoDeletionDate) {
			// Combine date with time
			const date = new Date(formValue.autoDeletionDate);
			date.setHours(formValue.autoDeletionHour ?? 23);
			date.setMinutes(formValue.autoDeletionMinute ?? 59);
			date.setSeconds(0);
			date.setMilliseconds(0);
			autoDeletionDateTime = date.getTime();

			// Set auto deletion policy
			autoDeletionPolicy = {
				withMeeting:
					formValue.autoDeletionPolicyWithMeeting ?? MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS,
				withRecordings: formValue.autoDeletionPolicyWithRecordings ?? MeetRoomDeletionPolicyWithRecordings.CLOSE
			};
		}

		const stepData: Partial<MeetRoomOptions> = {
			roomName: formValue.roomName,
			autoDeletionDate: autoDeletionDateTime,
			autoDeletionPolicy
		};

		// Always save to wizard state (including when values are cleared)
		this.wizardService.updateStepData(stepData);
	}

	get minDate(): Date {
		const now = new Date();
		now.setHours(now.getHours() + 1, 0, 0, 0); // Set to 1 hour in the future
		return now;
	}

	get hasDateSelected(): boolean {
		return !!this.roomDetailsForm.controls.autoDeletionDate.value;
	}

	getFormattedDateTime(): string {
		const formValue = this.roomDetailsForm.getRawValue();
		if (!formValue.autoDeletionDate) {
			return '';
		}

		const date = formValue.autoDeletionDate;
		const hour = formValue.autoDeletionHour;
		const minute = formValue.autoDeletionMinute;

		date.setHours(hour);
		date.setMinutes(minute);

		return date.toLocaleString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
	}

	clearDeletionDate() {
		this.roomDetailsForm.patchValue({
			autoDeletionDate: undefined,
			autoDeletionHour: 23,
			autoDeletionMinute: 59
		});
	}

	getMeetingPolicyDescription(): string {
		const selectedValue = this.roomDetailsForm.controls.autoDeletionPolicyWithMeeting.value;
		const option = this.meetingPolicyOptions.find((opt) => opt.value === selectedValue);
		return option?.description || '';
	}

	getRecordingPolicyDescription(): string {
		const selectedValue = this.roomDetailsForm.controls.autoDeletionPolicyWithRecordings.value;
		const option = this.recordingPolicyOptions.find((opt) => opt.value === selectedValue);
		return option?.description || '';
	}
}
