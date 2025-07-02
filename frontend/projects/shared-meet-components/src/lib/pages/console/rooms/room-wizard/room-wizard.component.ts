import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute } from '@angular/router';
import { StepIndicatorComponent, WizardNavComponent } from '@lib/components';
import { WizardNavigationConfig, WizardNavigationEvent, WizardStep } from '@lib/models';
import { NavigationService, RoomService, RoomWizardStateService } from '@lib/services';
import { MeetRoom, MeetRoomOptions } from '@lib/typings/ce';
import { Subject, takeUntil } from 'rxjs';
import { RoomWizardBasicInfoComponent } from './steps/basic-info/basic-info.component';
import { RecordingLayoutComponent } from './steps/recording-layout/recording-layout.component';
import { RecordingPreferencesComponent } from './steps/recording-preferences/recording-preferences.component';
import { RecordingTriggerComponent } from './steps/recording-trigger/recording-trigger.component';
import { RoomPreferencesComponent } from './steps/room-preferences/room-preferences.component';

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
	editMode: boolean = false;
	roomId: string | null = null;
	existingRoomData: MeetRoomOptions | null = null;

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
		showQuickCreate: true,
		nextLabel: 'Next',
		previousLabel: 'Previous',
		finishLabel: 'Create Room',
		isNextDisabled: false,
		isPreviousDisabled: true
	};
	wizardData: MeetRoomOptions = {};

	constructor(
		private wizardState: RoomWizardStateService,
		protected roomService: RoomService,
		private navigationService: NavigationService,
		private route: ActivatedRoute
	) {}

	async ngOnInit() {
		console.log('RoomWizard ngOnInit - starting');

		// Detect edit mode from route
		this.detectEditMode();

		// If in edit mode, load room data
		if (this.editMode && this.roomId) {
			this.navigationConfig.showQuickCreate = false;
			await this.loadRoomData();
		}

		// Initialize wizard with edit mode and existing data
		this.wizardState.initializeWizard(this.editMode, this.existingRoomData || undefined);

		this.wizardState.steps$.pipe(takeUntil(this.destroy$)).subscribe((steps) => {
			// Only update current step info after steps are available

			if (steps.length > 0) {
				this.steps = steps;
				this.currentStep = this.wizardState.getCurrentStep();
				this.currentStepIndex = this.wizardState.getCurrentStepIndex();
				this.navigationConfig = this.wizardState.getNavigationConfig();

				// Update navigation config for edit mode
				if (this.editMode) {
					this.navigationConfig.finishLabel = 'Update Room';
				}
			}
		});

		this.wizardState.roomOptions$.pipe(takeUntil(this.destroy$)).subscribe((options) => {
			this.wizardData = options;
		});

		this.wizardState.currentStepIndex$.pipe(takeUntil(this.destroy$)).subscribe((index) => {
			// Only update if we have visible steps
			if (this.steps.filter((s) => s.isVisible).length > 0) {
				this.currentStepIndex = index;
			}
		});
	}

	private detectEditMode() {
		// Check if URL contains '/edit' to determine edit mode
		const url = this.route.snapshot.url;
		this.editMode = url.some((segment) => segment.path === 'edit');

		// Get roomId from route parameters when in edit mode
		if (this.editMode) {
			this.roomId = this.route.snapshot.paramMap.get('roomId');
		}
	}

	private async loadRoomData() {
		if (!this.roomId) return;

		try {
			// Fetch room data from the service
			const room: MeetRoom = await this.roomService.getRoom(this.roomId);

			// Convert MeetRoom to MeetRoomOptions
			this.existingRoomData = {
				roomIdPrefix: room.roomIdPrefix,
				autoDeletionDate: room.autoDeletionDate,
				preferences: room.preferences
			};
		} catch (error) {
			console.error('Error loading room data:', error);
			// Navigate back to rooms list if room not found
			await this.navigationService.navigateTo('rooms', undefined, true);
		}
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
		this.navigationService.navigateTo('rooms', undefined, true);
		this.wizardState.resetWizard();
	}

	onStepClick(event: { step: WizardStep; index: number }) {
		this.wizardState.goToStep(event.index);
		this.currentStep = this.wizardState.getCurrentStep();
		this.navigationConfig = this.wizardState.getNavigationConfig();
	}

	onLayoutChange(layout: 'vertical-sidebar' | 'horizontal-compact' | 'vertical-compact') {
		this.currentLayout = layout;
	}

	async onFinish(event: WizardNavigationEvent) {
		const roomOptions = this.wizardState.getRoomOptions();
		console.log('Wizard completed with data:', event, roomOptions);

		try {
			if (this.editMode && this.roomId && roomOptions.preferences) {
				await this.roomService.updateRoom(this.roomId, roomOptions.preferences);
				//TODO: Show success notification
			} else {
				// Create new room
				await this.roomService.createRoom(roomOptions);
				console.log('Room created successfully');
				// TODO: Show error notification
			}

			await this.navigationService.navigateTo('rooms', undefined, true);
		} catch (error) {
			console.error(`Failed to ${this.editMode ? 'update' : 'create'} room:`, error);
		}
	}
}
