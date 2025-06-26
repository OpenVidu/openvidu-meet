import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { Subject, takeUntil } from 'rxjs';
import { RoomWizardStateService } from '../../../../../../services';
import {
	SelectableCardComponent,
	SelectableOption,
	SelectionEvent
} from '../../../../../../components/selectable-card/selectable-card.component';

interface RecordingLayoutData {
	type: 'grid' | 'speaker' | 'single-speaker';
}

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
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private loadExistingData() {
		const wizardData = this.wizardState.getWizardData();
		const currentData = wizardData?.recordingLayout as RecordingLayoutData;

		if (currentData !== undefined) {
			this.layoutForm.patchValue({
				layoutType: currentData.type
			});
		}
	}

	private saveFormData(formValue: any) {
		const data: RecordingLayoutData = {
			type: formValue.layoutType
		};

		this.wizardState.updateStepData('recordingLayout', data);
	}

	onOptionSelect(event: SelectionEvent): void {
		this.layoutForm.patchValue({
			layoutType: event.optionId
		});
	}

	isOptionSelected(optionId: 'grid' | 'speaker' | 'single-speaker'): boolean {
		return this.layoutForm.value.layoutType === optionId;
	}

	get selectedValue(): string {
		return this.layoutForm.value.layoutType;
	}

	// Set recommended option (grid)
	setRecommendedOption() {
		this.layoutForm.patchValue({
			layoutType: 'grid'
		});
	}

	// Set default option (grid)
	setDefaultOption() {
		this.layoutForm.patchValue({
			layoutType: 'grid'
		});
	}

	get currentSelection(): SelectableOption | undefined {
		const selectedId = this.layoutForm.value.layoutType;
		return this.layoutOptions.find((option) => option.id === selectedId);
	}
}
