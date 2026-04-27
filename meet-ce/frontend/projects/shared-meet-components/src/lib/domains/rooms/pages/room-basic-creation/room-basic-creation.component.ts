import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetRoomOptions } from '@openvidu-meet/typings';
import { RoomDetailsFormGroup, RoomDetailsFormValue } from '../../models/wizard-forms.model';
import { WizardStepId } from '../../models/wizard.model';
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
	styleUrl: './room-basic-creation.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomBasicCreationComponent {
	private readonly wizardService = inject(RoomWizardStateService);

	readonly createRoom = output<string | undefined>();
	readonly openAdvancedMode = output<void>();

	roomDetailsForm: RoomDetailsFormGroup;

	constructor() {
		const currentStep = this.wizardService.getStepById(WizardStepId.ROOM_DETAILS);
		if (!currentStep) {
			throw new Error('roomDetails step not found in wizard state');
		}
		this.roomDetailsForm = currentStep.formGroup;

		this.roomDetailsForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	private saveFormData(formValue: Partial<RoomDetailsFormValue>) {
		const stepData: Partial<MeetRoomOptions> = {
			roomName: formValue.roomName
		};
		this.wizardService.updateStepData(stepData);
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
