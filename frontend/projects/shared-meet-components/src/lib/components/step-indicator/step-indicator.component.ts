import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatStepperModule } from '@angular/material/stepper';
import { MatIcon } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { StepperOrientation } from '@angular/cdk/stepper';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { WizardStep } from '../../models/wizard.model';

@Component({
	selector: 'ov-step-indicator',
	standalone: true,
	imports: [CommonModule, MatStepperModule, MatIcon, MatButtonModule, ReactiveFormsModule],
	templateUrl: './step-indicator.component.html',
	styleUrl: './step-indicator.component.scss'
})
export class StepIndicatorComponent implements OnChanges {
	@Input() steps: WizardStep[] = [];
	// Indicates if navigation between steps is allowed
	@Input() allowNavigation: boolean = false;
	@Input() currentStepIndex: number = 0;
	@Output() stepClick = new EventEmitter<{ step: WizardStep; index: number }>();
	visibleSteps: WizardStep[] = [];
	stepperOrientation$: Observable<StepperOrientation>;
	stepControls: { [key: string]: FormControl } = {};

	constructor(private breakpointObserver: BreakpointObserver) {
		// Responsive: vertical en móvil, horizontal en desktop
		this.stepperOrientation$ = this.breakpointObserver
			.observe([Breakpoints.Handset])
			.pipe(map((result) => (result.matches ? 'vertical' : 'horizontal')));
	}

	ngOnChanges(changes: SimpleChanges) {
		if (changes['steps']) {
			this.updateVisibleSteps();
			this.createStepControls();
		}
		if (changes['currentStepIndex'] || changes['steps']) {
			this.updateStepControls();
		}
	}

	private updateVisibleSteps() {
		this.visibleSteps = this.steps.filter((step) => step.isVisible);
	}

	private createStepControls() {
		this.stepControls = {};
		this.visibleSteps.forEach((step) => {
			// Crear FormControl para cada paso, válido si está completado o es opcional
			this.stepControls[step.id] = new FormControl({
				value: step.isCompleted,
				disabled: !step.isCompleted && !step.isActive
			});
		});
	}

	private updateStepControls() {
		this.visibleSteps.forEach((step) => {
			const control = this.stepControls[step.id];
			if (control) {
				control.setValue(step.isCompleted);
				if (step.isCompleted || step.isActive) {
					control.enable();
				} else {
					control.disable();
				}
			}
		});
	}

	getStepControl(step: WizardStep): FormGroup {
		return step.validationFormGroup;
	}

	onStepClick(step: WizardStep, index: number) {
		if (this.allowNavigation && (step.isCompleted || step.isActive)) {
			this.stepClick.emit({ step, index });
		}
	}

	getStepState(step: WizardStep): 'done' | 'edit' | 'error' | 'number' {
		if (step.isCompleted) {
			return 'done';
		}
		if (step.isActive) {
			return 'edit';
		}
		return 'number';
	}

	isStepClickable(step: WizardStep): boolean {
		return this.allowNavigation; //&& (step.isCompleted || step.isActive);
	}

	getStepIcon(step: WizardStep): string {
		if (step.isCompleted) {
			return 'check';
		}
		if (step.isActive) {
			return 'edit';
		}
		return '';
	}
}
