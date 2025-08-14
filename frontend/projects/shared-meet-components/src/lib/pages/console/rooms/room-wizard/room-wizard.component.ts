import { CommonModule } from '@angular/common';
import { Component, computed, OnInit, Signal, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute } from '@angular/router';
import { StepIndicatorComponent, WizardNavComponent } from '@lib/components';
import { WizardNavigationConfig, WizardStep } from '@lib/models';
import { NavigationService, NotificationService, RoomService, RoomWizardStateService } from '@lib/services';
import { MeetRoomOptions } from '@lib/typings/ce';
import { RoomBasicCreationComponent } from '../room-basic-creation/room-basic-creation.component';
import { RecordingLayoutComponent } from './steps/recording-layout/recording-layout.component';
import { RecordingPreferencesComponent } from './steps/recording-preferences/recording-preferences.component';
import { RecordingTriggerComponent } from './steps/recording-trigger/recording-trigger.component';
import { RoomWizardRoomDetailsComponent } from './steps/room-details/room-details.component';
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
		MatProgressSpinnerModule,
		MatSlideToggleModule,
		RoomBasicCreationComponent,
		RoomWizardRoomDetailsComponent,
		RecordingPreferencesComponent,
		RecordingTriggerComponent,
		RecordingLayoutComponent,
		RoomPreferencesComponent
	],
	templateUrl: './room-wizard.component.html',
	styleUrl: './room-wizard.component.scss'
})
export class RoomWizardComponent implements OnInit {
	editMode: boolean = false;
	roomId?: string;
	existingRoomData?: MeetRoomOptions; // Edit mode
	isCreatingRoom = signal(false);
	isBasicCreation = signal(true);
	steps: Signal<WizardStep[]>;
	currentStep: Signal<WizardStep | undefined>;
	currentStepIndex: Signal<number>;
	navigationConfig: Signal<WizardNavigationConfig>;

	constructor(
		private wizardService: RoomWizardStateService,
		protected roomService: RoomService,
		protected notificationService: NotificationService,
		private navigationService: NavigationService,
		private route: ActivatedRoute
	) {
		this.steps = this.wizardService.steps;
		this.currentStep = this.wizardService.currentStep;
		this.currentStepIndex = this.wizardService.currentStepIndex;
		this.navigationConfig = computed(() => this.wizardService.getNavigationConfig());
	}

	async ngOnInit() {
		// Detect edit mode from route
		this.detectEditMode();

		// If in edit mode, load room data
		if (this.editMode && this.roomId) {
			await this.loadRoomData();
		}

		// Initialize wizard with edit mode and existing data
		this.wizardService.initializeWizard(this.editMode, this.existingRoomData);
	}

	private detectEditMode() {
		// Check if URL contains '/edit' to determine edit mode
		const url = this.route.snapshot.url;
		this.editMode = url.some((segment) => segment.path === 'edit');

		// Get roomId from route parameters when in edit mode
		if (this.editMode) {
			this.roomId = this.route.snapshot.paramMap.get('roomId') || undefined;
		}
	}

	private async loadRoomData() {
		if (!this.roomId) return;

		try {
			const { roomName, autoDeletionDate, preferences } = await this.roomService.getRoom(this.roomId);
			this.existingRoomData = { roomName, autoDeletionDate, preferences };
			if (this.existingRoomData) {
				this.isBasicCreation.set(false);
			}
		} catch (error) {
			console.error('Error loading room data:', error);
			// Navigate back to rooms list if room not found
			await this.navigationService.navigateTo('rooms', undefined, true);
		}
	}

	onOpenAdvancedMode() {
		this.isBasicCreation.set(false);
		this.wizardService.goToStep(0); // Reset to first step
	}

	onPrevious() {
		this.wizardService.goToPreviousStep();
	}

	onBack() {
		this.isBasicCreation.set(true);
	}

	onNext() {
		this.wizardService.goToNextStep();
	}

	onStepClick(event: { index: number; step: WizardStep }) {
		this.wizardService.goToStep(event.index);
	}

	async onCancel() {
		this.wizardService.resetWizard();
		await this.navigationService.navigateTo('rooms', undefined, true);
	}

	async createRoom(roomName?: string) {
		try {
			// Call the room service to create a new room
			const { moderatorRoomUrl } = await this.roomService.createRoom({ roomName });
			await this.navigationService.redirectTo(moderatorRoomUrl);
		} catch (error) {
			const errorMessage = `Failed to create room ${roomName}`;
			this.notificationService.showSnackbar(errorMessage);
			console.error(errorMessage, error);
		} finally {
			this.wizardService.resetWizard();
			// Deactivate loading state
			this.isCreatingRoom.set(false);
		}
	}

	async onFinish() {
		const roomOptions = this.wizardService.roomOptions();
		console.log('Wizard completed with data:', roomOptions);

		// Activate loading state
		this.isCreatingRoom.set(true);

		try {
			if (this.editMode && this.roomId && roomOptions.preferences) {
				await this.roomService.updateRoom(this.roomId, roomOptions.preferences);
				await this.navigationService.navigateTo('rooms', undefined, true);
				this.notificationService.showSnackbar('Room updated successfully');
			} else {
				// Create new room
				const { moderatorRoomUrl } = await this.roomService.createRoom(roomOptions);
				await this.navigationService.redirectTo(moderatorRoomUrl);
			}
		} catch (error) {
			const errorMessage = `Failed to ${this.editMode ? 'update' : 'create'} room`;
			this.notificationService.showSnackbar(errorMessage);
			console.error(errorMessage, error);
			await this.navigationService.navigateTo('rooms', undefined, true);
		} finally {
			this.wizardService.resetWizard();
			// Deactivate loading state
			this.isCreatingRoom.set(false);
		}
	}
}
