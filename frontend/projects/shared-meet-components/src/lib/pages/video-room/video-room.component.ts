import { Clipboard } from '@angular/cdk/clipboard';
import { Component, OnDestroy, OnInit, Signal } from '@angular/core';
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
	ApplicationFeatures,
	AuthService,
	FeatureConfigurationService,
	NavigationService,
	ParticipantTokenService,
	RecordingManagerService,
	RoomService,
	SessionStorageService,
	WebComponentManagerService
} from '@lib/services';
import { ParticipantRole, WebComponentEvent, WebComponentOutboundEventMessage } from '@lib/typings/ce';
import {
	ApiDirectiveModule,
	OpenViduComponentsUiModule,
	OpenViduService,
	ParticipantLeftEvent,
	ParticipantLeftReason,
	ParticipantModel,
	RecordingStartRequestedEvent,
	RecordingStopRequestedEvent
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
export class VideoRoomComponent implements OnInit, OnDestroy {
	participantForm = new FormGroup({
		name: new FormControl('', [Validators.required, Validators.minLength(4)])
	});
	showRoom = false;
	showRecordingCard = false;
	roomId = '';
	roomSecret = '';
	participantName = '';
	participantToken = '';
	participantRole: ParticipantRole = ParticipantRole.PUBLISHER;

	features: Signal<ApplicationFeatures>;

	constructor(
		protected route: ActivatedRoute,
		protected navigationService: NavigationService,
		protected participantTokenService: ParticipantTokenService,
		protected recManagerService: RecordingManagerService,
		protected authService: AuthService,
		protected roomService: RoomService,
		protected openviduService: OpenViduService,
		protected participantService: ParticipantTokenService,
		protected wcManagerService: WebComponentManagerService,
		protected sessionStorageService: SessionStorageService,
		protected featureConfService: FeatureConfigurationService,
		protected clipboard: Clipboard
	) {
		this.features = this.featureConfService.features;
	}

	async ngOnInit() {
		this.roomId = this.roomService.getRoomId();
		this.roomSecret = this.roomService.getRoomSecret();

		const { recordings } = await this.recManagerService.listRecordings({
			maxItems: 1,
			roomId: this.roomId,
			fields: 'recordingId'
		});

		this.showRecordingCard = recordings.length > 0;

		await this.initializeParticipantName();
	}

	ngOnDestroy(): void {
		this.wcManagerService.stopCommandsListener();
	}

	get isAdmin(): boolean {
		return this.authService.isAdmin();
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
			await this.replaceUrlQueryParams();
			await this.roomService.loadPreferences(this.roomId);
			this.showRoom = true;
		} catch (error) {
			console.error('Error accessing room:', error);
		}
	}

	async onTokenRequested() {
		// Participant token must be set only when requested
		this.participantToken = this.participantTokenService.getParticipantToken() || '';
	}

	async leaveMeeting() {
		await this.openviduService.disconnectRoom();
	}

	async endMeeting() {
		if (this.participantService.isModeratorParticipant()) {
			const roomId = this.roomService.getRoomId();
			await this.roomService.endMeeting(roomId);
		}
	}

	async forceDisconnectParticipant(participant: ParticipantModel) {
		await this.roomService.kickParticipant(this.roomId, participant.identity);
	}

	// TODO: Improve this method for avoiding rest requests
	async copyModeratorLink() {
		const room = await this.roomService.getRoom(this.roomId);
		this.clipboard.copy(room.moderatorRoomUrl);
	}

	// TODO: Improve this method for avoiding rest requests
	async copyPublisherLink() {
		const room = await this.roomService.getRoom(this.roomId);
		this.clipboard.copy(room.publisherRoomUrl);
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

	/**
	 * Generates a participant token for joining a video room.
	 *
	 * @throws When participant already exists in the room (status 409)
	 * @returns Promise that resolves when token is generated
	 */
	private async generateParticipantToken() {
		try {
			const { /*token,*/ role } = await this.participantTokenService.generateToken({
				roomId: this.roomId,
				participantName: this.participantName,
				secret: this.roomSecret
			});
			// The components library needs the token to be set in the 'onTokenRequested' method
			// this.participantToken = token;
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

	private async replaceUrlQueryParams() {
		let secretQueryParam = this.roomSecret;

		// If participant is moderator, store the moderator secret in session storage
		// and replace the secret in the URL with the publisher secret
		if (this.participantRole === ParticipantRole.MODERATOR) {
			try {
				const { moderatorSecret, publisherSecret } = await this.roomService.getSecrets(this.roomId);
				this.sessionStorageService.setModeratorSecret(this.roomId, moderatorSecret);
				secretQueryParam = publisherSecret;
			} catch (error) {
				console.error('error', error);
			}
		}

		// Replace secret and participant name in the URL query parameters
		this.navigationService.updateQueryParamsFromUrl(this.route.snapshot.queryParams, {
			secret: secretQueryParam,
			'participant-name': this.participantName
		});
	}

	async goToRecordings() {
		try {
			await this.navigationService.navigateTo(`room/${this.roomId}/recordings`, { secret: this.roomSecret });
		} catch (error) {
			console.error('Error navigating to recordings:', error);
		}
	}

	async goBack() {
		try {
			await this.navigationService.navigateTo('rooms');
		} catch (error) {
			console.error('Error navigating back to rooms:', error);
		}
	}

	onParticipantConnected(event: ParticipantModel) {
		const message: WebComponentOutboundEventMessage = {
			event: WebComponentEvent.JOIN,
			payload: {
				roomId: event.getProperties().room?.name || '',
				participantName: event.name!
			}
		};
		this.wcManagerService.sendMessageToParent(message);
	}

	async onParticipantLeft(event: ParticipantLeftEvent) {
		console.warn('Participant left the room. Redirecting to:');
		const redirectURL = this.navigationService.getLeaveRedirectURL() || '/disconnected';
		const isExternalURL = /^https?:\/\//.test(redirectURL);
		const isRoomDeleted = event.reason === ParticipantLeftReason.ROOM_DELETED;

		let message: WebComponentOutboundEventMessage<WebComponentEvent.MEETING_ENDED | WebComponentEvent.LEFT>;

		if (isRoomDeleted) {
			message = {
				event: WebComponentEvent.MEETING_ENDED,
				payload: {
					roomId: event.roomName
				}
			} as WebComponentOutboundEventMessage<WebComponentEvent.MEETING_ENDED>;
		} else {
			message = {
				event: WebComponentEvent.LEFT,
				payload: {
					roomId: event.roomName,
					participantName: event.participantName,
					reason: event.reason
				}
			} as WebComponentOutboundEventMessage<WebComponentEvent.LEFT>;
		}

		this.wcManagerService.sendMessageToParent(message);

		if (event.reason !== ParticipantLeftReason.BROWSER_UNLOAD) {
			this.sessionStorageService.removeModeratorSecret(event.roomName);
		}

		// Add disconnect reason as query parameter if redirecting to disconnect page
		let finalRedirectURL = redirectURL;
		if (!isExternalURL && (redirectURL === '/disconnected' || redirectURL.includes('/disconnected'))) {
			const reasonParam = this.getReasonParamFromEvent(event.reason, isRoomDeleted);
			const separator = redirectURL.includes('?') ? '&' : '?';
			finalRedirectURL = `${redirectURL}${separator}reason=${encodeURIComponent(reasonParam)}`;
		}

		await this.navigationService.redirectTo(finalRedirectURL, isExternalURL);
	}

	/**
	 * Maps ParticipantLeftReason to a query parameter value
	 */
	private getReasonParamFromEvent(reason: ParticipantLeftReason, isRoomDeleted: boolean): string {
		if (isRoomDeleted) {
			return 'roomDeleted';
		}

		switch (reason) {
			default:
			case ParticipantLeftReason.LEAVE:
				return 'disconnect';
			case ParticipantLeftReason.PARTICIPANT_REMOVED:
				return 'forceDisconnectByUser';
			case ParticipantLeftReason.SERVER_SHUTDOWN:
				return 'sessionClosedByServer';
			case ParticipantLeftReason.NETWORK_DISCONNECT:
				return 'networkDisconnect';
			case ParticipantLeftReason.SIGNAL_CLOSE:
				return 'openviduDisconnect';
			case ParticipantLeftReason.BROWSER_UNLOAD:
				return 'browserClosed';
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
}
