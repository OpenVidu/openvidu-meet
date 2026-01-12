import { computed, inject, Injectable, signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MeetRoomStatus } from '@openvidu-meet/typings';
import { LoggerService } from 'openvidu-components-angular';
import {
	MeetingContextService,
	MeetingService,

	MeetingWebComponentManagerService
} from '.';
import { AppDataService, NavigationService } from '../../../shared';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { AuthService } from '../../auth/services/auth.service';
import { RecordingService } from '../../recordings/services';
import {
	RoomMemberService,
	RoomService,
} from '../../rooms/services';
import { LobbyState } from '../models/lobby.model';

/**
 * Service that manages the meeting lobby phase state and operations.
 *
 * This service is ONLY responsible for the LOBBY PHASE - the period before a participant joins the meeting.
 *
 */
@Injectable()
export class MeetingLobbyService {
	/**
	 * Reactive signal for lobby state.
	 * This state is only relevant during the lobby phase.
	 */
	private readonly _state = signal<LobbyState>({
		roomId: undefined,
		roomClosed: false,
		showRecordingCard: false,
		showBackButton: true,
		backButtonText: 'Back',
		hasRoomE2EEEnabled: false,
		participantForm: new FormGroup({
			name: new FormControl('', [Validators.required]),
			e2eeKey: new FormControl('')
		}),
		roomMemberToken: undefined
	});

	protected roomService: RoomService = inject(RoomService);
	protected meetingContextService: MeetingContextService = inject(MeetingContextService);
	protected meetingService: MeetingService = inject(MeetingService);
	protected recordingService: RecordingService = inject(RecordingService);
	protected authService: AuthService = inject(AuthService);
	protected roomMemberService: RoomMemberService = inject(RoomMemberService);
	protected navigationService: NavigationService = inject(NavigationService);
	protected appDataService: AppDataService = inject(AppDataService);
	protected wcManagerService: MeetingWebComponentManagerService = inject(MeetingWebComponentManagerService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingLobbyService');
	protected route: ActivatedRoute = inject(ActivatedRoute);

	/**
	 * Readonly signal for lobby state - components can use computed() with this
	 */
	readonly state = this._state.asReadonly();

	/**
	 * Computed signal for meeting URL derived from MeetingContextService
	 * This ensures a single source of truth for the meeting URL
	 */
	readonly meetingUrl = computed(() => this.meetingContextService.meetingUrl());

	/**
	 * Computed signal for whether the current user can moderate the room
	 * Derived from MeetingContextService
	 */
	readonly canModerateRoom = computed(() => this.meetingContextService.canModerateRoom());

	/**
	 * Computed signal for participant name - optimized to avoid repeated form access
	 */
	readonly participantName = computed(() => {
		const { valid, value } = this._state().participantForm;
		if (!valid || !value.name?.trim()) {
			return '';
		}
		return value.name.trim();
	});

	/**
	 * Computed signal for E2EE key - optimized to avoid repeated form access
	 * Uses getRawValue() to get the value even when the control is disabled (e.g., when set from URL param)
	 */
	readonly e2eeKeyValue = computed(() => {
		const form = this._state().participantForm;
		const rawValue = form.getRawValue();
		if (!form.valid || !rawValue.e2eeKey?.trim()) {
			return '';
		}
		return rawValue.e2eeKey.trim();
	});

	/**
	 * Computed signal for room member token
	 */
	readonly roomMemberToken = computed(() => this._state().roomMemberToken);

	/**
	 * Computed signal for room ID
	 */
	readonly roomId = computed(() => this._state().roomId);

	/**
	 * Computed signal for room secret.
	 * Obtained from MeetingContextService
	 */
	readonly roomSecret = computed(() => this.meetingContextService.roomSecret());

	/**
	 * Computed signal for room name
	 */
	readonly roomName = computed(() => this._state().room?.roomName);

	/**
	 * Computed signal for has recordings.
	 * Obtained from MeetingContextService
	 */
	readonly hasRecordings = computed(() => this.meetingContextService.hasRecordings());

	/**
	 * Setter for participant name
	 */
	setParticipantName(name: string): void {
		this._state().participantForm.get('name')?.setValue(name);
	}

	/**
	 * Setter for E2EE key
	 */
	setE2eeKey(key: string): void {
		this._state().participantForm.get('e2eeKey')?.setValue(key);
	}

	/**
	 * Initializes the lobby state by fetching room data and configuring UI
	 */
	async initialize(): Promise<void> {
		try {
			const roomId = this.meetingContextService.roomId();
			if (!roomId) throw new Error('Room ID is not set in Meeting Context');

			this._state.update((state) => ({ ...state, roomId }));

			const [room] = await Promise.all([
				this.roomService.getRoom(roomId),
				this.setBackButtonText(),
				this.checkForRecordings(),
				this.initializeParticipantName()
			]);

			const roomClosed = room.status === MeetRoomStatus.CLOSED;
			const hasRoomE2EEEnabled = room.config?.e2ee?.enabled || false;

			this._state.update((state) => ({
				...state,
				room,
				roomClosed,
				hasRoomE2EEEnabled
			}));

			this.meetingContextService.setMeetRoom(room);

			if (hasRoomE2EEEnabled) {
				// If E2EE is enabled, make the e2eeKey form control required
				const form = this._state().participantForm;
				form.get('e2eeKey')?.setValidators([Validators.required]);
				const contextE2eeKey = this.meetingContextService.e2eeKey();
				if (contextE2eeKey) {
					this.setE2eeKey(contextE2eeKey);
					// fill the e2eeKey form control if already set in context (e.g., from URL param)
					form.get('e2eeKey')?.disable();
				}
				form.get('e2eeKey')?.updateValueAndValidity();
			}
		} catch (error) {
			this.clearLobbyState();
			throw error;
		}
	}

	/**
	 * Copies the meeting speaker link to clipboard
	 */
	copyMeetingSpeakerLink() {
		const { room } = this.state();
		if (room) {
			this.meetingService.copyMeetingSpeakerLink(room);
		}
	}

	/**
	 * Handles the back button click event and navigates accordingly
	 * If in embedded mode, it closes the WebComponentManagerService
	 * If the redirect URL is set, it navigates to that URL
	 * If in standalone mode without a redirect URL, it navigates to the rooms page
	 */
	async goBack() {
		try {
			if (this.appDataService.isEmbeddedMode()) {
				this.wcManagerService.close();
			}

			const redirectTo = this.navigationService.getLeaveRedirectURL();
			if (redirectTo) {
				// Navigate to the specified redirect URL
				await this.navigationService.redirectToLeaveUrl();
				return;
			}

			if (this.appDataService.isStandaloneMode()) {
				// Navigate to rooms page
				await this.navigationService.navigateTo('/rooms');
			}
		} catch (error) {
			this.log.e('Error handling back navigation:', error);
		}
	}

	/**
	 * Navigates to recordings page
	 */
	async goToRecordings(): Promise<void> {
		try {
			const roomId = this._state().roomId;
			const roomSecret = this.meetingContextService.roomSecret();
			await this.navigationService.navigateTo(`room/${roomId}/recordings`, {
				secret: roomSecret
			});
		} catch (error) {
			this.log.e('Error navigating to recordings:', error);
		}
	}

	async submitAccess(): Promise<void> {
		const sanitized = this.participantName().trim(); // remove leading/trailing spaces

		if (!sanitized) {
			this.log.e('Participant form is invalid. Cannot access meeting.');
			throw new Error('Participant form is invalid');
		}
		this.setParticipantName(sanitized);

		// For E2EE rooms, validate passkey
		const { hasRoomE2EEEnabled, roomId } = this._state();
		if (hasRoomE2EEEnabled) {
			const e2eeKey = this.e2eeKeyValue();
			if (!e2eeKey) {
				this.log.w('E2EE key is required for encrypted rooms.');
				return;
			}
			this.meetingContextService.setE2eeKey(e2eeKey);
		}

		await this.generateRoomMemberToken();
		await Promise.all([this.addParticipantNameToUrl(), this.roomService.loadRoomConfig(roomId!)]);
	}

	/**
	 * Sets the back button text based on the application mode and user role
	 */
	protected async setBackButtonText(): Promise<void> {
		const isStandaloneMode = this.appDataService.isStandaloneMode();
		const redirection = this.navigationService.getLeaveRedirectURL();
		const isAdmin = await this.authService.isAdmin();

		if (isStandaloneMode && !redirection && !isAdmin) {
			this._state.update((state) => ({ ...state, showBackButton: false }));
			return;
		}

		const backButtonText = isStandaloneMode && !redirection && isAdmin ? 'Back to Rooms' : 'Back';
		this._state.update((state) => ({ ...state, showBackButton: true, backButtonText }));
	}

	/**
	 * Checks if there are recordings in the room and updates the visibility of the recordings card.
	 *
	 * If the user does not have sufficient permissions to list recordings,
	 * the recordings card will be hidden (`showRecordingCard` will be set to `false`).
	 *
	 * If recordings exist, stores in MeetingContextService and shows recording card UI.
	 */
	protected async checkForRecordings(): Promise<void> {
		try {
			const canRetrieveRecordings = this.roomMemberService.canRetrieveRecordings();

			if (!canRetrieveRecordings) {
				this._state.update((state) => ({ ...state, showRecordingCard: false }));
				return;
			}

			const { roomId } = this._state();
			if (!roomId) throw new Error('Room ID is not set in lobby state');
			const { recordings } = await this.recordingService.listRecordings({
				maxItems: 1,
				roomId,
				fields: 'recordingId'
			});

			const hasRecordings = recordings.length > 0;

			// Store in MeetingContextService (Single Source of Truth)
			this.meetingContextService.setHasRecordings(hasRecordings);

			// Update only UI flag locally
			this._state.update((state) => ({
				...state,
				showRecordingCard: hasRecordings
			}));
		} catch (error) {
			this.log.e('Error checking for recordings:', error);
			this._state.update((state) => ({ ...state, showRecordingCard: false }));
		}
	}

	/**
	 * Initializes the participant name in the form control.
	 *
	 * Retrieves the participant name from the RoomMemberService first, and if not available,
	 * falls back to the authenticated username. Sets the retrieved name value in the
	 * participant form's 'name' control if a valid name is found.
	 *
	 * @returns A promise that resolves when the participant name has been initialized
	 */
	protected async initializeParticipantName(): Promise<void> {
		// Apply participant name from RoomMemberService if set, otherwise use authenticated username
		const currentParticipantName = this.roomMemberService.getParticipantName();
		const username = await this.authService.getUsername();
		const participantName = currentParticipantName || username;

		if (participantName) {
			this.setParticipantName(participantName);
		}
	}

	/**
	 * Generates a room member token for joining a meeting.
	 *
	 * @returns Promise that resolves when token is generated
	 */
	protected async generateRoomMemberToken() {
		try {
			const roomId = this._state().roomId;
			const roomSecret = this.meetingContextService.roomSecret();
			const roomMemberToken = await this.roomMemberService.generateToken(
				roomId!,
				{
					secret: roomSecret!,
					grantJoinMeetingPermission: true,
					participantName: this.participantName()
				},
				this.e2eeKeyValue()
			);
			const updatedName = this.roomMemberService.getParticipantName()!;
			this.setParticipantName(updatedName);
			this._state.update((state) => ({ ...state, roomMemberToken }));
		} catch (error: any) {
			this.log.e('Error generating room member token:', error);
			switch (error.status) {
				case 400:
					// Invalid secret
					await this.navigationService.redirectToErrorPage(NavigationErrorReason.INVALID_ROOM_SECRET, true);
					break;
				case 404:
					// Room not found
					await this.navigationService.redirectToErrorPage(NavigationErrorReason.INVALID_ROOM, true);
					break;
				case 409:
					// Room is closed
					await this.navigationService.redirectToErrorPage(NavigationErrorReason.CLOSED_ROOM, true);
					break;
				default:
					await this.navigationService.redirectToErrorPage(NavigationErrorReason.INTERNAL_ERROR, true);
			}

			throw new Error('Error generating room member token');
		}
	}

	/**
	 * Add participant name as a query parameter to the URL
	 */
	protected async addParticipantNameToUrl() {
		await this.navigationService.updateQueryParamsFromUrl(this.route.snapshot.queryParams, {
			'participant-name': this.participantName()
		});
	}

	protected clearLobbyState() {
		this._state.set({
			roomId: undefined,
			roomClosed: false,
			showRecordingCard: false,
			showBackButton: true,
			backButtonText: 'Back',
			hasRoomE2EEEnabled: false,
			participantForm: new FormGroup({
				name: new FormControl('', [Validators.required]),
				e2eeKey: new FormControl('')
			}),
			roomMemberToken: undefined
		});
	}
}
