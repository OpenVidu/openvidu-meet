import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { StepIndicatorComponent } from '../../../../components/step-indicator/step-indicator.component';
import { WizardNavComponent } from '../../../../components/wizard-nav/wizard-nav.component';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';
import { WizardStep, WizardNavigationConfig } from '../../../../models/wizard.model';
import { NavigationService } from '@lib/services';
import { RoomWizardBasicInfoComponent } from './steps/basic-info/basic-info.component';

@Component({
	selector: 'ov-room-wizard',
	standalone: true,
	imports: [
		CommonModule,
		StepIndicatorComponent,
		WizardNavComponent,
		MatButtonModule,
		MatIconModule,
		MatSlideToggleModule,
    RoomWizardBasicInfoComponent
	],
	templateUrl: './room-wizard.component.html',
	styleUrl: './room-wizard.component.scss'
})
export class RoomWizardComponent implements OnInit, OnDestroy {
	private destroy$ = new Subject<void>();

	steps: WizardStep[] = [];
	currentStep: WizardStep | null = null;
	currentStepIndex: number = 0;
	navigationConfig: WizardNavigationConfig = {
		showPrevious: false,
		showNext: true,
		showCancel: true,
		showFinish: false,
		nextLabel: 'Next',
		previousLabel: 'Previous',
		isNextDisabled: false,
		isPreviousDisabled: true
	};
	wizardData: any = {};

	constructor(
		private wizardState: RoomWizardStateService,
		private navigationService: NavigationService
	) {}

	ngOnInit() {
		this.wizardState.initializeWizard();

		this.wizardState.steps$.pipe(takeUntil(this.destroy$)).subscribe((steps) => {
			this.steps = steps;
			this.currentStep = this.wizardState.getCurrentStep();
			this.currentStepIndex = this.wizardState.getCurrentStepIndex();
			this.navigationConfig = this.wizardState.getNavigationConfig();
		});

		this.wizardState.wizardData$.pipe(takeUntil(this.destroy$)).subscribe((data) => {
			this.wizardData = data;
		});

		this.wizardState.currentStepIndex$.pipe(takeUntil(this.destroy$)).subscribe((index) => {
			this.currentStepIndex = index;
		});
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}



	toggleRecording(event: any) {
		const isEnabled = event.checked; // MatSlideToggle uses 'checked' property
		this.wizardState.updateStepData('recording', {
			enabled: isEnabled
		});
	}

	setTriggerData() {
		this.wizardState.updateStepData('recordingTrigger', {
			type: 'manual'
		});
	}

	setLayoutData() {
		this.wizardState.updateStepData('recordingLayout', {
			layout: 'GRID',
			access: 'moderator-only'
		});
	}

	setPreferencesData() {
		this.wizardState.updateStepData('preferences', {
			chatEnabled: true,
			virtualBackgroundEnabled: false
		});
	}

	onPrevious() {
		this.wizardState.goToPreviousStep();
		this.currentStep = this.wizardState.getCurrentStep();
		this.navigationConfig = this.wizardState.getNavigationConfig();
	}

	onNext() {
		this.wizardState.goToNextStep();
		this.currentStep = this.wizardState.getCurrentStep();
		this.navigationConfig = this.wizardState.getNavigationConfig();
	}

	onCancel() {
		this.navigationService.navigateTo('/console/rooms', undefined, true);
		this.wizardState.resetWizard();
	}

	onStepClick(event: { step: WizardStep; index: number }) {
		if (event.step.isCompleted) {
			this.wizardState.goToStep(event.index);
			this.currentStep = this.wizardState.getCurrentStep();
			this.navigationConfig = this.wizardState.getNavigationConfig();
		} else {
			console.warn('Step is not completed, cannot navigate to it:', event.step);
		}
	}

	onFinish() {
		console.log('Wizard completed with data:', this.wizardState.getWizardData());
	}
}
