import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { StepIndicatorComponent } from '../../../../components/step-indicator/step-indicator.component';
import { WizardNavComponent } from '../../../../components/wizard-nav/wizard-nav.component';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';
import { WizardStep, WizardNavigationConfig, WizardNavigationEvent } from '../../../../models/wizard.model';
import { NavigationService, RoomService } from '@lib/services';
import { RoomWizardBasicInfoComponent } from './steps/basic-info/basic-info.component';
import { RecordingPreferencesComponent } from './steps/recording-preferences/recording-preferences.component';
import { RecordingTriggerComponent } from './steps/recording-trigger/recording-trigger.component';
import { RecordingLayoutComponent } from './steps/recording-layout/recording-layout.component';
import { RoomPreferencesComponent } from './steps/room-preferences/room-preferences.component';
import { MeetRoomOptions } from '@lib/typings/ce';

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
		RoomWizardBasicInfoComponent,
		RecordingPreferencesComponent,
		RecordingTriggerComponent,
		RecordingLayoutComponent,
		RoomPreferencesComponent
	],
	templateUrl: './room-wizard.component.html',
	styleUrl: './room-wizard.component.scss'
})
export class RoomWizardComponent implements OnInit, OnDestroy {
	private destroy$ = new Subject<void>();

	steps: WizardStep[] = [];
	currentStep: WizardStep | null = null;
	currentStepIndex: number = 0;
	currentLayout: 'vertical-sidebar' | 'horizontal-compact' | 'vertical-compact' = 'horizontal-compact';
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
		protected roomService: RoomService,
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

	onLayoutChange(layout: 'vertical-sidebar' | 'horizontal-compact' | 'vertical-compact') {
		this.currentLayout = layout;
	}

	async onFinish(event: WizardNavigationEvent) {
		console.log('Wizard completed with data:', event, this.wizardState.getWizardData());

		try {
			const roomOptions = this.buildRoomOptions();
			await this.roomService.createRoom(roomOptions);
			await this.navigationService.navigateTo('/console/rooms', undefined, true);
		} catch (error) {
			console.error('Failed to create room:', error);
		}
	}

	private buildRoomOptions(): MeetRoomOptions | undefined {
		if (this.wizardState.isWizardSkipped()) {
			return undefined;
		}

		const wizardData = this.wizardState.getWizardData();

		return {
			roomIdPrefix: wizardData.basic.roomIdPrefix,
			autoDeletionDate: wizardData.basic.autoDeletionDate,
			preferences: {
				chatPreferences: {
					enabled: wizardData.preferences.chatEnabled
				},
				virtualBackgroundPreferences: {
					enabled: wizardData.preferences.virtualBackgroundsEnabled
				},
				recordingPreferences: {
					enabled: wizardData.recording.enabled,
					allowAccessTo: wizardData.recording.allowAccessTo
				}
			}
		};
	}
}
