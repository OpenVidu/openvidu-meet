import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { SelectableCardComponent, SelectableOption, SelectionEvent } from '@lib/components';
import { RoomWizardStateService } from '@lib/services';
import { Subject, takeUntil } from 'rxjs';

@Component({
	selector: 'ov-recording-layout',
	standalone: true,
	imports: [
		CommonModule,
		ReactiveFormsModule,
		MatButtonModule,
		MatIconModule,
		MatCardModule,
		MatRadioModule,
		SelectableCardComponent
	],
	templateUrl: './recording-layout.component.html',
	styleUrl: './recording-layout.component.scss'
})
export class RecordingLayoutComponent implements OnDestroy {
	layoutForm: FormGroup;
	layoutOptions: SelectableOption[] = [
		{
			id: 'grid',
			title: 'Grid Layout',
			description: 'Show all participants in a grid view with equal sized tiles',
			imageUrl: './assets/layouts/grid.png'
		},
		{
			id: 'speaker',
			title: 'Speaker Layout',
			description: 'Highlight the active speaker with other participants below',
			imageUrl: './assets/layouts/speaker.png',
			isPro: true,
			disabled: true,
			// recommended: true
		},
		{
			id: 'single-speaker',
			title: 'Single Speaker',
			description: 'Show only the active speaker in the recording',
			imageUrl: './assets/layouts/single-speaker.png',
			isPro: true,
			disabled: true
		}
	];

	private destroy$ = new Subject<void>();

	constructor(private wizardService: RoomWizardStateService) {
		const currentStep = this.wizardService.currentStep();
		this.layoutForm = currentStep!.formGroup;

		this.layoutForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private saveFormData(formValue: any) {
		// Note: Recording layout type is not part of MeetRoomOptions
		// For now, just keep the form state
	}

	onOptionSelect(event: SelectionEvent): void {
		this.layoutForm.patchValue({
			layoutType: event.optionId
		});
	}

	get selectedOption(): string {
		return this.layoutForm.value.layoutType || 'grid';
	}
}
