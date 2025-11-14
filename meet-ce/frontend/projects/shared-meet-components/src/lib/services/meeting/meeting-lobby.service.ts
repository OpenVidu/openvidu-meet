import { inject, Injectable } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MeetRoomStatus } from '@openvidu-meet/typings';
import {
	AppDataService,
	AuthService,
	NavigationService,
	RecordingService,
	RoomMemberService,
	RoomService,
	WebComponentManagerService
} from '..';
import { ErrorReason } from '../../models';
import { LobbyState } from '../../models/lobby.model';

/**
 * Service that manages the meeting lobby state and operations.
 *
 * Responsibilities:
 * - Initialize and maintain lobby state
 * - Validate participant information
 * - Check for recordings availability
 * - Handle navigation (back button, recordings)
 *
 * This service coordinates multiple domain services to provide
 * a simplified interface for the MeetingComponent.
 */
@Injectable()
export class MeetingLobbyService {
	private state: LobbyState = {
		roomId: '',
		roomSecret: '',
		roomClosed: false,
		hasRecordings: false,
		showRecordingCard: false,
		showBackButton: true,
		backButtonText: 'Back',
		isE2EEEnabled: false,
		participantForm: new FormGroup({
			name: new FormControl('', [Validators.required]),
			e2eeKey: new FormControl('')
		}),
		roomMemberToken: ''
	};

	protected roomService: RoomService = inject(RoomService);
	protected recordingService: RecordingService = inject(RecordingService);
	protected authService: AuthService = inject(AuthService);
	protected roomMemberService: RoomMemberService = inject(RoomMemberService);
	protected navigationService: NavigationService = inject(NavigationService);
	protected appDataService: AppDataService = inject(AppDataService);
	protected wcManagerService: WebComponentManagerService = inject(WebComponentManagerService);
	protected route: ActivatedRoute = inject(ActivatedRoute);

	/**
	 * Gets the current lobby state
	 */
	get lobbyState(): LobbyState {
		return this.state;
	}

	set participantName(name: string) {
		this.state.participantForm.get('name')?.setValue(name);
	}

	get participantName(): string {
		const { valid, value } = this.state.participantForm;
		if (!valid || !value.name?.trim()) {
			return '';
		}
		return value.name.trim();
	}

	set e2eeKey(key: string) {
		this.state.participantForm.get('e2eeKey')?.setValue(key);
	}

	get e2eeKey(): string {
		const { valid, value } = this.state.participantForm;
		if (!valid || !value.e2eeKey?.trim()) {
			return '';
		}
		return value.e2eeKey.trim();
	}

	/**
	 * Initializes the lobby state by fetching room data and configuring UI
	 */
	async initialize(): Promise<LobbyState> {
		this.state.roomId = this.roomService.getRoomId();
		this.state.roomSecret = this.roomService.getRoomSecret();
		this.state.room = await this.roomService.getRoom(this.state.roomId);
		this.state.roomClosed = this.state.room.status === MeetRoomStatus.CLOSED;
		this.state.isE2EEEnabled = this.state.room.config.e2ee?.enabled || false;

		// If E2EE is enabled, require e2eeKey
		if (this.state.isE2EEEnabled) {
			this.state.participantForm.get('e2eeKey')?.setValidators([Validators.required]);
			this.e2eeKey = this.roomService.getE2EEKey();

			if (this.e2eeKey) {
				// when e2eeKey is already set (e.g., from URL or webcomponent), populate and disable field
				this.state.participantForm.get('e2eeKey')?.disable();
			}
			this.state.participantForm.get('e2eeKey')?.updateValueAndValidity();
		}

		await this.setBackButtonText();
		await this.checkForRecordings();
		await this.initializeParticipantName();

		return this.state;
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
			console.error('Error handling back navigation:', error);
		}
	}

	/**
	 * Navigates to recordings page
	 */
	async goToRecordings(): Promise<void> {
		try {
			await this.navigationService.navigateTo(`room/${this.state.roomId}/recordings`, {
				secret: this.state.roomSecret
			});
		} catch (error) {
			console.error('Error navigating to recordings:', error);
		}
	}

	async submitAccess(): Promise<void> {
		const sanitized = this.participantName.trim(); // remove leading/trailing spaces

		if (!sanitized) {
			console.error('Participant form is invalid. Cannot access meeting.');
			throw new Error('Participant form is invalid');
		}
		this.participantName = sanitized;

		// For E2EE rooms, validate passkey
		if (this.state.isE2EEEnabled && !this.e2eeKey) {
			console.warn('E2EE key is required for encrypted rooms.');
			return;
		}

		await this.generateRoomMemberToken();
		await this.addParticipantNameToUrl();
		await this.roomService.loadRoomConfig(this.state.roomId);
	}

	// Protected helper methods

	/**
	 * Sets the back button text based on the application mode and user role
	 */
	protected async setBackButtonText(): Promise<void> {
		const isStandaloneMode = this.appDataService.isStandaloneMode();
		const redirection = this.navigationService.getLeaveRedirectURL();
		const isAdmin = await this.authService.isAdmin();

		if (isStandaloneMode && !redirection && !isAdmin) {
			this.state.showBackButton = false;
			return;
		}

		this.state.showBackButton = true;
		this.state.backButtonText = isStandaloneMode && !redirection && isAdmin ? 'Back to Rooms' : 'Back';
	}

	/**
	 * Checks if there are recordings in the room and updates the visibility of the recordings card.
	 *
	 * If the user does not have sufficient permissions to list recordings,
	 * the recordings card will be hidden (`showRecordingCard` will be set to `false`).
	 *
	 * If recordings exist, sets `showRecordingCard` to `true`; otherwise, to `false`.
	 */
	protected async checkForRecordings(): Promise<void> {
		try {
			const canRetrieveRecordings = this.roomMemberService.canRetrieveRecordings();

			if (!canRetrieveRecordings) {
				this.state.showRecordingCard = false;
				return;
			}

			const { recordings } = await this.recordingService.listRecordings({
				maxItems: 1,
				roomId: this.state.roomId,
				fields: 'recordingId'
			});

			this.state.hasRecordings = recordings.length > 0;
			this.state.showRecordingCard = this.state.hasRecordings;
		} catch (error) {
			console.error('Error checking for recordings:', error);
			this.state.showRecordingCard = false;
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
			this.participantName = participantName;
		}
	}

	/**
	 * Generates a room member token for joining a meeting.
	 *
	 * @returns Promise that resolves when token is generated
	 */
	protected async generateRoomMemberToken() {
		try {
			this.state.roomMemberToken = await this.roomMemberService.generateToken(
				this.state.roomId,
				{
					secret: this.state.roomSecret,
					grantJoinMeetingPermission: true,
					participantName: this.participantName
				},
				this.e2eeKey
			);
			this.participantName = this.roomMemberService.getParticipantName()!;
		} catch (error: any) {
			console.error('Error generating room member token:', error);
			switch (error.status) {
				case 400:
					// Invalid secret
					await this.navigationService.redirectToErrorPage(ErrorReason.INVALID_ROOM_SECRET, true);
					break;
				case 404:
					// Room not found
					await this.navigationService.redirectToErrorPage(ErrorReason.INVALID_ROOM, true);
					break;
				case 409:
					// Room is closed
					await this.navigationService.redirectToErrorPage(ErrorReason.CLOSED_ROOM, true);
					break;
				default:
					await this.navigationService.redirectToErrorPage(ErrorReason.INTERNAL_ERROR, true);
			}

			throw new Error('Error generating room member token');
		}
	}

	/**
	 * Add participant name as a query parameter to the URL
	 */
	protected async addParticipantNameToUrl() {
		await this.navigationService.updateQueryParamsFromUrl(this.route.snapshot.queryParams, {
			'participant-name': this.participantName
		});
	}
}
