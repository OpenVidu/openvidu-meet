import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { StepperOrientation, StepperSelectionEvent, StepState } from '@angular/cdk/stepper';
import { CommonModule } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatStepperModule } from '@angular/material/stepper';
import { WizardStep } from '@lib/models';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({
	selector: 'ov-step-indicator',
	standalone: true,
	imports: [CommonModule, MatStepperModule, ReactiveFormsModule],
	templateUrl: './step-indicator.component.html',
	styleUrl: './step-indicator.component.scss'
})
export class StepIndicatorComponent {
	steps = input.required<WizardStep[]>();
	currentStepIndex = input.required<number>();
	allowNavigation = input<boolean>(true);
	editMode = input<boolean>(false);

	stepClick = output<{ index: number; step: WizardStep }>();

	visibleSteps = computed<WizardStep[]>(() => this.steps().filter((step) => step.isVisible));

	stepperOrientation$: Observable<StepperOrientation>;
	layoutType$: Observable<'vertical-sidebar' | 'horizontal-compact' | 'vertical-compact'>;

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
	}

	onStepClick(event: StepperSelectionEvent) {
		if (this.allowNavigation()) {
			const index = event.selectedIndex;
			if (index < 0 || index >= this.visibleSteps().length) {
				console.warn('Invalid step index:', index);
				return;
			}

			const step = this.visibleSteps()[index];
			this.stepClick.emit({ index, step });
		} else {
			console.warn('Navigation is not allowed. Step click ignored:', event.selectedIndex);
		}
	}

	getStepState(step: WizardStep): StepState {
		if (step.isCompleted && !step.isActive) {
			return 'done';
		}
		if (step.isActive && step.formGroup?.invalid) {
			return 'error';
		}
		if (step.isActive) {
			return 'edit';
		}

		return 'number';
	}
}
