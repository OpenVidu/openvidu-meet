import { Component, effect, EventEmitter, OnDestroy, Output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetRoomOptions } from '@openvidu-meet/typings';
import { Subject, takeUntil } from 'rxjs';
import { RoomWizardStateService } from '../../services';

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
	@Output() createRoom = new EventEmitter<Pick<MeetRoomOptions, 'roomName' | 'passcode' | 'maxParticipants'>>();
	@Output() openAdvancedMode = new EventEmitter<void>();

	roomDetailsForm = new FormGroup({
		roomName: new FormControl('Room', [Validators.maxLength(50)]),
		passcode: new FormControl(''),
		maxParticipants: new FormControl(10, [Validators.required, Validators.min(1)])
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
		const normalizedPasscode = formValue.passcode?.toUpperCase();
		const stepData: Partial<MeetRoomOptions> = {
			roomName: formValue.roomName,
			passcode: normalizedPasscode,
			maxParticipants: formValue.maxParticipants
		};
		this.wizardService.updateStepData('roomDetails', stepData);
	}

	onCreateRoom() {
		if (this.roomDetailsForm.valid) {
			const formValue = this.roomDetailsForm.value;
			const normalizedPasscode = formValue.passcode?.toUpperCase();
			this.createRoom.emit({
				roomName: formValue.roomName || undefined,
				passcode: normalizedPasscode || undefined,
				maxParticipants: formValue.maxParticipants || undefined
			});
		}
	}

	onGeneratePasscode(): void {
		const generated = this.generatePasscode();
		this.roomDetailsForm.get('passcode')?.setValue(generated);
	}

	private generatePasscode(): string {
		const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
		let result = '';

		for (let i = 0; i < 8; i++) {
			result += charset[Math.floor(Math.random() * charset.length)];
		}

		return result;
	}

	onOpenAdvancedMode() {
		this.openAdvancedMode.emit();
	}

	get isFormValid(): boolean {
		return this.roomDetailsForm.valid && !this.roomDetailsForm.pending;
	}
}
