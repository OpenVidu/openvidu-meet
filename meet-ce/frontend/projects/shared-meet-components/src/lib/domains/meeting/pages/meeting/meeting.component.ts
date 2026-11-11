import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, contentChild, effect, inject, OnInit, untracked, OnDestroy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
import { SoundService } from '../../../../shared/services/sound.service';
import { EmbeddedCommandService } from '../../../embedded/services/embedded-command.service';
import { IframeBridgeService } from '../../../embedded/services/iframe-bridge.service';
import { MeetingJoinComponent } from '../../components/meeting-join/meeting-join.component';
import { ShareRoomAccessLinkComponent } from '../../components/share-room-access-link/share-room-access-link.component';
import { MeetingParticipantItemComponent } from '../../customization/meeting-participant-item/meeting-participant-item.component';
import { MeetingRaisedHandsStripComponent } from '../../customization/meeting-raised-hands-strip/meeting-raised-hands-strip.component';
import {
	BroadcastStateService,
	MeetingThemeMode,
	MeetingThemeService,
	OpenViduComponentsUiModule,
	Room,
	ToolbarAdditionalButtonsPosition
} from '../../openvidu-components';
import { MeetingCaptionsService } from '../../services/meeting-captions.service';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingStateService } from '../../services/meeting-state.service';
import { JoinTokenService } from '../../services/join-token.service';
import { MeetingEntryFlowService } from '../../services/meeting-entry-flow.service';
import { MeetingEventHandlerService } from '../../services/meeting-event-handler.service';
import { MeetingJoinService } from '../../services/meeting-join.service';
import { MeetingShortcutsService } from '../../services/meeting-shortcuts.service';
import { WebSocketService } from '../../services/websocket.service';

@Component({
	selector: 'ov-meeting',
	templateUrl: './meeting.component.html',
	styleUrls: ['./meeting.component.scss'],
	imports: [
		OpenViduComponentsUiModule,
		NgTemplateOutlet,
		MatIconModule,
		MatProgressSpinnerModule,
		MeetingJoinComponent,
		MeetingRaisedHandsStripComponent,
		ShareRoomAccessLinkComponent
	],
	providers: [MeetingJoinService, MeetingEntryFlowService, MeetingEventHandlerService, MeetingShortcutsService]
})
export class MeetingComponent implements OnInit, OnDestroy {
	protected meetingContextService = inject(MeetingContextService);
	protected meetingStateService = inject(MeetingStateService);
	protected joinService = inject(MeetingJoinService);
	protected entryFlow = inject(MeetingEntryFlowService);
	private readonly joinToken = inject(JoinTokenService);
	protected eventHandlerService = inject(MeetingEventHandlerService);
	protected captionsService = inject(MeetingCaptionsService);
	protected meetingThemeService = inject(MeetingThemeService);
	protected navigationService = inject(NavigationService);
	protected notificationService = inject(NotificationService);
	protected soundService = inject(SoundService);
	private readonly broadcastState = inject(BroadcastStateService);
	private readonly webSocket = inject(WebSocketService);
	private readonly isEmbeddedMode = inject(RuntimeConfigService).isEmbeddedMode;

	/** Embedded, where the host app shares the link, the participants panel says others will appear. */
	protected readonly showInviteWithoutLink = computed(
		() => this.isEmbeddedMode() && this.meetingStateService.isAlone()
	);

	// Template reference for custom participant panel item
	protected participantItem = contentChild.required(MeetingParticipantItemComponent);
	protected participantItemTemplate = computed(() => this.participantItem().template());

	// Signals for meeting context data
	roomName = this.joinService.roomName;
	e2eeKey = this.joinService.e2eeKeyValue;
	features = this.meetingContextService.meetingUI;
	initialMediaState = this.meetingContextService.initialMediaState;
	hasRecordings = this.meetingContextService.hasRecordings;
	/**
	 * Whoever may go live gets the activity; everyone else gets it while the meeting is live, so
	 * nobody is streamed without being able to see where.
	 */
	showBroadcastActivity = computed(() => this.features().showBroadcastControls || this.broadcastState.isInProgress());

	protected readonly extraButtonsPosition = ToolbarAdditionalButtonsPosition.BEFORE_MENU;

	/** Handed to the meeting view, which calls it when the participant commits to joining. */
	protected readonly requestJoinToken = () => this.joinToken.request(this.joinService.joinRequest());

	constructor() {
		inject(IframeBridgeService).attachCommands(inject(EmbeddedCommandService));

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
					this.meetingThemeService.setTheme(theme!.baseTheme as unknown as MeetingThemeMode, false);
					this.meetingThemeService.updateThemeVariables({
						'--ov-primary-action-color': theme?.primaryColor,
						'--ov-secondary-action-color': theme?.secondaryColor,
						'--ov-accent-action-color': theme?.accentColor,
						'--ov-background-color': theme?.backgroundColor,
						'--ov-surface-color': theme?.surfaceColor
					});
				} else {
					this.meetingThemeService.resetThemeVariables();
				}
			});
		});
	}

	async ngOnInit() {
		await this.entryFlow.start();
	}

	ngOnDestroy() {
		// Cleanup captions service
		this.captionsService.destroy();
		this.webSocket.disconnect();
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

	onParticipantLeft(event: any): void {
		this.entryFlow.left();
		this.eventHandlerService.onParticipantLeft(event);
	}
}
