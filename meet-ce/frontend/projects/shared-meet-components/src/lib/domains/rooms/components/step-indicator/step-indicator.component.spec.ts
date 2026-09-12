import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { WizardStep, WizardStepId } from '../../models';
import { StepIndicatorComponent } from './step-indicator.component';

/**
 * `CdkStep`'s own `indicatorType` (what actually renders the icon) ignores a `[state]` binding
 * unless `STEPPER_GLOBAL_OPTIONS.displayDefaultIndicatorType` is explicitly `false` — not the case
 * in this app, which only sets `showError: true`. The real seam for a custom error indicator is
 * `[hasError]`, which `stepHasError()` feeds. See step-indicator.component.ts for the full story.
 */
describe('StepIndicatorComponent.stepHasError — the actual seam Material consults', () => {
	let fixture: ComponentFixture<StepIndicatorComponent>;
	let component: StepIndicatorComponent;

	function buildStep(overrides: Partial<WizardStep> = {}): WizardStep {
		return {
			id: WizardStepId.ROOM_CONFIG,
			label: 'Step',
			isCompleted: false,
			isActive: false,
			isVisible: true,
			formGroup: new FormGroup({}),
			...overrides
		};
	}

	beforeEach(() => {
		TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
		fixture = TestBed.createComponent(StepIndicatorComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('steps', []);
		fixture.componentRef.setInput('currentStepIndex', 0);
	});

	it('is false for a step with a valid form and no warning flagged', () => {
		expect(component.stepHasError(buildStep())).toBe(false);
	});

	it('is true when the step field itself is invalid', () => {
		const invalidForm = new FormGroup({ name: new FormControl(null, Validators.required) });
		expect(component.stepHasError(buildStep({ formGroup: invalidForm }))).toBe(true);
	});

	it('is true when the step is flagged via stepWarnings despite its own form being valid', () => {
		const step = buildStep({ id: WizardStepId.RECORDING_TRIGGER });
		expect(component.stepHasError(step)).toBe(false);

		fixture.componentRef.setInput('stepWarnings', [WizardStepId.RECORDING_TRIGGER]);
		expect(component.stepHasError(step)).toBe(true);
	});

	it('does not flag a step of a different id present in stepWarnings', () => {
		const step = buildStep({ id: WizardStepId.RECORDING_TRIGGER });
		fixture.componentRef.setInput('stepWarnings', [WizardStepId.ROOM_CONFIG]);
		expect(component.stepHasError(step)).toBe(false);
	});
});
