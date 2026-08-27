import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute } from '@angular/router';
import {
	MeetRoomMemberOptions,
	MeetRoomOptions,
	MeetRoomRoles,
	MeetRoomRolesConfig,
	normalizePermissions
} from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
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
		RoomConfigComponent,
		TranslatePipe
	],
	templateUrl: './room-wizard.component.html',
	styleUrl: './room-wizard.component.scss'
})
export class RoomWizardComponent implements OnInit, OnDestroy {
	private wizardService = inject(RoomWizardStateService);
	protected roomService = inject(RoomService);
	protected roomMemberService = inject(RoomMemberService);
	protected notificationService = inject(NotificationService);
	private navigationService = inject(NavigationService);
	private route = inject(ActivatedRoute);
	private readonly translateService = inject(TranslateService);

	roomId?: string;
	existingRoomData?: MeetRoomOptions; // Edit mode

	isCreatingRoom = signal(false);
	isBasicCreation = signal(true);

	initialized = this.wizardService.isInitialized;
	editMode = this.wizardService.editMode;
	steps = this.wizardService.steps;
	stepWarnings = this.wizardService.stepsWithAutoStartWarning;
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

		// Jump to a specific step if requested via query param
		const requestedStep = this.route.snapshot.queryParamMap.get('step') as WizardStepId | null;

		if (requestedStep && Object.values(WizardStepId).includes(requestedStep)) {
			this.wizardService.goToStepById(requestedStep);
		}
	}

	// Backstop for exits that skip Cancel/Create/Update (browser-back, a navbar link): the router
	// destroys this component on every route change, so this is the one place guaranteed to run
	// regardless of how the wizard was left.
	ngOnDestroy() {
		this.wizardService.resetWizard();
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
			const { roomName, autoDeletionDate, autoDeletionPolicy, config, access, roles } =
				await this.roomService.getRoom(this.roomId, {
					fields: ['roomName', 'autoDeletionDate', 'autoDeletionPolicy', 'config', 'access', 'roles'],
					// 'config' and 'roles' are extra fields, excluded by default, so request them explicitly
					extraFields: ['config', 'roles']
				});

			// Populate existing room options based on fetched data
			this.existingRoomData = {
				roomName,
				autoDeletionDate,
				autoDeletionPolicy,
				config,
				roles: this.toCurrentPermissionKeys(roles)
			};
			this.existingRoomData.access = {
				anonymous: {
					moderator: { enabled: access.anonymous.moderator.enabled },
					speaker: { enabled: access.anonymous.speaker.enabled },
					recording: { enabled: access.anonymous.recording.enabled }
				},
				user: {
					enabled: access.user.enabled
				}
			};

			if (this.existingRoomData) {
				this.isBasicCreation.set(false);
			}
		} catch (error) {
			console.error('Error loading room data:', error);
			// Navigate back to rooms list if room not found
			await this.navigationService.navigateTo('/rooms', undefined, true);
		}
	}

	/**
	 * In compatibility mode the API serves each role's permissions under the current keys *and* the
	 * deprecated `can*` ones. The wizard edits only the current keys and sends the whole object back on
	 * update, so a permission the user flips would reach the API contradicting its own alias and the
	 * update would be rejected as a whole — the deprecated half is dropped here instead. Removed in 3.12.0.
	 */
	private toCurrentPermissionKeys(roles: MeetRoomRoles): MeetRoomRolesConfig {
		return {
			moderator: { permissions: normalizePermissions(roles.moderator.permissions) },
			speaker: { permissions: normalizePermissions(roles.speaker.permissions) }
		};
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
		const destination = this.editMode() && this.roomId ? `/rooms/${this.roomId}` : '/rooms';
		await this.navigationService.navigateTo(destination, undefined, true);
		this.wizardService.resetWizard();
	}

	async createRoomBasic(roomName?: string) {
		// Activate loading state
		const delayLoader = setTimeout(() => {
			this.isCreatingRoom.set(true);
		}, 200);

		try {
			// Create room with basic config
			const { access } = await this.roomService.createRoom({ roomName }, { fields: ['access'] });

			// Refresh the rooms list so the new room appears when the user returns to it
			this.navigationService.invalidateCachedRoute('rooms');

			// Extract the path from the access URL and navigate to it
			const url = new URL(access.user.url);
			const path = url.pathname;
			await this.navigationService.redirectTo(path);
		} catch (error) {
			const errorMessage = `${this.translateService.translate('ROOMS.ERRORS.FAILED_CREATE_ROOM_NAMED_PREFIX')}${roomName}`;
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
		const isEditMode = this.editMode();

		// Activate loading state
		const delayLoader = setTimeout(() => {
			this.isCreatingRoom.set(true);
		}, 200);

		try {
			if (isEditMode && this.roomId) {
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

				// Navigate to the room detail page after update, refreshing the rooms list and this
				// room's detail so the changes are reflected. The route change destroys this
				// component, which resets the wizard on its own (see ngOnDestroy).
				await this.navigationService.navigateToAndInvalidate(`/rooms/${this.roomId}`, 'rooms', undefined, true);
				this.notificationService.showSnackbar(this.translateService.translate('ROOMS.ERRORS.ROOM_UPDATED'));
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

				// Refresh the rooms list so the new room appears when the user returns to it
				this.navigationService.invalidateCachedRoute('rooms');

				// Extract the path from the access URL and navigate to it. Same as above: the route
				// change destroys this component and resets the wizard.
				const url = new URL(access.user.url);
				const path = url.pathname;
				await this.navigationService.redirectTo(path);
			}
		} catch (error) {
			// The backend already states which fields conflict (e.g. a recording auto-start mode
			// unreachable at the configured maxParticipants) — show that instead of a generic
			// message whenever the server sent one.
			const backendMessage = (error as HttpErrorResponse | undefined)?.error?.message;
			const errorMessage =
				backendMessage ||
				(isEditMode
					? this.translateService.translate('ROOMS.ERRORS.FAILED_UPDATE_ROOM')
					: this.translateService.translate('ROOMS.ERRORS.FAILED_CREATE_ROOM'));
			this.notificationService.showSnackbar(errorMessage);
			console.error(errorMessage, error);

			if (isEditMode && this.roomId) {
				// A partial update may already have been applied across the separate requests
				// above — invalidate so the list/detail reload fresh instead of showing stale data.
				// The route change destroys this component and resets the wizard.
				await this.navigationService.navigateToAndInvalidate(`/rooms/${this.roomId}`, 'rooms', undefined, true);
			}

			// A failed room creation never partially applies, so there's nothing to refresh: stay
			// on the wizard with its six steps of input intact instead of discarding them, so the
			// user can fix whatever the message above flagged and resubmit.
		} finally {
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
				.map((m) => m.userId || m.name)
				.join(', ');
			this.notificationService.showSnackbar(
				`${this.translateService.translate('ROOMS.ERRORS.ROOM_CREATED_MEMBERS_FAILED_PREFIX')}${failed.length}${this.translateService.translate('ROOMS.ERRORS.ROOM_CREATED_MEMBERS_FAILED_MIDDLE')}${failedIds}`
			);
			console.warn('Failed to add members:', failed);
		}
	}
}
