import { Clipboard } from '@angular/cdk/clipboard';
import { Component, OnInit, Signal } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule, MatIconButton } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatRippleModule } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { ErrorReason } from '@lib/models';
import {
	AppDataService,
	ApplicationFeatures,
	AuthService,
	FeatureConfigurationService,
	MeetingService,
	NavigationService,
	NotificationService,
	ParticipantTokenService,
	RecordingManagerService,
	RoomService,
	SessionStorageService,
	WebComponentManagerService
} from '@lib/services';
import {
	LeftEventReason,
	MeetRoom,
	MeetRoomPreferences,
	ParticipantRole,
	WebComponentEvent,
	WebComponentOutboundEventMessage
} from '@lib/typings/ce';
import { MeetSignalType } from '@lib/typings/ce/event.model';
import {
	ApiDirectiveModule,
	DataPacket_Kind,
	OpenViduComponentsUiModule,
	OpenViduService,
	ParticipantLeftEvent,
	ParticipantLeftReason,
	ParticipantModel,
	RecordingStartRequestedEvent,
	RecordingStopRequestedEvent,
	RemoteParticipant,
	Room,
	RoomEvent
} from 'openvidu-components-angular';

@Component({
	selector: 'app-video-room',
	templateUrl: './video-room.component.html',
	styleUrls: ['./video-room.component.scss'],
	standalone: true,
	imports: [
		OpenViduComponentsUiModule,
		ApiDirectiveModule,
		MatFormFieldModule,
		MatInputModule,
		FormsModule,
		ReactiveFormsModule,
		MatCardModule,
		MatButtonModule,
		MatIconModule,
		MatIconButton,
		MatMenuModule,
		MatDividerModule,
		MatTooltipModule,
		MatRippleModule
	]
})
export class VideoRoomComponent implements OnInit {
	participantForm = new FormGroup({
		name: new FormControl('', [Validators.required, Validators.minLength(4)])
	});
	showRecordingCard = false;

	showBackButton = true;
	backButtonText = 'Back';

	room?: MeetRoom;
	roomId = '';
	roomSecret = '';
	participantName = '';
	participantToken = '';
	participantRole: ParticipantRole = ParticipantRole.PUBLISHER;

	showRoom = false;
	features: Signal<ApplicationFeatures>;
	meetingEndedByMe = false;

	constructor(
		protected route: ActivatedRoute,
		protected navigationService: NavigationService,
		protected participantTokenService: ParticipantTokenService,
		protected recManagerService: RecordingManagerService,
		protected authService: AuthService,
		protected roomService: RoomService,
		protected meetingService: MeetingService,
		protected openviduService: OpenViduService,
		protected participantService: ParticipantTokenService,
		protected appDataService: AppDataService,
		protected wcManagerService: WebComponentManagerService,
		protected sessionStorageService: SessionStorageService,
		protected featureConfService: FeatureConfigurationService,
		protected clipboard: Clipboard,
		protected notificationService: NotificationService,
		protected recordingService: RecordingManagerService
	) {
		this.features = this.featureConfService.features;
	}

	async ngOnInit() {
		this.roomId = this.roomService.getRoomId();
		this.roomSecret = this.roomService.getRoomSecret();

		await this.setBackButtonText();
		await this.checkForRecordings();
		await this.initializeParticipantName();
	}

	/**
	 * Sets the back button text based on the application mode and user role
	 */
	private async setBackButtonText() {
		const isStandaloneMode = this.appDataService.isStandaloneMode();
		const redirection = this.navigationService.getLeaveRedirectURL();
		const isAdmin = await this.authService.isAdmin();

		if (isStandaloneMode && !redirection && !isAdmin) {
			// If in standalone mode, no redirection URL and not an admin, hide the back button
			this.showBackButton = false;
			return;
		}

		this.showBackButton = true;
		this.backButtonText = isStandaloneMode && !redirection && isAdmin ? 'Back to Rooms' : 'Back';
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
	private async checkForRecordings() {
		try {
			await this.recManagerService.generateRecordingToken(this.roomId, this.roomSecret);
			const { recordings } = await this.recManagerService.listRecordings({
				maxItems: 1,
				roomId: this.roomId,
				fields: 'recordingId'
			});
			this.showRecordingCard = recordings.length > 0;
		} catch (error) {
			console.error('Error checking for recordings:', error);
			this.showRecordingCard = false;
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
	private async initializeParticipantName() {
		// Apply participant name from ParticipantTokenService if set, otherwise use authenticated username
		const currentParticipantName = this.participantTokenService.getParticipantName();
		const username = await this.authService.getUsername();
		const participantName = currentParticipantName || username;

		if (participantName) {
			this.participantForm.get('name')?.setValue(participantName);
		}
	}

	async goToRecordings() {
		try {
			await this.navigationService.navigateTo(`room/${this.roomId}/recordings`, { secret: this.roomSecret });
		} catch (error) {
			console.error('Error navigating to recordings:', error);
		}
	}

	/**
	 * Handles the back button click event and navigates accordingly
	 * If in embedded mode, it closes the WebComponentManagerService
	 * If the redirect URL is set, it navigates to that URL
	 * If in standalone mode without a redirect URL, it navigates to the rooms page
	 */
	async goBack() {
		if (this.appDataService.isEmbeddedMode()) {
			this.wcManagerService.close();
		}

		const redirectTo = this.navigationService.getLeaveRedirectURL();
		if (redirectTo) {
			// Navigate to the specified redirect URL
			await this.navigationService.redirectTo(redirectTo);
			return;
		}

		if (this.appDataService.isStandaloneMode()) {
			// Navigate to rooms page
			await this.navigationService.navigateTo('/rooms');
		}
	}

	async submitAccessRoom() {
		const { valid, value } = this.participantForm;
		if (!valid || !value.name?.trim()) {
			// If the form is invalid, do not proceed
			console.warn('Participant form is invalid. Cannot access room.');
			return;
		}

		this.participantName = value.name.trim();
		this.participantTokenService.setParticipantName(this.participantName);

		try {
			await this.generateParticipantToken();
			await this.addParticipantNameToUrl();
			await this.roomService.loadPreferences(this.roomId);
			this.showRoom = true;
		} catch (error) {
			console.error('Error accessing room:', error);
		}
	}

	/**
	 * Generates a participant token for joining a video room.
	 *
	 * @throws When participant already exists in the room (status 409)
	 * @returns Promise that resolves when token is generated
	 */
	private async generateParticipantToken() {
		try {
			const { token, role } = await this.participantTokenService.generateToken({
				roomId: this.roomId,
				participantName: this.participantName,
				secret: this.roomSecret
			});
			// The components library needs the token to be set in the 'onTokenRequested' method
			this.participantToken = token;
			this.participantRole = role;
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
					// Participant already exists.
					// Show the error message in participant name input form
					this.participantForm.get('name')?.setErrors({ participantExists: true });
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
	private async addParticipantNameToUrl() {
		await this.navigationService.updateQueryParamsFromUrl(this.route.snapshot.queryParams, {
			'participant-name': this.participantName
		});
	}

	onRoomCreated(room: Room) {
		room.on(
			RoomEvent.DataReceived,
			(payload: Uint8Array, _participant?: RemoteParticipant, _kind?: DataPacket_Kind, topic?: string) => {
				const event = JSON.parse(new TextDecoder().decode(payload));
				if (topic === MeetSignalType.MEET_ROOM_PREFERENCES_UPDATED) {
					const roomPreferences: MeetRoomPreferences = event.preferences;
					this.featureConfService.setRoomPreferences(roomPreferences);
				}
			}
		);
	}

	onParticipantConnected(event: ParticipantModel) {
		const message: WebComponentOutboundEventMessage = {
			event: WebComponentEvent.JOINED,
			payload: {
				roomId: event.getProperties().room?.name || '',
				participantName: event.name!
			}
		};
		this.wcManagerService.sendMessageToParent(message);
	}

	async onParticipantLeft(event: ParticipantLeftEvent) {
		let leftReason = this.getReasonParamFromEvent(event.reason);
		if (leftReason === LeftEventReason.MEETING_ENDED && this.meetingEndedByMe) {
			leftReason = LeftEventReason.MEETING_ENDED_BY_SELF;
		}

		// Send LEFT event to the parent component
		const message: WebComponentOutboundEventMessage<WebComponentEvent.LEFT> = {
			event: WebComponentEvent.LEFT,
			payload: {
				roomId: event.roomName,
				participantName: event.participantName,
				reason: leftReason
			}
		};
		this.wcManagerService.sendMessageToParent(message);

		// Remove the moderator secret from session storage if the participant left for a reason other than browser unload
		if (event.reason !== ParticipantLeftReason.BROWSER_UNLOAD) {
			this.sessionStorageService.removeRoomSecret(event.roomName);
		}

		// Navigate to the disconnected page with the reason
		await this.navigationService.navigateTo('disconnected', { reason: leftReason });
	}

	/**
	 * Maps ParticipantLeftReason to LeftEventReason.
	 * This method translates the technical reasons for a participant leaving the room
	 * into user-friendly reasons that can be used in the UI or for logging purposes.
	 * @param reason The technical reason for the participant leaving the room.
	 * @returns The corresponding LeftEventReason.
	 */
	private getReasonParamFromEvent(reason: ParticipantLeftReason): LeftEventReason {
		const reasonMap: Record<ParticipantLeftReason, LeftEventReason> = {
			[ParticipantLeftReason.LEAVE]: LeftEventReason.VOLUNTARY_LEAVE,
			[ParticipantLeftReason.BROWSER_UNLOAD]: LeftEventReason.VOLUNTARY_LEAVE,
			[ParticipantLeftReason.NETWORK_DISCONNECT]: LeftEventReason.NETWORK_DISCONNECT,
			[ParticipantLeftReason.SIGNAL_CLOSE]: LeftEventReason.NETWORK_DISCONNECT,
			[ParticipantLeftReason.SERVER_SHUTDOWN]: LeftEventReason.SERVER_SHUTDOWN,
			[ParticipantLeftReason.PARTICIPANT_REMOVED]: LeftEventReason.PARTICIPANT_KICKED,
			[ParticipantLeftReason.ROOM_DELETED]: LeftEventReason.MEETING_ENDED,
			[ParticipantLeftReason.DUPLICATE_IDENTITY]: LeftEventReason.UNKNOWN,
			[ParticipantLeftReason.OTHER]: LeftEventReason.UNKNOWN
		};
		return reasonMap[reason] ?? LeftEventReason.UNKNOWN;
	}

	async leaveMeeting() {
		await this.openviduService.disconnectRoom();
	}

	async endMeeting() {
		if (this.participantService.isModeratorParticipant()) {
			const roomId = this.roomService.getRoomId();
			this.meetingEndedByMe = true;
			await this.meetingService.endMeeting(roomId);
		}
	}

	async forceDisconnectParticipant(participant: ParticipantModel) {
		await this.meetingService.kickParticipant(this.roomId, participant.identity);
	}

	async copyModeratorLink() {
		await this.loadRoomIfAbsent();
		this.clipboard.copy(this.room!.moderatorRoomUrl);
		this.notificationService.showSnackbar('Moderator link copied to clipboard');
	}

	async copyPublisherLink() {
		await this.loadRoomIfAbsent();
		this.clipboard.copy(this.room!.publisherRoomUrl);
		this.notificationService.showSnackbar('Publisher link copied to clipboard');
	}

	private async loadRoomIfAbsent() {
		if (!this.room) {
			this.room = await this.roomService.getRoom(this.roomId);
		}
	}

	async onRecordingStartRequested(event: RecordingStartRequestedEvent) {
		try {
			await this.recManagerService.startRecording(event.roomName);
		} catch (error) {
			console.error(error);
		}
	}

	async onRecordingStopRequested(event: RecordingStopRequestedEvent) {
		try {
			await this.recManagerService.stopRecording(event.recordingId);
		} catch (error) {
			console.error(error);
		}
	}

	async onViewRecordingsClicked(recordingId?: any) {
		if (recordingId) {
			const privateAccess = await this.authService.isUserAuthenticated();
			const { url } = await this.recordingService.generateRecordingUrl(recordingId, privateAccess);
			window.open(url, '_blank');
		} else {
			window.open(`/room/${this.roomId}/recordings?secret=${this.roomSecret}`, '_blank');
		}
	}
}
