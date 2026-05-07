import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { StepperOrientation, StepperSelectionEvent, StepState } from '@angular/cdk/stepper';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatStepperModule } from '@angular/material/stepper';
import { map } from 'rxjs/operators';
import { WizardStep } from '../../models';

type LayoutType = 'vertical-sidebar' | 'horizontal-compact' | 'vertical-compact';

@Component({
    selector: 'ov-step-indicator',
	imports: [MatStepperModule, ReactiveFormsModule],
    templateUrl: './step-indicator.component.html',
    styleUrl: './step-indicator.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class StepIndicatorComponent {
	steps = input.required<WizardStep[]>();
	currentStepIndex = input.required<number>();
	allowNavigation = input<boolean>(true);
	editMode = input<boolean>(false);

	stepClick = output<{ index: number; step: WizardStep }>();

	visibleSteps = computed<WizardStep[]>(() => this.steps().filter((step) => step.isVisible));
	private breakpointObserver = inject(BreakpointObserver);
	layoutType = toSignal(
		this.breakpointObserver
			.observe(['(min-width: 1200px)', '(min-width: 768px)', Breakpoints.HandsetPortrait])
			.pipe(
				map((): LayoutType => {
					const isLargeDesktop = this.breakpointObserver.isMatched('(min-width: 1200px)');
					const isMediumDesktop = this.breakpointObserver.isMatched('(min-width: 768px)') && !isLargeDesktop;

					if (isLargeDesktop) return 'vertical-sidebar';
					if (isMediumDesktop) return 'horizontal-compact';
					return 'vertical-compact';
				})
			),
		{ initialValue: 'vertical-compact' }
	);
	stepperOrientation = computed<StepperOrientation>(() =>
		this.layoutType() === 'horizontal-compact' ? 'horizontal' : 'vertical'
	);

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
