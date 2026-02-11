import { Component, computed, OnInit, Signal, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute } from '@angular/router';
import { MeetRoomOptions } from '@openvidu-meet/typings';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { StepIndicatorComponent } from '../../components/step-indicator/step-indicator.component';
import { WizardNavComponent } from '../../components/wizard-nav/wizard-nav.component';
import { WizardNavigationConfig, WizardStep } from '../../models/wizard.model';
import { RoomService } from '../../services/room.service';
import { RoomWizardStateService } from '../../services/wizard-state.service';
import { RoomBasicCreationComponent } from '../room-basic-creation/room-basic-creation.component';
import { RecordingConfigComponent } from './steps/recording-config/recording-config.component';
import { RecordingLayoutComponent } from './steps/recording-layout/recording-layout.component';
import { RecordingTriggerComponent } from './steps/recording-trigger/recording-trigger.component';
import { RoomConfigComponent } from './steps/room-config/room-config.component';
import { RoomWizardRoomDetailsComponent } from './steps/room-details/room-details.component';

@Component({
	selector: 'ov-room-wizard',
	imports: [
		StepIndicatorComponent,
		WizardNavComponent,
		MatButtonModule,
		MatIconModule,
		MatProgressSpinnerModule,
		MatSlideToggleModule,
		RoomBasicCreationComponent,
		RoomWizardRoomDetailsComponent,
		RecordingConfigComponent,
		RecordingTriggerComponent,
		RecordingLayoutComponent,
		RoomConfigComponent
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
			const { roomName, autoDeletionDate, config } = await this.roomService.getRoom(this.roomId, {
				fields: ['roomName', 'autoDeletionDate', 'config'],
				extraFields: ['config']
			});
			this.existingRoomData = { roomName, autoDeletionDate, config };
			if (this.existingRoomData) {
				this.isBasicCreation.set(false);
			}
		} catch (error) {
			console.error('Error loading room data:', error);
			// Navigate back to rooms list if room not found
			await this.navigationService.navigateTo('/rooms', undefined, true);
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
		await this.navigationService.navigateTo('/rooms', undefined, true);
	}

	async createRoomBasic(roomName?: string) {
		try {
			// Create room with basic config including e2ee: false (default settings)
			const { accessUrl } = await this.roomService.createRoom({ roomName }, { fields: ['accessUrl'] });

			// Extract the path from the access URL and navigate to it
			const url = new URL(accessUrl);
			const path = url.pathname;
			await this.navigationService.redirectTo(path);
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

	async createRoomAdvance() {
		const roomOptions = this.wizardService.roomOptions();
		console.log('Wizard completed with data:', roomOptions);

		// Activate loading state
		this.isCreatingRoom.set(true);

		try {
			if (this.editMode && this.roomId && roomOptions.config) {
				await this.roomService.updateRoomConfig(this.roomId, roomOptions.config);
				await this.navigationService.navigateTo('/rooms', undefined, true);
				this.notificationService.showSnackbar('Room updated successfully');
			} else {
				// Create new room
				const { accessUrl } = await this.roomService.createRoom(roomOptions, { fields: ['accessUrl'] });

				// Extract the path from the access URL and navigate to it
				const url = new URL(accessUrl);
				const path = url.pathname;
				await this.navigationService.redirectTo(path);
			}
		} catch (error) {
			const errorMessage = `Failed to ${this.editMode ? 'update' : 'create'} room`;
			this.notificationService.showSnackbar(errorMessage);
			console.error(errorMessage, error);
			await this.navigationService.navigateTo('/rooms', undefined, true);
		} finally {
			this.wizardService.resetWizard();
			// Deactivate loading state
			this.isCreatingRoom.set(false);
		}
	}
}
