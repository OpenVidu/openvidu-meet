import { inject, Injectable } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import {
	AuthService,
	RecordingService,
	RoomService,
	ParticipantService,
	NavigationService,
	AppDataService,
	WebComponentManagerService
} from '..';
import { MeetRoomStatus } from '@openvidu-meet/typings';
import { LobbyState } from '../../models/lobby.model';
import { ErrorReason } from '../../models';
import { ActivatedRoute } from '@angular/router';

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
		participantForm: new FormGroup({
			name: new FormControl('', [Validators.required])
		}),
		participantToken: ''
	};

	protected roomService: RoomService = inject(RoomService);
	protected recordingService: RecordingService = inject(RecordingService);
	protected authService: AuthService = inject(AuthService);
	protected participantService: ParticipantService = inject(ParticipantService);
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

	/**
	 * Initializes the lobby state by fetching room data and configuring UI
	 */
	async initialize(): Promise<LobbyState> {
		this.state.roomId = this.roomService.getRoomId();
		this.state.roomSecret = this.roomService.getRoomSecret();
		this.state.room = await this.roomService.getRoom(this.state.roomId);
		this.state.roomClosed = this.state.room.status === MeetRoomStatus.CLOSED;

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
		if (!this.participantName) {
			console.error('Participant form is invalid. Cannot access meeting.');
			throw new Error('Participant form is invalid');
		}

		await this.generateParticipantToken();
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
	 * It is necessary to previously generate a recording token in order to list the recordings.
	 * If token generation fails or the user does not have sufficient permissions to list recordings,
	 * the error will be caught and the recordings card will be hidden (`showRecordingCard` will be set to `false`).
	 *
	 * If recordings exist, sets `showRecordingCard` to `true`; otherwise, to `false`.
	 */
	protected async checkForRecordings(): Promise<void> {
		try {
			const { canRetrieveRecordings } = await this.recordingService.generateRecordingToken(
				this.state.roomId,
				this.state.roomSecret
			);

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
	 * Retrieves the participant name from the ParticipantTokenService first, and if not available,
	 * falls back to the authenticated username. Sets the retrieved name value in the
	 * participant form's 'name' control if a valid name is found.
	 *
	 * @returns A promise that resolves when the participant name has been initialized
	 */
	protected async initializeParticipantName(): Promise<void> {
		// Apply participant name from ParticipantTokenService if set, otherwise use authenticated username
		const currentParticipantName = this.participantService.getParticipantName();
		const username = await this.authService.getUsername();
		const participantName = currentParticipantName || username;

		if (participantName) {
			this.participantName = participantName;
		}
	}

	/**
	 * Generates a participant token for joining a meeting.
	 *
	 * @throws When participant already exists in the room (status 409)
	 * @returns Promise that resolves when token is generated
	 */
	protected async generateParticipantToken() {
		try {
			this.state.participantToken = await this.participantService.generateToken({
				roomId: this.state.roomId,
				secret: this.state.roomSecret,
				participantName: this.participantName
			});
			this.participantName = this.participantService.getParticipantName()!;
		} catch (error: any) {
			console.error('Error generating participant token:', error);
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

			throw new Error('Error generating participant token');
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
