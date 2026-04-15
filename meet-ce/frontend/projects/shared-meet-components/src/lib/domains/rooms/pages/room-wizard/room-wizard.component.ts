import { Component, computed, inject, OnInit, Signal, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute } from '@angular/router';
import { MeetRoomMemberOptions, MeetRoomOptions } from '@openvidu-meet/typings';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RoomMemberService } from '../../../room-members/services/room-member.service';
import { StepIndicatorComponent } from '../../components/step-indicator/step-indicator.component';
import { WizardNavComponent } from '../../components/wizard-nav/wizard-nav.component';
import { WizardNavigationConfig, WizardStep } from '../../models/wizard.model';
import { RoomService } from '../../services/room.service';
import { RoomWizardStateService } from '../../services/wizard-state.service';
import { RoomBasicCreationComponent } from '../room-basic-creation/room-basic-creation.component';
import { RecordingConfigComponent } from './steps/recording-config/recording-config.component';
import { RecordingLayoutComponent } from './steps/recording-layout/recording-layout.component';
import { RecordingTriggerComponent } from './steps/recording-trigger/recording-trigger.component';
import { RoomAccessComponent } from './steps/room-access/room-access.component';
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
		RoomAccessComponent,
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
	protected roomMemberService = inject(RoomMemberService);
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
			this.roomId = this.route.snapshot.paramMap.get('room-id') || undefined;
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
		const destination = this.editMode && this.roomId ? `/rooms/${this.roomId}` : '/rooms';
		await this.navigationService.navigateTo(destination, undefined, true);
	}

	async createRoomBasic(roomName?: string) {
		try {
			// Create room with basic config including e2ee: false (default settings)
			const { access } = await this.roomService.createRoom({ roomName }, { fields: ['access'] });

			// Extract the path from the access URL and navigate to it
			const url = new URL(access.registered.url);
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
		const pendingMembers = this.wizardService.pendingMembers();
		console.log('Wizard completed with data:', roomOptions, 'pending members:', pendingMembers);

		// Activate loading state
		this.isCreatingRoom.set(true);

		try {
			if (this.editMode && this.roomId && roomOptions.config) {
				await this.roomService.updateRoomConfig(this.roomId, roomOptions.config);
				await this.navigationService.navigateTo(`/rooms/${this.roomId}`, undefined, true);
				this.notificationService.showSnackbar('Room updated successfully');
			} else {
				// Create new room
				const room = await this.roomService.createRoom(roomOptions, { fields: ['access', 'roomId'] });

				// TODO: Should this creation of pending memeber be handled by the backend as part of the room creation when pending members exist?
				// Create pending members (best-effort – failures are reported as warnings)
				if (pendingMembers.length > 0) {
					await this.createPendingMembers(room.roomId, pendingMembers);
				}

				// Extract the path from the access URL and navigate to it
				const url = new URL(room.access.registered.url);
				const path = url.pathname;
				await this.navigationService.redirectTo(path);
			}
		} catch (error) {
			const errorMessage = `Failed to ${this.editMode ? 'update' : 'create'} room`;
			this.notificationService.showSnackbar(errorMessage);
			console.error(errorMessage, error);
			const destination = this.editMode && this.roomId ? `/rooms/${this.roomId}` : '/rooms';
			await this.navigationService.navigateTo(destination, undefined, true);
		} finally {
			this.wizardService.resetWizard();
			// Deactivate loading state
			this.isCreatingRoom.set(false);
		}
	}

	private async createPendingMembers(roomId: string, members: MeetRoomMemberOptions[]): Promise<void> {
		const results = await Promise.allSettled(
			members.map((m) => this.roomMemberService.createRoomMember(roomId, m))
		);
		const failed = results.filter((r) => r.status === 'rejected');
		if (failed.length > 0) {
			const failedIds = members
				.filter((_, i) => results[i].status === 'rejected')
				.map((m) => m.userId)
				.join(', ');
			this.notificationService.showSnackbar(
				`Room created, but failed to add ${failed.length} member(s): ${failedIds}`
			);
			console.warn('Failed to add members:', failed);
		}
	}
}
