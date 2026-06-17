import { NgTemplateOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	contentChild,
	effect,
	inject,
	OnInit,
	signal
} from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
	ACCESS_TOKEN_QUERY_PARAM,
	REFRESH_TOKEN_QUERY_PARAM
} from '../../../../shared/guards/store-tokens-from-query-params.guard';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
import { SoundService } from '../../../../shared/services/sound.service';
import { TokenStorageService } from '../../../../shared/services/token-storage.service';
import { MeetingLobbyComponent } from '../../components/meeting-lobby/meeting-lobby.component';
import { MeetingParticipantItemComponent } from '../../customization/meeting-participant-item/meeting-participant-item.component';
import { OpenViduComponentsUiModule, OpenViduThemeMode, OpenViduThemeService, Room } from '../../openvidu-components';
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
		NgTemplateOutlet,
		FormsModule,
		ReactiveFormsModule,
		MatIconModule,
		MatProgressSpinnerModule,
		MeetingLobbyComponent
	],
	providers: [MeetingLobbyService, MeetingEventHandlerService, SoundService],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeetingComponent implements OnInit {
	protected meetingContextService = inject(MeetingContextService);
	protected lobbyService = inject(MeetingLobbyService);
	protected eventHandlerService = inject(MeetingEventHandlerService);
	protected captionsService = inject(MeetingCaptionsService);
	protected ovThemeService = inject(OpenViduThemeService);
	protected navigationService = inject(NavigationService);
	protected notificationService = inject(NotificationService);
	protected soundService = inject(SoundService);
	private readonly runtimeConfigService = inject(RuntimeConfigService);
	private readonly tokenStorageService = inject(TokenStorageService);

	// Template reference for custom participant panel item
	protected participantItem = contentChild.required(MeetingParticipantItemComponent);
	protected participantItemTemplate = computed(() => this.participantItem().template());

	/** Controls whether to show lobby (true) or meeting view (false) */
	showLobby = computed(() => !this.roomMemberToken());
	lobbyState = signal<'loading' | 'ready' | 'error'>('loading');

	/** Controls whether to show the videoconference component */
	isMeetingLeft = signal(false);

	/**
	 * Whether the app runs embedded as a webcomponent.
	 */
	isWebcomponentMode = this.runtimeConfigService.isWebcomponentMode;

	/**
	 * Whether the local participant is alone (no remote participants yet).
	 * The panel after the local participant — the share/copy link panel (SPA) or
	 * the waiting panel (webcomponent) — is only shown while alone.
	 */
	isAlone = this.meetingContextService.isAlone;

	// Signals for meeting context data
	roomName = this.lobbyService.roomName;
	roomMemberToken = this.lobbyService.roomMemberToken;
	e2eeKey = this.lobbyService.e2eeKeyValue;
	features = this.meetingContextService.meetingUI;
	hasRecordings = this.meetingContextService.hasRecordings;

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
	}

	async ngOnInit() {
		try {
			this.lobbyState.set('loading');
			await this.lobbyService.initialize();
			this.lobbyState.set('ready');
		} catch (error) {
			console.error('Error initializing lobby state:', error);
			this.lobbyState.set('error');
			this.notificationService.showDialog({
				title: 'Error',
				message: 'An error occurred while initializing the meeting lobby. Please try again later.',
				showCancelButton: false,
				confirmText: 'OK'
			});
		}
	}

	ngOnDestroy() {
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

	onViewRecordingsClicked(): void {
		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			return;
		}

		this.openRecordingsInNewTab(roomId);
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

	private openRecordingsInNewTab(roomId: string): void {
		// Prefix the configured app base path, just like the SPA.
		let path = this.navigationService.addBasePath(`/room/${roomId}/recordings`);
		let url = path;
		const isWebcomponentMode = this.runtimeConfigService.isWebcomponentMode();

		if (isWebcomponentMode) {
			// In webcomponent mode the recordings tab is served by the Meet server on a
			// different origin than the embedding page, so it shares no storage/context
			// with the meeting.
			// To allow the recordings page to authenticate the user, we forward the
			// room secret and any access/refresh tokens as query params.
			const queryParams = new URLSearchParams();

			const secret = this.meetingContextService.roomSecret();
			if (secret) {
				queryParams.set('secret', secret);
			}

			const accessToken = this.tokenStorageService.getAccessToken();
			if (accessToken) {
				queryParams.set(ACCESS_TOKEN_QUERY_PARAM, accessToken);
			}

			const refreshToken = this.tokenStorageService.getRefreshToken();
			if (refreshToken) {
				queryParams.set(REFRESH_TOKEN_QUERY_PARAM, refreshToken);
			}

			const queryString = queryParams.toString();
			if (queryString) {
				path += `?${queryString}`;
			}
			url = this.runtimeConfigService.resolveUrl(path);
		}

		window.open(url, '_blank');
	}
}
