import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
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
export class RecordingLayoutComponent implements OnInit, OnDestroy {
	layoutForm: FormGroup;
	private destroy$ = new Subject<void>();

	layoutOptions: SelectableOption[] = [
		{
			id: 'grid',
			title: 'Grid Layout',
			description: 'Show all participants in a grid view with equal sized tiles',
			imageUrl: './assets/layouts/grid.png',
			recommended: false,
			isPro: false
		},
		{
			id: 'speaker',
			title: 'Speaker Layout',
			description: 'Highlight the active speaker with other participants below',
			imageUrl: './assets/layouts/speaker.png',
			isPro: true,
			disabled: true
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

	constructor(
		private fb: FormBuilder,
		private wizardState: RoomWizardStateService
	) {
		this.layoutForm = this.fb.group({
			layoutType: ['grid'] // default to grid
		});
	}

	ngOnInit() {
		// Load existing data if available
		this.loadExistingData();

		// Subscribe to form changes for auto-save
		this.layoutForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});

		// Save initial default value if no existing data
		this.saveInitialDefaultIfNeeded();
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private loadExistingData() {
		// Note: This component doesn't need to store data in MeetRoomOptions
		// Recording layout settings are typically stored as metadata or used for UI state only
		this.layoutForm.patchValue({
			layoutType: 'grid' // Always default to grid
		});
	}

	private saveInitialDefaultIfNeeded() {
		// Always ensure grid is selected as default
		if (!this.layoutForm.value.layoutType) {
			this.layoutForm.patchValue({
				layoutType: 'grid'
			});
		}
	}

	private saveFormData(formValue: any) {
		// Note: Recording layout type is not part of MeetRoomOptions
		// This is UI state that affects recording layout but not stored in room options
		// We could extend this to store in a metadata field if needed in the future

		// For now, just keep the form state - this affects UI behavior but not the final room creation
		console.log('Recording layout type selected:', formValue.layoutType);
	}

	onOptionSelect(event: SelectionEvent): void {
		this.layoutForm.patchValue({
			layoutType: event.optionId
		});
	}

	get selectedOption(): string {
		return this.layoutForm.value.layoutType || 'grid'; // Default to grid if not set
	}
}
