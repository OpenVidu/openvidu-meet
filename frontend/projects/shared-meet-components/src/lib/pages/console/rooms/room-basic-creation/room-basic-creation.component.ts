import { Component, effect, EventEmitter, OnDestroy, Output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RoomWizardStateService } from '@lib/services';
import { MeetRoomOptions } from '@lib/typings/ce';
import { Subject, takeUntil } from 'rxjs';

@Component({
    selector: 'ov-room-basic-creation',
    imports: [
        ReactiveFormsModule,
        MatButtonModule,
        MatIconModule,
        MatInputModule,
        MatFormFieldModule,
        MatTooltipModule
    ],
    templateUrl: './room-basic-creation.component.html',
    styleUrl: './room-basic-creation.component.scss'
})
export class RoomBasicCreationComponent implements OnDestroy {
	@Output() createRoom = new EventEmitter<string | undefined>();
	@Output() openAdvancedMode = new EventEmitter<void>();

	roomDetailsForm = new FormGroup({
		roomName: new FormControl('Room', [Validators.maxLength(50)])
	});

	private destroy$ = new Subject<void>();

	constructor(private wizardService: RoomWizardStateService) {
		effect(() => {
			const steps = this.wizardService.steps();
			if (steps.length !== 0) {
				this.roomDetailsForm = steps[0].formGroup;

				this.roomDetailsForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
					this.saveFormData(value);
				});
			}
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private saveFormData(formValue: any) {
		const stepData: Partial<MeetRoomOptions> = {
			roomName: formValue.roomName
		};
		this.wizardService.updateStepData('roomDetails', stepData);
	}

	onCreateRoom() {
		if (this.roomDetailsForm.valid) {
			const formValue = this.roomDetailsForm.value;
			this.createRoom.emit(formValue.roomName || undefined);
		}
	}

	onOpenAdvancedMode() {
		this.openAdvancedMode.emit();
	}

	get isFormValid(): boolean {
		return this.roomDetailsForm.valid && !this.roomDetailsForm.pending;
	}
}
