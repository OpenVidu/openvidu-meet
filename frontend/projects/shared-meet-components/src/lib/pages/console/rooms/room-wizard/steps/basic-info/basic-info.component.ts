import { Component, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RoomWizardStateService } from '@lib/services';
import { MeetRoomOptions } from '@lib/typings/ce';
import { Subject, takeUntil } from 'rxjs';

@Component({
	selector: 'ov-room-wizard-basic-info',
	standalone: true,
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
	templateUrl: './basic-info.component.html',
	styleUrl: './basic-info.component.scss'
})
export class RoomWizardBasicInfoComponent implements OnDestroy {
	basicInfoForm: FormGroup;

	// Arrays for time selection
	hours = Array.from({ length: 24 }, (_, i) => ({ value: i, display: i.toString().padStart(2, '0') }));
	minutes = Array.from({ length: 60 }, (_, i) => ({ value: i, display: i.toString().padStart(2, '0') }));

	private destroy$ = new Subject<void>();

	constructor(private wizardService: RoomWizardStateService) {
		const currentStep = this.wizardService.currentStep();
		this.basicInfoForm = currentStep!.formGroup;

		this.basicInfoForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private saveFormData(formValue: any) {
		let autoDeletionDateTime: number | undefined = undefined;

		// If date is selected, combine it with time
		if (formValue.autoDeletionDate) {
			const date = new Date(formValue.autoDeletionDate);
			date.setHours(formValue.autoDeletionHour || 23);
			date.setMinutes(formValue.autoDeletionMinute || 59);
			date.setSeconds(0);
			date.setMilliseconds(0);
			autoDeletionDateTime = date.getTime();
		}

		const stepData: Partial<MeetRoomOptions> = {
			roomIdPrefix: formValue.roomIdPrefix,
			autoDeletionDate: autoDeletionDateTime
		};

		// Always save to wizard state (including when values are cleared)
		this.wizardService.updateStepData('basic', stepData);
	}

	get minDate(): Date {
		const now = new Date();
		now.setHours(now.getHours() + 1, 0, 0, 0); // Set to 1 hour in the future
		return now;
	}

	get hasDateSelected(): boolean {
		return !!this.basicInfoForm.get('autoDeletionDate')?.value;
	}

	getFormattedDateTime(): string {
		const formValue = this.basicInfoForm.value;
		if (!formValue.autoDeletionDate) {
			return '';
		}

		const date = new Date(formValue.autoDeletionDate);
		const hour = formValue.autoDeletionHour || 23;
		const minute = formValue.autoDeletionMinute || 59;

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
		this.basicInfoForm.patchValue({
			autoDeletionDate: null,
			autoDeletionHour: 23,
			autoDeletionMinute: 59
		});
	}
}
