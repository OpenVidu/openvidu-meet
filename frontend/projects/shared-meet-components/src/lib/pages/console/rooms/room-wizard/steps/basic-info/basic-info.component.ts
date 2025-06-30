import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject, takeUntil } from 'rxjs';
import { RoomWizardStateService } from '../../../../../../services';

interface BasicInfoData {
	roomIdPrefix?: string;
	autoDeletionDate?: number;
}

@Component({
	selector: 'ov-room-wizard-basic-info',
	standalone: true,
	imports: [
		CommonModule,
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
export class RoomWizardBasicInfoComponent implements OnInit, OnDestroy {
	basicInfoForm: FormGroup;
	private destroy$ = new Subject<void>();

	// Arrays for time selection
	hours = Array.from({ length: 24 }, (_, i) => ({ value: i, display: i.toString().padStart(2, '0') }));
	minutes = Array.from({ length: 60 }, (_, i) => ({ value: i, display: i.toString().padStart(2, '0') }));

	constructor(
		private fb: FormBuilder,
		private wizardState: RoomWizardStateService
	) {
		this.basicInfoForm = this.fb.group({
			roomIdPrefix: ['', [Validators.maxLength(50)]],
			autoDeletionDate: [null],
			autoDeletionHour: [23], // Default to 23:59
			autoDeletionMinute: [59]
		});
	}

	ngOnInit() {
		this.loadExistingData();

		this.basicInfoForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
		this.clearForm();
	}

	private loadExistingData() {
		const wizardData = this.wizardState.getWizardData();
		const currentData = wizardData?.basic as BasicInfoData;

		if (currentData && currentData.autoDeletionDate) {
			const date = new Date(currentData.autoDeletionDate);
			this.basicInfoForm.patchValue({
				roomIdPrefix: currentData.roomIdPrefix || '',
				autoDeletionDate: date,
				autoDeletionHour: date.getHours(),
				autoDeletionMinute: date.getMinutes()
			});
		} else if (currentData) {
			this.basicInfoForm.patchValue({
				roomIdPrefix: currentData.roomIdPrefix || ''
			});
		}
	}
	private saveFormData(formValue: any) {
		let autoDeletionDateTime: number | undefined = undefined;

		debugger;
		// If date is selected, combine it with time
		if (formValue.autoDeletionDate) {
			const date = new Date(formValue.autoDeletionDate);
			date.setHours(formValue.autoDeletionHour || 23);
			date.setMinutes(formValue.autoDeletionMinute || 59);
			date.setSeconds(0);
			date.setMilliseconds(0);
			autoDeletionDateTime = date.getTime();
		}

		const data: BasicInfoData = {
			roomIdPrefix: formValue.roomIdPrefix || undefined,
			autoDeletionDate: autoDeletionDateTime
		};

		// Always save to wizard state (including when values are cleared)
		this.wizardState.updateStepData('basic', data);
	}

	clearForm() {
		this.basicInfoForm.reset();
		this.wizardState.updateStepData('basic', {});
	}

	get minDate(): Date {
		return new Date();
	}

	clearDeletionDate() {
		this.basicInfoForm.patchValue({
			autoDeletionDate: null,
			autoDeletionHour: 23, // Reset to default values
			autoDeletionMinute: 59
		});
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
}
