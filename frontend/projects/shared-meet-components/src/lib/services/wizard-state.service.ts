import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { WizardStep, WizardNavigationConfig } from '../models/wizard.model';
import { FormBuilder, Validators } from '@angular/forms';

@Injectable({
	providedIn: 'root'
})
export class RoomWizardStateService {
	private _formBuilder = inject(FormBuilder);

	private _currentStepIndex = new BehaviorSubject<number>(0);
	private _steps = new BehaviorSubject<WizardStep[]>([]);
	private _wizardData = new BehaviorSubject<any>({});

	currentStepIndex$ = this._currentStepIndex.asObservable();
	steps$ = this._steps.asObservable();
	wizardData$ = this._wizardData.asObservable();

	// Datos del formulario
	private wizardFormData: any = {
		basic: {},
		recording: { enabled: false },
		recordingTrigger: {},
		recordingLayout: {},
		preferences: {}
	};

	initializeWizard(editMode: boolean = false, existingData?: any) {
		const baseSteps: WizardStep[] = [
			{
				id: 'basic',
				label: 'Basic Info',
				isCompleted: false,
				isActive: true,
				isVisible: true,
				validationFormGroup: this._formBuilder.group({
					roomPrefix: ['', Validators.required],
					deletionDate: ['']
				}),
				order: 1
			},
			{
				id: 'recording',
				label: 'Recording',
				isCompleted: false,
				isActive: false,
				isVisible: true,
				validationFormGroup: this._formBuilder.group({
					enabled: [false]
				}),
				order: 2
			},
			{
				id: 'preferences',
				label: 'Preferences',
				isCompleted: false,
				isActive: false,
				isVisible: true,
				validationFormGroup: this._formBuilder.group({
					preference1: [''],
					preference2: ['']
				}),
				order: 5 // Se ajustará dinámicamente
			}
		];

		this._steps.next(baseSteps);
		this._currentStepIndex.next(0);

		if (existingData) {
			this.wizardFormData = { ...existingData };
			this._wizardData.next(this.wizardFormData);
		}
	}

	updateStepData(stepId: string, data: any) {
		this.wizardFormData[stepId] = { ...this.wizardFormData[stepId], ...data };
		this._wizardData.next(this.wizardFormData);

		// Actualizar visibilidad de pasos según los datos
		this.updateStepVisibility();
	}

	private updateStepVisibility() {
		const currentSteps = this._steps.value;
		const recordingEnabled = this.wizardFormData.recording?.enabled;

		// Remover pasos de recording si existen
		const filteredSteps = currentSteps.filter((step) => !['recordingTrigger', 'recordingLayout'].includes(step.id));

		if (recordingEnabled) {
			// Agregar pasos de recording
			const recordingSteps: WizardStep[] = [
				{
					id: 'recordingTrigger',
					label: 'Trigger',
					isCompleted: false,
					isActive: false,
					isVisible: true,
					validationFormGroup: this._formBuilder.group({
						type: ['manual']
					}),
					order: 3
				},
				{
					id: 'recordingLayout',
					label: 'Layout',
					isCompleted: false,
					isActive: false,
					isVisible: true,
					validationFormGroup: this._formBuilder.group({
						layout: ['GRID'],
						access: ['moderator-only']
					}),
					order: 4
				}
			];

			// Injects recording steps into the correct position
			filteredSteps.splice(2, 0, ...recordingSteps);
		}

		// Reorder steps based on visibility
		filteredSteps.forEach((step, index) => {
			step.order = index + 1;
		});

		this._steps.next(filteredSteps);
	}

	goToNextStep(): boolean {
		const currentIndex = this._currentStepIndex.value;
		const steps = this._steps.value;
		const visibleSteps = steps.filter((step) => step.isVisible);

		if (currentIndex < visibleSteps.length - 1) {
			// Marcar paso actual como completado
			const currentStep = visibleSteps[currentIndex];
			currentStep.isCompleted = true;
			currentStep.isActive = false;

			// Activar siguiente paso
			const nextStep = visibleSteps[currentIndex + 1];
			nextStep.isActive = true;

			this._currentStepIndex.next(currentIndex + 1);
			this._steps.next(steps);
			return true;
		}
		return false;
	}

	goToPreviousStep(): boolean {
		const currentIndex = this._currentStepIndex.value;
		const steps = this._steps.value;
		const visibleSteps = steps.filter((step) => step.isVisible);

		if (currentIndex > 0) {
			// Desactivar paso actual
			const currentStep = visibleSteps[currentIndex];
			currentStep.isActive = false;

			// Activar paso anterior
			const previousStep = visibleSteps[currentIndex - 1];
			previousStep.isActive = true;

			this._currentStepIndex.next(currentIndex - 1);
			this._steps.next(steps);
			return true;
		}
		return false;
	}

	getCurrentStep(): WizardStep | null {
		const steps = this._steps.value;
		const visibleSteps = steps.filter((step) => step.isVisible);
		const currentIndex = this._currentStepIndex.value;

		return visibleSteps[currentIndex] || null;
	}

	getCurrentStepIndex(): number {
		return this._currentStepIndex.value;
	}

	getVisibleSteps(): WizardStep[] {
		return this._steps.value.filter((step) => step.isVisible);
	}

	goToStep(targetIndex: number): boolean {
		const visibleSteps = this.getVisibleSteps();

		if (targetIndex >= 0 && targetIndex < visibleSteps.length) {
			// Desactivar paso actual
			const currentStep = this.getCurrentStep();
			if (currentStep) {
				currentStep.isActive = false;
			}

			// Activar paso objetivo
			const targetStep = visibleSteps[targetIndex];
			targetStep.isActive = true;

			this._currentStepIndex.next(targetIndex);
			this._steps.next(this._steps.value);
			return true;
		}
		return false;
	}

	getNavigationConfig(): WizardNavigationConfig {
		const currentIndex = this._currentStepIndex.value;
		const steps = this._steps.value;
		const visibleSteps = steps.filter((step) => step.isVisible);
		const isLastStep = currentIndex === visibleSteps.length - 1;
		const isFirstStep = currentIndex === 0;

		return {
			showPrevious: !isFirstStep,
			showNext: !isLastStep,
			showCancel: true,
			showFinish: isLastStep,
			nextLabel: 'Next',
			previousLabel: 'Previous',
			isNextDisabled: false, // Aquí podrías agregar validación
			isPreviousDisabled: isFirstStep
		};
	}

	getWizardData() {
		return this.wizardFormData;
	}

	resetWizard() {
		this.wizardFormData = {
			basic: {},
			recording: { enabled: false },
			recordingTrigger: {},
			recordingLayout: {},
			preferences: {}
		};
		this._currentStepIndex.next(0);
		this._wizardData.next(this.wizardFormData);
	}
}
