import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
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
import { WizardStep, WizardStepId } from '../../models/wizard.model';
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
	styleUrl: './room-wizard.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomWizardComponent implements OnInit {
	private wizardService = inject(RoomWizardStateService);
	protected roomService = inject(RoomService);
	protected roomMemberService = inject(RoomMemberService);
	protected notificationService = inject(NotificationService);
	private navigationService = inject(NavigationService);
	private route = inject(ActivatedRoute);

	roomId?: string;
	existingRoomData?: MeetRoomOptions; // Edit mode

	isCreatingRoom = signal(false);
	isBasicCreation = signal(true);

	initialized = this.wizardService.isInitialized;
	editMode = this.wizardService.editMode;
	steps = this.wizardService.steps;
	currentStep = this.wizardService.currentStep;
	currentStepIndex = this.wizardService.currentStepIndex;
	navigationConfig = computed(() => this.wizardService.getNavigationConfig());
	protected readonly WizardStepId = WizardStepId;

	async ngOnInit() {
		// Detect edit mode from route
		const editMode = this.detectEditMode();

		// If in edit mode, load room data
		if (editMode && this.roomId) {
			await this.loadRoomData();
		}

		// Initialize wizard with edit mode and existing data
		this.wizardService.initializeWizard(editMode, this.existingRoomData);
	}

	private detectEditMode(): boolean {
		// Check if URL contains '/edit' to determine edit mode
		const url = this.route.snapshot.url;
		const editMode = url.some((segment) => segment.path === 'edit');

		// Get roomId from route parameters when in edit mode
		if (editMode) {
			this.roomId = this.route.snapshot.paramMap.get('room-id') || undefined;
		}

		return editMode;
	}

	private async loadRoomData() {
		if (!this.roomId) return;

		try {
			const { roomName, autoDeletionDate, config, access, roles } = await this.roomService.getRoom(this.roomId, {
				fields: ['roomName', 'autoDeletionDate', 'config', 'access', 'roles'],
				extraFields: ['config']
			});
			this.existingRoomData = { roomName, autoDeletionDate, config, access, roles };
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
		const destination = this.editMode() && this.roomId ? `/rooms/${this.roomId}` : '/rooms';
		await this.navigationService.navigateTo(destination, undefined, true);
	}

	async createRoomBasic(roomName?: string) {
		// Activate loading state
		const delayLoader = setTimeout(() => {
			this.isCreatingRoom.set(true);
		}, 200);

		try {
			// Create room with basic config
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
			clearTimeout(delayLoader);
			this.isCreatingRoom.set(false);
		}
	}

	async createRoomAdvance() {
		const roomOptions = this.wizardService.roomOptions();
		const pendingMembers = this.wizardService.pendingMembers();

		// Activate loading state
		const delayLoader = setTimeout(() => {
			this.isCreatingRoom.set(true);
		}, 200);

		try {
			if (this.editMode() && this.roomId) {
				// Update only the fields that are editable in the wizard (config, access and roles)
				if (roomOptions.config) {
					await this.roomService.updateRoomConfig(this.roomId, roomOptions.config);
				}
				if (roomOptions.access) {
					await this.roomService.updateRoomAccess(this.roomId, roomOptions.access);
				}
				if (roomOptions.roles) {
					await this.roomService.updateRoomRoles(this.roomId, roomOptions.roles);
				}

				// Navigate to the room detail page after update
				await this.navigationService.navigateTo(`/rooms/${this.roomId}`, undefined, true);
				this.notificationService.showSnackbar('Room updated successfully');
			} else {
				// Create new room
				const { roomId, access } = await this.roomService.createRoom(roomOptions, {
					fields: ['roomId', 'access']
				});

				// TODO: Should this creation of pending members be handled by the backend as part of the room creation?
				// Create pending members (best-effort – failures are reported as warnings)
				if (pendingMembers.length > 0) {
					await this.createPendingMembers(roomId, pendingMembers);
				}

				// Extract the path from the access URL and navigate to it
				const url = new URL(access.registered.url);
				const path = url.pathname;
				await this.navigationService.redirectTo(path);
			}
		} catch (error) {
			const errorMessage = `Failed to ${this.editMode() ? 'update' : 'create'} room`;
			this.notificationService.showSnackbar(errorMessage);
			console.error(errorMessage, error);

			const destination = this.editMode() && this.roomId ? `/rooms/${this.roomId}` : '/rooms';
			await this.navigationService.navigateTo(destination, undefined, true);
		} finally {
			this.wizardService.resetWizard();
			// Deactivate loading state
			clearTimeout(delayLoader);
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
