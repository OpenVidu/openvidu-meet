import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatStepperModule } from '@angular/material/stepper';
import { MatIcon } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { StepperOrientation, StepperSelectionEvent } from '@angular/cdk/stepper';
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
	@Input() allowNavigation: boolean = false;
	@Input() editMode: boolean = false; // New input for edit mode
	@Input() currentStepIndex: number = 0;
	@Output() stepClick = new EventEmitter<{ step: WizardStep; index: number }>();
	@Output() layoutChange = new EventEmitter<'vertical-sidebar' | 'horizontal-compact' | 'vertical-compact'>();

	visibleSteps: WizardStep[] = [];
	stepperOrientation$: Observable<StepperOrientation>;
	layoutType$: Observable<'vertical-sidebar' | 'horizontal-compact' | 'vertical-compact'>;
	stepControls: { [key: string]: FormControl } = {};

	constructor(private breakpointObserver: BreakpointObserver) {
		// Enhanced responsive strategy:
		// - Large desktop (>1200px): Vertical sidebar for space efficiency
		// - Medium desktop (768-1200px): Horizontal compact
		// - Tablet/Mobile (<768px): Vertical compact

		const breakpointState$ = this.breakpointObserver.observe([
			'(min-width: 1200px)',
			'(min-width: 768px)',
			Breakpoints.HandsetPortrait
		]);

		this.layoutType$ = breakpointState$.pipe(
			map(() => {
				const isLargeDesktop = this.breakpointObserver.isMatched('(min-width: 1200px)');
				const isMediumDesktop = this.breakpointObserver.isMatched('(min-width: 768px)') && !isLargeDesktop;

				if (isLargeDesktop) return 'vertical-sidebar';
				if (isMediumDesktop) return 'horizontal-compact';
				return 'vertical-compact';
			})
		);

		this.stepperOrientation$ = this.layoutType$.pipe(
			map((layoutType) => {
				return layoutType === 'horizontal-compact' ? 'horizontal' : 'vertical';
			})
		);

		// Emit layout changes for parent component
		this.layoutType$.subscribe((layoutType) => {
			this.layoutChange.emit(layoutType);
		});
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

	onStepClick(event: StepperSelectionEvent) {
		if (this.allowNavigation) {
			const step = this.steps[event.selectedIndex];
			this.stepClick.emit({ step, index: event.selectedIndex });
		} else {
			console.warn('Navigation is not allowed. Step click ignored:', event.selectedIndex);
		}
	}

	isStepClickable(step: WizardStep): boolean {
		if (!this.allowNavigation) {
			return false;
		}
		if (this.editMode) {
			// In edit mode, allow clicking on any step
			return true;
		}

		return step.isActive || step.isCompleted;
	}

	isStepEditable(step: WizardStep): boolean {
		return this.isStepClickable(step);
	}

	getStepState(step: WizardStep): 'done' | 'edit' | 'error' | 'number' {
		if (step.isCompleted && !step.isActive) {
			return 'done';
		}

		if (step.isActive && step.validationFormGroup?.invalid) {
			return 'error';
		}

		if (step.isActive) {
			return 'edit';
		}

		if (step.isCompleted) {
			return 'done';
		}

		return 'number';
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
