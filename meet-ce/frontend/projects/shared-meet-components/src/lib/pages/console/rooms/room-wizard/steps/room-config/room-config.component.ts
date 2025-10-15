import { Component, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RoomWizardStateService } from '@lib/services';
import { Subject, takeUntil } from 'rxjs';

@Component({
    selector: 'ov-room-config',
    imports: [ReactiveFormsModule, MatCardModule, MatIconModule, MatSlideToggleModule],
    templateUrl: './room-config.component.html',
    styleUrl: './room-config.component.scss'
})
export class RoomConfigComponent implements OnDestroy {
	configForm: FormGroup;

	private destroy$ = new Subject<void>();

	constructor(private wizardService: RoomWizardStateService) {
		const currentStep = this.wizardService.currentStep();
		this.configForm = currentStep!.formGroup;

		this.configForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private saveFormData(formValue: any): void {
		const stepData: any = {
			config: {
				chat: {
					enabled: formValue.chatEnabled
				},
				virtualBackground: {
					enabled: formValue.virtualBackgroundsEnabled
				}
			}
		};

		this.wizardService.updateStepData('config', stepData);
	}

	onChatToggleChange(event: any): void {
		const isEnabled = event.checked;
		this.configForm.patchValue({ chatEnabled: isEnabled });
	}

	onVirtualBackgroundToggleChange(event: any): void {
		const isEnabled = event.checked;
		this.configForm.patchValue({ virtualBackgroundsEnabled: isEnabled });
	}

	get chatEnabled(): boolean {
		return this.configForm.value.chatEnabled || false;
	}

	get virtualBackgroundsEnabled(): boolean {
		return this.configForm.value.virtualBackgroundsEnabled || false;
	}
}
