import { Component, OnInit, OnDestroy, Input } from '@angular/core';
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
import { MeetRoomOptions } from '../../../../../../typings/ce';

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
	@Input() editMode: boolean = false; // Input to control edit mode from parent component
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
			autoDeletionHour: [23],
			autoDeletionMinute: [59]
		});
	}

	ngOnInit() {
		// Disable form controls in edit mode
		if (this.editMode) {
			this.basicInfoForm.get('roomIdPrefix')?.disable();
			this.basicInfoForm.get('autoDeletionDate')?.disable();
			this.basicInfoForm.get('autoDeletionHour')?.disable();
			this.basicInfoForm.get('autoDeletionMinute')?.disable();
		}

		this.loadExistingData();

		this.basicInfoForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private loadExistingData() {
		const roomOptions = this.wizardState.getRoomOptions();

		if (roomOptions.autoDeletionDate) {
			const date = new Date(roomOptions.autoDeletionDate);
			this.basicInfoForm.patchValue({
				roomIdPrefix: roomOptions.roomIdPrefix || '',
				autoDeletionDate: date,
				autoDeletionHour: date.getHours(),
				autoDeletionMinute: date.getMinutes()
			});
		} else {
			this.basicInfoForm.patchValue({
				roomIdPrefix: roomOptions.roomIdPrefix || ''
			});
		}
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
		this.wizardState.updateStepData('basic', stepData);
	}

	clearForm() {
		this.basicInfoForm.reset();
		this.wizardState.updateStepData('basic', {
			roomIdPrefix: '',
			autoDeletionDate: undefined
		});
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
