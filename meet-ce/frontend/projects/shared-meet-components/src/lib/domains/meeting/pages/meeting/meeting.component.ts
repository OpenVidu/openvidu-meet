import { NgTemplateOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	contentChild,
	effect,
	inject,
	OnInit,
	signal,
	untracked
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
import { SoundService } from '../../../../shared/services/sound.service';
import { MeetingLobbyComponent } from '../../components/meeting-lobby/meeting-lobby.component';
import { MeetingParticipantItemComponent } from '../../customization/meeting-participant-item/meeting-participant-item.component';
import { OpenViduComponentsUiModule, OpenViduThemeMode, OpenViduThemeService, Room } from '../../openvidu-components';
import { MeetingCaptionsService } from '../../services/meeting-captions.service';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingStateService } from '../../services/meeting-state.service';
import { MeetingEventHandlerService } from '../../services/meeting-event-handler.service';
import { MeetingLobbyService } from '../../services/meeting-lobby.service';

@Component({
	selector: 'ov-meeting',
	templateUrl: './meeting.component.html',
	styleUrls: ['./meeting.component.scss'],
	imports: [
		OpenViduComponentsUiModule,
		NgTemplateOutlet,
		MatIconModule,
		MatProgressSpinnerModule,
		MeetingLobbyComponent
	],
	providers: [MeetingLobbyService, MeetingEventHandlerService, SoundService],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeetingComponent implements OnInit {
	protected meetingContextService = inject(MeetingContextService);
	protected meetingStateService = inject(MeetingStateService);
	protected lobbyService = inject(MeetingLobbyService);
	protected eventHandlerService = inject(MeetingEventHandlerService);
	protected captionsService = inject(MeetingCaptionsService);
	protected ovThemeService = inject(OpenViduThemeService);
	protected navigationService = inject(NavigationService);
	protected notificationService = inject(NotificationService);
	protected soundService = inject(SoundService);
	private readonly runtimeConfigService = inject(RuntimeConfigService);
	private readonly translateService = inject(TranslateService);

	// Template reference for custom participant panel item
	protected participantItem = contentChild.required(MeetingParticipantItemComponent);
	protected participantItemTemplate = computed(() => this.participantItem().template());

	/** Controls whether to show lobby (true) or meeting view (false) */
	showLobby = computed(() => !this.roomMemberToken());
	lobbyState = signal<'loading' | 'ready' | 'error'>('loading');

	/** Controls whether to show the videoconference component */
	isMeetingLeft = signal(false);

	/**
	 * Whether the app runs embedded in a host application (webcomponent or iframe).
	 */
	isEmbeddedMode = this.runtimeConfigService.isEmbeddedMode;

	/**
	 * Whether the local participant is alone (no remote participants yet).
	 * The panel after the local participant — the share/copy link panel (standalone SPA)
	 * or the waiting panel (embedded) — is only shown while alone.
	 */
	isAlone = this.meetingStateService.isAlone;

	// Signals for meeting context data
	roomName = this.lobbyService.roomName;
	roomMemberToken = this.lobbyService.roomMemberToken;
	e2eeKey = this.lobbyService.e2eeKeyValue;
	features = this.meetingContextService.meetingUI;
	hasRecordings = this.meetingContextService.hasRecordings;

	constructor() {
		// Change theme variables when custom theme is enabled.
		// Only `meetingAppearance()` should be a dependency of this effect. The theme service
		// mutators below both read and write their own internal signals (`currentTheme`,
		// `currentVariables`); running them inside the reactive context would register those
		// signals as dependencies and the subsequent writes would re-trigger this effect in an
		// infinite loop (pegging the main thread). Wrap the side effects in `untracked`.
		effect(() => {
			const { themes } = this.meetingContextService.meetingAppearance();
			const hasTheme = themes.length > 0 && themes[0].enabled;
			untracked(() => {
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
				title: this.translateService.translate('MEETING_PAGE.INIT_ERROR_TITLE'),
				message: this.translateService.translate('MEETING_PAGE.INIT_ERROR_MESSAGE'),
				showCancelButton: false,
				confirmText: this.translateService.translate('MEETING_PAGE.INIT_ERROR_CONFIRM')
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
		this.meetingStateService.setLkRoom(lkRoom);

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

		this.navigationService.openInNewTab(`/room/${roomId}/recordings`, this.meetingContextService.roomSecret());
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
