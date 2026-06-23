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
import { TranslatePipe } from '../../../../../../shared/pipes/translate.pipe';
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
		MatTooltipModule,
		TranslatePipe
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
			label: 'ROOMS.WIZARD.DETAILS.MEETING_FORCE_LABEL',
			description: 'ROOMS.WIZARD.DETAILS.MEETING_FORCE_DESC'
		},
		{
			value: MeetRoomDeletionPolicyWithMeeting.WHEN_MEETING_ENDS,
			label: 'ROOMS.WIZARD.DETAILS.MEETING_WHEN_ENDS_LABEL',
			description: 'ROOMS.WIZARD.DETAILS.MEETING_WHEN_ENDS_DESC'
		}
	];
	recordingPolicyOptions = [
		{
			value: MeetRoomDeletionPolicyWithRecordings.FORCE,
			label: 'ROOMS.WIZARD.DETAILS.RECORDINGS_FORCE_LABEL',
			description: 'ROOMS.WIZARD.DETAILS.RECORDINGS_FORCE_DESC'
		},
		{
			value: MeetRoomDeletionPolicyWithRecordings.CLOSE,
			label: 'ROOMS.WIZARD.DETAILS.RECORDINGS_CLOSE_LABEL',
			description: 'ROOMS.WIZARD.DETAILS.RECORDINGS_CLOSE_DESC'
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
