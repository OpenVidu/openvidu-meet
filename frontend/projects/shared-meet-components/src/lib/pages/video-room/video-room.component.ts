import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import {
	RecordingDeleteRequestedEvent,
	RecordingStartRequestedEvent,
	RecordingStopRequestedEvent,
	ApiDirectiveModule,
	ParticipantLeftEvent,
	ParticipantModel,
	OpenViduComponentsUiModule
} from 'openvidu-components-angular';

import { ChatPreferences, RecordingPreferences, VirtualBackgroundPreferences } from '@lib/typings/ce';

import { HttpService, WebComponentManagerService, ContextService, RoomService } from '../../services';
import { OpenViduMeetMessage, WebComponentEventType } from 'webcomponent/src/types/message.type';

@Component({
	selector: 'app-video-room',
	templateUrl: './video-room.component.html',
	styleUrls: ['./video-room.component.scss'],
	standalone: true,
	imports: [OpenViduComponentsUiModule, ApiDirectiveModule, MatIcon]
})
export class VideoRoomComponent implements OnInit, OnDestroy {
	roomName = '';
	participantName = '';
	token = '';
	serverError = '';
	loading = true;
	chatPreferences: ChatPreferences = { enabled: true };
	recordingPreferences: RecordingPreferences = { enabled: true };
	virtualBackgroundPreferences: VirtualBackgroundPreferences = { enabled: true };

	featureFlags = {
		videoEnabled: true,
		audioEnabled: true,
		showMicrophone: true,
		showCamera: true,
		showScreenShare: true,
		showActivityPanel: true,
		showPrejoin: true,
		showChat: true,
		showRecording: true,
		showBackgrounds: true
	};

	constructor(
		protected httpService: HttpService,
		protected router: Router,
		protected ctxService: ContextService,
		protected roomService: RoomService,
		protected wcManagerService: WebComponentManagerService,
		protected cdr: ChangeDetectorRef
	) {}

	async ngOnInit() {
		try {
			this.roomName = this.ctxService.getRoomName();
			this.participantName = this.ctxService.getParticipantName();

			if (this.ctxService.isEmbeddedMode()) {
				this.featureFlags.showPrejoin = false;
			}

			// TODO: Apply room preferences from saved room using context service
			// await this.loadRoomPreferences();

			// TODO: Extract permissions from token and apply them to the component
			this.applyParticipantPermissions();
			if (this.ctxService.isViewerParticipant()) {
				this.featureFlags.videoEnabled = false;
				this.featureFlags.audioEnabled = false;
				this.featureFlags.showMicrophone = false;
				this.featureFlags.showCamera = false;
				this.featureFlags.showScreenShare = false;
			}
		} catch (error: any) {
			console.error('Error fetching room preferences', error);
			this.serverError = error.error.message || error.message || error.error;
		}
		this.loading = false;
	}

	ngOnDestroy(): void {
		// Clean up the context service
		// this.contextService.clearContext();
		this.wcManagerService.stopCommandsListener();
	}

	async onTokenRequested(participantName: string) {
		try {
			if (this.ctxService.isStandaloneMode()) {
				// As token is not provided, we need to set the participant name from
				// ov-videoconference event
				this.ctxService.setParticipantName(participantName);
			}

			this.token = this.ctxService.getToken();
		} catch (error: any) {
			console.error(error);
			this.serverError = error.error;
		}

		this.loading = false;
		this.cdr.detectChanges();
	}

	onParticipantConnected(event: ParticipantModel) {
		const message: OpenViduMeetMessage = {
			eventType: WebComponentEventType.LOCAL_PARTICIPANT_CONNECTED,
			payload: {
				roomName: event.getProperties().room?.name,
				participantName: event.name
			}
		};
		this.wcManagerService.sendMessageToParent(message);
	}

	onParticipantLeft(event: ParticipantLeftEvent) {
		console.warn('Participant left the room. Redirecting to:');
		const redirectURL = this.ctxService.getLeaveRedirectURL() || '/disconnected';
		const isExternalURL = /^https?:\/\//.test(redirectURL);

		const message: OpenViduMeetMessage = {
			eventType: WebComponentEventType.LOCAL_PARTICIPANT_LEFT,
			payload: {
				roomName: event.roomName,
				participantName: event.participantName
			}
		};
		this.wcManagerService.sendMessageToParent(message);

		//if (this.contextService.isEmbeddedMode()) this.sendMessageToParent(event);
		this.redirectTo(redirectURL, isExternalURL);
	}

	async onRecordingStartRequested(event: RecordingStartRequestedEvent) {
		try {
			const { roomName } = event;
			await this.httpService.startRecording(roomName);
		} catch (error) {
			console.error(error);
		}
	}

	async onRecordingStopRequested(event: RecordingStopRequestedEvent) {
		try {
			const { recordingId } = event;

			if (!recordingId) throw new Error('Recording ID not found when stopping recording');

			await this.httpService.stopRecording(recordingId);
		} catch (error) {
			console.error(error);
		}
	}

	async onRecordingDeleteRequested(event: RecordingDeleteRequestedEvent) {
		try {
			const { recordingId } = event;

			if (!recordingId) throw new Error('Recording ID not found when deleting recording');

			await this.httpService.deleteRecording(recordingId);
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
		const preferences = await this.roomService.getRoomPreferences();
		// Assign the preferences to the component
		Object.assign(this, preferences);

		this.featureFlags.showChat = this.chatPreferences.enabled;
		this.featureFlags.showRecording = this.recordingPreferences.enabled;
		this.featureFlags.showActivityPanel = this.recordingPreferences.enabled;
		this.featureFlags.showBackgrounds = this.virtualBackgroundPreferences.enabled;
	}

	/**
	 * Configures the feature flags based on the token permissions.
	 *
	 * This method checks the token permissions and sets the feature flags accordingly.
	 */
	private applyParticipantPermissions() {
		if (this.featureFlags.showChat) {
			this.featureFlags.showChat = this.ctxService.canChat();
		}
		if (this.featureFlags.showRecording) {
			this.featureFlags.showRecording = this.ctxService.canRecord();
		}
	}

	private redirectTo(url: string, isExternal: boolean) {
		if (isExternal) {
			console.log('Redirecting to external URL:', url);
			window.location.href = url;
		} else {
			console.log('Redirecting to internal route:', url);
			this.router.navigate([url], { replaceUrl: true });
		}
	}
}
