import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { Subject, takeUntil } from 'rxjs';
import { RoomWizardStateService } from '../../../../../../services';

interface RecordingOption {
	id: 'disabled' | 'enabled';
	title: string;
	description: string;
	icon: string;
}

interface RecordingPreferencesData {
	enabled: boolean;
}

@Component({
	selector: 'ov-recording-preferences',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule, MatButtonModule, MatIconModule, MatCardModule, MatRadioModule],
	templateUrl: './recording-preferences.component.html',
	styleUrl: './recording-preferences.component.scss'
})
export class RecordingPreferencesComponent implements OnInit, OnDestroy {
	recordingForm: FormGroup;
	private destroy$ = new Subject<void>();

	recordingOptions: RecordingOption[] = [
		{
			id: 'disabled',
			title: 'No Recording',
			description: 'Room will not be recorded. Participants can join without recording concerns.',
			icon: 'videocam_off'
		},
		{
			id: 'enabled',
			title: 'Allow Recording',
			description:
				'Enable recording capabilities for this room. Recordings can be started manually or automatically.',
			icon: 'video_library'
		}
	];

	constructor(
		private fb: FormBuilder,
		private wizardState: RoomWizardStateService
	) {
		this.recordingForm = this.fb.group({
			recordingEnabled: ['disabled'] // default to no recording
		});
	}

	ngOnInit() {
		// Cargar datos existentes si los hay
		this.loadExistingData();

		// Suscribirse a cambios del formulario para guardar automáticamente
		this.recordingForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private loadExistingData() {
		const wizardData = this.wizardState.getWizardData();
		const currentData = wizardData?.recording as RecordingPreferencesData;

		if (currentData !== undefined) {
			this.recordingForm.patchValue({
				recordingEnabled: currentData.enabled ? 'enabled' : 'disabled'
			});
		}
	}

	private saveFormData(formValue: any) {
		const data: RecordingPreferencesData = {
			enabled: formValue.recordingEnabled === 'enabled'
		};

		this.wizardState.updateStepData('recording', data);
	}

	onOptionSelect(optionId: 'disabled' | 'enabled') {
		this.recordingForm.patchValue({
			recordingEnabled: optionId
		});
	}

	isOptionSelected(optionId: 'disabled' | 'enabled'): boolean {
		return this.recordingForm.value.recordingEnabled === optionId;
	}

	// Método para establecer datos de ejemplo
	setRecommendedOption() {
		this.onOptionSelect('enabled');
	}

	// Método para restablecer a la opción por defecto
	setDefaultOption() {
		this.onOptionSelect('disabled');
	}

	get currentSelection(): RecordingOption | undefined {
		const selectedId = this.recordingForm.value.recordingEnabled;
		return this.recordingOptions.find((option) => option.id === selectedId);
	}
}
