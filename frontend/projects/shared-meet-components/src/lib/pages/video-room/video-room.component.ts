import { AsyncPipe } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import {
	ApiDirectiveModule,
	OpenViduComponentsUiModule,
	ParticipantLeftEvent,
	ParticipantLeftReason,
	ParticipantModel,
	RecordingStartRequestedEvent,
	RecordingStopRequestedEvent
} from 'openvidu-components-angular';
import { ErrorReason } from '../../models';
import {
	ApplicationFeatures,
	FeatureConfigurationService,
	NavigationService,
	ParticipantTokenService,
	RecordingManagerService,
	AuthService,
	ContextService,
	RoomService,
	SessionStorageService,
	WebComponentManagerService
} from '../../services';
import { OpenViduMeetPermissions, ParticipantRole, WebComponentEvent, OutboundEventMessage } from '../../typings/ce';

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
		AsyncPipe
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

	features$!: Observable<ApplicationFeatures>;

	constructor(
		protected route: ActivatedRoute,
		protected navigationService: NavigationService,
		protected participantTokenService: ParticipantTokenService,
		protected recManagerService: RecordingManagerService,
		protected authService: AuthService,
		protected ctxService: ContextService,
		protected roomService: RoomService,
		protected wcManagerService: WebComponentManagerService,
		protected sessionStorageService: SessionStorageService,
		protected featureConfService: FeatureConfigurationService
	) {
		this.features$ = this.featureConfService.features$;
	}

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
			await this.roomService.loadPreferences(this.roomId);
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
			const { role, permissions } = await this.participantTokenService.generateToken(
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
					await this.navigationService.redirectToErrorPage(ErrorReason.INVALID_ROOM_SECRET);
					break;
				case 404:
					// Room not found
					await this.navigationService.redirectToErrorPage(ErrorReason.INVALID_ROOM);
					break;
				case 409:
					// Participant already exists.
					// Show the error message in participant name input form
					this.participantForm.get('name')?.setErrors({ participantExists: true });
					throw new Error('Participant already exists in the room');
				default:
					await this.navigationService.redirectToErrorPage(ErrorReason.INTERNAL_ERROR);
			}
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
		this.navigationService.updateUrlQueryParams(this.route.snapshot.queryParams, {
			secret: secretQueryParam,
			'participant-name': this.participantName
		});
	}

	async goToRecordings() {
		try {
			await this.navigationService.navigateTo(`room/${this.roomId}/recordings`, {
				queryParams: { secret: this.roomSecret }
			});
		} catch (error) {
			console.error('Error navigating to recordings:', error);
		}
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
}
