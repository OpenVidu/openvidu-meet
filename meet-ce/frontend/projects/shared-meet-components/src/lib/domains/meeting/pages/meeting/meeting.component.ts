import { CommonModule } from '@angular/common';
import { Component, computed, ContentChild, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { OpenViduComponentsUiModule, OpenViduThemeMode, OpenViduThemeService, Room } from 'openvidu-components-angular';
import { Subject } from 'rxjs';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
import { SoundService } from '../../../../shared/services/sound.service';
import { MeetingLobbyComponent } from '../../components/meeting-lobby/meeting-lobby.component';
import { MeetingParticipantItemComponent } from '../../customization/meeting-participant-item/meeting-participant-item.component';
import { MeetingCaptionsService } from '../../services/meeting-captions.service';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingEventHandlerService } from '../../services/meeting-event-handler.service';
import { MeetingLobbyService } from '../../services/meeting-lobby.service';

@Component({
	selector: 'ov-meeting',
	templateUrl: './meeting.component.html',
	styleUrls: ['./meeting.component.scss'],
	imports: [
		OpenViduComponentsUiModule,
		CommonModule,
		FormsModule,
		ReactiveFormsModule,
		MatIconModule,
		MatProgressSpinnerModule,
		MeetingLobbyComponent
	],
	providers: [MeetingLobbyService, MeetingEventHandlerService, SoundService]
})
export class MeetingComponent implements OnInit {
	protected meetingContextService = inject(MeetingContextService);
	protected lobbyService = inject(MeetingLobbyService);
	protected eventHandlerService = inject(MeetingEventHandlerService);
	protected captionsService = inject(MeetingCaptionsService);
	protected ovThemeService = inject(OpenViduThemeService);
	protected notificationService = inject(NotificationService);
	protected soundService = inject(SoundService);
	protected runtimeConfigService = inject(RuntimeConfigService);

	// Template reference for custom participant panel item
	@ContentChild(MeetingParticipantItemComponent)
	set participantItem(value: MeetingParticipantItemComponent | undefined) {
		// Store the reference to the custom participant panel item component
		this._participantItem = value;
	}
	protected _participantItem?: MeetingParticipantItemComponent;
	protected participantItemTemplate = computed(() => this._participantItem?.template);

	/** Controls whether to show lobby (true) or meeting view (false) */
	showLobby = true;
	isLobbyReady = false;

	/** Controls whether to show the videoconference component */
	isMeetingLeft = signal(false);

	// Signals for meeting context data
	roomName = this.lobbyService.roomName;
	roomMemberToken = this.lobbyService.roomMemberToken;
	e2eeKey = this.lobbyService.e2eeKeyValue;
	localParticipant = this.meetingContextService.localParticipant;
	features = this.meetingContextService.meetingUI;
	hasRecordings = this.meetingContextService.hasRecordings;

	protected destroy$ = new Subject<void>();

	constructor() {
		// Change theme variables when custom theme is enabled
		effect(() => {
			const { themes } = this.meetingContextService.meetingAppearance();
			const hasTheme = themes.length > 0 && themes[0].enabled;
			if (hasTheme) {
				const theme = themes[0];
				this.ovThemeService.setTheme(theme!.baseTheme as unknown as OpenViduThemeMode);
				this.ovThemeService.updateThemeVariables({
					'--ov-primary-action-color': theme?.primaryColor,
					'--ov-secondary-action-color': theme?.secondaryColor,
					'--ov-accent-action-color': theme?.accentColor,
					'--ov-background-color': theme?.backgroundColor,
					'--ov-surface-color': theme?.surfaceColor
				});
			} else {
				this.ovThemeService.resetThemeVariables();
			}
		});

		// Observe lobby state changes reactively
		// When roomMemberToken is set, transition from lobby to meeting
		effect(async () => {
			const token = this.roomMemberToken();
			if (token && this.showLobby) {
				this.showLobby = false;
			}
		});
	}

	async ngOnInit() {
		try {
			await this.lobbyService.initialize();
			this.isLobbyReady = true;
		} catch (error) {
			console.error('Error initializing lobby state:', error);
			this.notificationService.showDialog({
				title: 'Error',
				message: 'An error occurred while initializing the meeting lobby. Please try again later.',
				showCancelButton: false,
				confirmText: 'OK'
			});
		}
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();

		// Cleanup captions service
		this.captionsService.destroy();
	}

	onRoomCreated(lkRoom: Room) {
		// At this point, user has joined the meeting and MeetingContextService becomes the Single Source of Truth
		// Store LiveKit room in context
		this.meetingContextService.setLkRoom(lkRoom);

		// Initialize captions service
		this.captionsService.initialize(lkRoom, {
			maxVisibleCaptions: 3,
			finalCaptionDuration: 5000,
			interimCaptionDuration: 3000,
			showInterimTranscriptions: true
		});

		// Setup LK room event listeners
		this.eventHandlerService.setupRoomListeners(lkRoom);
	}

	async onViewRecordingsClicked() {
		const basePath = this.runtimeConfigService.basePath;
		const basePathForUrl = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

		const roomId = this.meetingContextService.roomId();
		let recordingsUrl = `${basePathForUrl}/room/${roomId}/recordings`;

		// Append room secret as query param if it exists
		const secret = this.meetingContextService.roomSecret();
		if (secret) {
			recordingsUrl += `?secret=${secret}`;
		}

		window.open(recordingsUrl, '_blank');
	}

	onParticipantConnected(event: any): void {
		// Play joined sound
		this.soundService.playParticipantJoinedSound();
		this.eventHandlerService.onParticipantConnected(event);
	}

	/**
	 * Handles the participant left event and hides the videoconference component
	 */
	onParticipantLeft(event: any): void {
		this.isMeetingLeft.set(true);
		this.eventHandlerService.onParticipantLeft(event);
	}
}
