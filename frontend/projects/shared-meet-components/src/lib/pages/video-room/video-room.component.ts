// import { Location } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute } from '@angular/router';
import { MeetRecordingAccess, MeetRoomPreferences, OpenViduMeetPermissions, ParticipantRole } from '@lib/typings/ce';
import {
	ApiDirectiveModule,
	OpenViduComponentsUiModule,
	ParticipantLeftEvent,
	ParticipantLeftReason,
	ParticipantModel,
	RecordingStartRequestedEvent,
	RecordingStopRequestedEvent
} from 'openvidu-components-angular';
import { WebComponentEvent } from 'webcomponent/src/models/event.model';
import { OutboundEventMessage } from 'webcomponent/src/models/message.type';
import {
	AuthService,
	ContextService,
	HttpService,
	RoomService,
	SessionStorageService,
	WebComponentManagerService
} from '../../services';
import { ParticipantTokenService } from '@lib/services/participant-token/participant-token.service';
import { RecordingManagerService } from '@lib/services/recording-manager/recording-manager.service';
import { NavigationService } from '@lib/services/navigation/navigation.service';

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
		MatButtonModule
	]
})
export class VideoRoomComponent implements OnInit, OnDestroy {
	participantForm = new FormGroup({
		name: new FormControl('', [Validators.required, Validators.minLength(4)])
	});
	showRoom = false;

	roomId = '';
	roomSecret = '';
	participantName = '';
	participantToken = '';
	participantRole: ParticipantRole = ParticipantRole.PUBLISHER;
	participantPermissions: OpenViduMeetPermissions = {
		canRecord: false,
		canChat: false,
		canChangeVirtualBackground: false,
		canPublishScreen: false
	};

	roomPreferences: MeetRoomPreferences = {
		recordingPreferences: {
			enabled: true,
			allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_PUBLISHER
		},
		chatPreferences: { enabled: true },
		virtualBackgroundPreferences: { enabled: true }
	};
	featureFlags = {
		videoEnabled: true,
		audioEnabled: true,
		showMicrophone: true,
		showCamera: true,
		showScreenShare: true,
		showPrejoin: true,
		showChat: true,
		showRecording: true,
		showBackgrounds: true
	};

	constructor(
		protected httpService: HttpService,
		protected navigationService: NavigationService,
		protected participantTokenService: ParticipantTokenService,
		protected recManagerService: RecordingManagerService,
		protected route: ActivatedRoute,
		protected authService: AuthService,
		protected ctxService: ContextService,
		protected roomService: RoomService,
		protected wcManagerService: WebComponentManagerService,
		protected sessionStorageService: SessionStorageService
	) {}

	async ngOnInit() {
		this.roomId = this.ctxService.getRoomId();
		const secret = this.ctxService.getSecret();
		const storageSecret = this.sessionStorageService.getModeratorSecret(this.roomId);
		this.roomSecret = storageSecret || secret;

		await this.initializeParticipantName();
	}

	ngOnDestroy(): void {
		this.wcManagerService.stopCommandsListener();
	}

	async submitAccessRoom() {
		const { valid, value } = this.participantForm;
		if (!valid || !value.name?.trim()) {
			// If the form is invalid, do not proceed
			console.warn('Participant form is invalid. Cannot access room.');
			return;
		}

		this.participantName = value.name.trim();

		try {
			await this.generateParticipantToken();
			await this.replaceUrlQueryParams();
			await this.loadRoomPreferences();
			this.showRoom = true;
		} catch (error) {
			console.error('Error accessing room:', error);
		}
	}

	async onTokenRequested() {
		// Participant token must be set only when requested
		this.participantToken = this.ctxService.getParticipantToken();
	}

	/**
	 * Initializes the participant name in the form control.
	 *
	 * Retrieves the participant name from the context service first, and if not available,
	 * falls back to the authenticated username. Sets the retrieved name value in the
	 * participant form's 'name' control if a valid name is found.
	 *
	 * @private
	 * @async
	 * @returns {Promise<void>} A promise that resolves when the participant name has been initialized
	 */
	private async initializeParticipantName() {
		// Apply participant name from context if set, otherwise use authenticated username
		const contextParticipantName = this.ctxService.getParticipantName();
		const username = await this.authService.getUsername();
		const participantName = contextParticipantName || username;

		if (participantName) {
			this.participantForm.get('name')?.setValue(participantName);
		}
	}

	/**
	 * Generates a participant token for joining a video room.
	 *
	 * @throws {Error} When participant already exists in the room (status 409)
	 * @returns {Promise<void>} Promise that resolves when token is generated and set, or rejects on participant conflict
	 */
	private async generateParticipantToken() {
		try {
			const { token, role, permissions } = await this.participantTokenService.generateToken(
				this.roomId,
				this.participantName,
				this.roomSecret
			);
			// The components library needs the token to be set in the 'onTokenRequested' method
			// this.participantToken = token;
			this.participantRole = role;
			this.participantPermissions = permissions;
		} catch (error: any) {
			console.error('Error generating participant token:', error);
			switch (error.status) {
				case 400:
					// Invalid secret
					await this.navigationService.redirectToErrorPage('invalid-secret');
					break;
				case 404:
					// Room not found
					await this.navigationService.redirectToErrorPage('invalid-room');
					break;
				case 409:
					// Participant already exists.
					// Show the error message in participant name input form
					this.participantForm.get('name')?.setErrors({ participantExists: true });
					throw new Error('Participant already exists in the room');
				default:
					await this.navigationService.redirectToErrorPage('internal-error');
			}
		}
	}

	private async replaceUrlQueryParams() {
		let secretQueryParam = this.roomSecret;

		// If participant is moderator, store the moderator secret in session storage
		// and replace the secret in the URL with the publisher secret
		if (this.participantRole === ParticipantRole.MODERATOR) {
			try {
				const { moderatorSecret, publisherSecret } = await this.getRoomSecrets();
				this.sessionStorageService.setModeratorSecret(this.roomId, moderatorSecret);
				secretQueryParam = publisherSecret;
			} catch (error) {
				console.error('error', error);
			}
		}

		// Replace secret and participant name in the URL query parameters
		this.navigationService.updateUrlQueryParams(this.route, {
			secret: secretQueryParam,
			'participant-name': this.participantName
		});
	}

	private async getRoomSecrets(): Promise<{ moderatorSecret: string; publisherSecret: string }> {
		const { moderatorRoomUrl, publisherRoomUrl } = await this.httpService.getRoom(this.roomId);

		const publisherUrl = new URL(publisherRoomUrl);
		const publisherSecret = publisherUrl.searchParams.get('secret') || '';
		const moderatorUrl = new URL(moderatorRoomUrl);
		const moderatorSecret = moderatorUrl.searchParams.get('secret') || '';
		return { publisherSecret, moderatorSecret };
	}

	async goToRecordings() {
		await this.navigationService.goToRecordings(this.roomId, this.roomSecret);
	}

	onParticipantConnected(event: ParticipantModel) {
		const message: OutboundEventMessage = {
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
		const redirectURL = this.ctxService.getLeaveRedirectURL() || '/disconnected';
		const isExternalURL = /^https?:\/\//.test(redirectURL);
		const isRoomDeleted = event.reason === ParticipantLeftReason.ROOM_DELETED;

		let message: OutboundEventMessage<WebComponentEvent.MEETING_ENDED | WebComponentEvent.LEFT>;

		if (isRoomDeleted) {
			message = {
				event: WebComponentEvent.MEETING_ENDED,
				payload: {
					roomId: event.roomName
				}
			} as OutboundEventMessage<WebComponentEvent.MEETING_ENDED>;
		} else {
			message = {
				event: WebComponentEvent.LEFT,
				payload: {
					roomId: event.roomName,
					participantName: event.participantName,
					reason: event.reason
				}
			} as OutboundEventMessage<WebComponentEvent.LEFT>;
		}

		this.wcManagerService.sendMessageToParent(message);

		if (event.reason !== ParticipantLeftReason.BROWSER_UNLOAD) {
			this.sessionStorageService.removeModeratorSecret(event.roomName);
		}

		await this.navigationService.redirectTo(redirectURL, isExternalURL);
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

	/**
	 * Loads the room preferences from the global preferences service and assigns them to the component.
	 *
	 * This method fetches the room preferences asynchronously and updates the component's properties
	 * based on the fetched preferences. It also updates the UI flags to show or hide certain features
	 * like chat, recording, and activity panel based on the preferences.
	 *
	 * @returns {Promise<void>} A promise that resolves when the room preferences have been loaded and applied.
	 */
	private async loadRoomPreferences() {
		try {
			this.roomPreferences = await this.roomService.getRoomPreferences();
		} catch (error) {
			console.error('Error loading room preferences:', error);
		}

		this.featureFlags.showChat = this.roomPreferences.chatPreferences.enabled;
		this.featureFlags.showRecording = this.roomPreferences.recordingPreferences.enabled;
		this.featureFlags.showBackgrounds = this.roomPreferences.virtualBackgroundPreferences.enabled;
	}

	/**
	 * Configures the feature flags based on participant permissions.
	 */
	private applyParticipantPermissions() {
		if (this.featureFlags.showChat) {
			this.featureFlags.showChat = this.participantPermissions.canChat;
		}
		if (this.featureFlags.showRecording) {
			this.featureFlags.showRecording = this.participantPermissions.canRecord;
		}
	}
}
