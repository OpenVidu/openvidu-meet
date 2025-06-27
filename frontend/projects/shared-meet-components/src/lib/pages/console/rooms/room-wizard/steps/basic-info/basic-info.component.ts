import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { Subject, takeUntil } from 'rxjs';
import { RoomWizardStateService } from '../../../../../../services';

interface BasicInfoData {
	roomIdPrefix?: string;
	autoDeletionDate?: string;
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
		MatNativeDateModule
	],
	templateUrl: './basic-info.component.html',
	styleUrl: './basic-info.component.scss'
})
export class RoomWizardBasicInfoComponent implements OnInit, OnDestroy {
	basicInfoForm: FormGroup;
	private destroy$ = new Subject<void>();

	constructor(
		private fb: FormBuilder,
		private wizardState: RoomWizardStateService
	) {
		this.basicInfoForm = this.fb.group({
			roomIdPrefix: ['', [Validators.maxLength(50)]],
			autoDeletionDate: [null]
		});
	}

	ngOnInit() {
		// Cargar datos existentes si los hay
		this.loadExistingData();

		// Suscribirse a cambios del formulario para guardar automáticamente
		this.basicInfoForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private loadExistingData() {
		const wizardData = this.wizardState.getWizardData();
		const currentData = wizardData?.basic as BasicInfoData;

		if (currentData) {
			this.basicInfoForm.patchValue({
				roomIdPrefix: currentData.roomIdPrefix || '',
				autoDeletionDate: currentData.autoDeletionDate ? new Date(currentData.autoDeletionDate) : null
			});
		}
	}

	private saveFormData(formValue: any) {
		const data: BasicInfoData = {
			roomIdPrefix: formValue.roomIdPrefix || undefined,
			autoDeletionDate: formValue.autoDeletionDate ? formValue.autoDeletionDate.getTime() : undefined
		};

		// Solo guardar si hay algún valor
		if (data.roomIdPrefix || data.autoDeletionDate) {
			this.wizardState.updateStepData('basic', data);
		}
	}

	// Método para establecer datos de ejemplo
	updateBasicData() {
		const sampleData = {
			roomIdPrefix: 'demo-room',
			autoDeletionDate: new Date(Date.now() + 86400000).getTime() // 24 horas desde ahora
		};

		this.basicInfoForm.patchValue(sampleData);
	}

	// Método para limpiar el formulario
	clearForm() {
		this.basicInfoForm.reset();
		this.wizardState.updateStepData('basic', {});
	}

	// Validación para fecha mínima (hoy)
	get minDate(): Date {
		return new Date();
	}
}
