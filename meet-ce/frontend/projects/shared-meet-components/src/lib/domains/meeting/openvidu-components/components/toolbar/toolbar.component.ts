import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
	AfterViewInit,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	OnDestroy,
	OnInit,
	output,
	signal,
	viewChild,
	WritableSignal
} from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuTrigger } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { fromEvent } from 'rxjs';
import { FallbackLogoDirective } from '../../directives/api/internals.directive';
import { ToolbarMoreOptionsAdditionalMenuItemsDirective } from '../../directives/template/internals.directive';
import { ChatMessage } from '../../models/chat.model';
import { PanelType } from '../../models/panel.model';
import { ParticipantLeftEvent, ParticipantLeftReason } from '../../models/participant.model';
import {
	RecordingStartRequestedEvent,
	RecordingState,
	RecordingStopRequestedEvent
} from '../../models/recording.model';
import { ActionService } from '../../services/action/action.service';
import { CdkOverlayService } from '../../services/cdk-overlay/cdk-overlay.service';
import { ChatService } from '../../services/chat/chat.service';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';
import { DeviceService } from '../../services/device/device.service';
import { DocumentService } from '../../services/document/document.service';
import { Room } from '../../services/livekit';
import { MeetingLiveKitService } from '../../services/meeting-livekit/meeting-livekit.service';
import { PanelService } from '../../services/panel/panel.service';
import { LocalMediaControlService } from '../../services/local-media-control/local-media-control.service';
import { LocalMediaStateService } from '../../services/local-media-state/local-media-state.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { PlatformService } from '../../services/platform/platform.service';
import { RecordingService } from '../../services/recording/recording.service';
import { TemplateRegistryService } from '../../services/template/template-registry.service';
import { MeetingTranslateService } from '../../services/translate/meeting-translate.service';
import { ToolbarMediaButtonsComponent } from './toolbar-media-buttons/toolbar-media-buttons.component';
import { ToolbarPanelButtonsComponent } from './toolbar-panel-buttons/toolbar-panel-buttons.component';
import { LoggerService } from '../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../shared/models/logger.model';

/**
 * The **ToolbarComponent** is hosted inside of the {@link MeetingViewComponent}.
 * It is in charge of displaying the participants controlls for handling the media, panels and more videoconference features.
 */
@Component({
	selector: 'ov-toolbar',
	imports: [
		DatePipe,
		MatIconModule,
		MatToolbarModule,
		FallbackLogoDirective,
		ToolbarMoreOptionsAdditionalMenuItemsDirective,
		ToolbarMediaButtonsComponent,
		ToolbarPanelButtonsComponent,
		NgTemplateOutlet
	],
	templateUrl: './toolbar.component.html',
	styleUrl: './toolbar.component.scss'
})
export class ToolbarComponent implements OnInit, OnDestroy, AfterViewInit {
	private readonly documentService = inject(DocumentService);
	private readonly chatService = inject(ChatService);
	private readonly panelService = inject(PanelService);
	private readonly participantService = inject(ParticipantService);
	private readonly localMediaControlService = inject(LocalMediaControlService);
	private readonly localMediaState = inject(LocalMediaStateService);
	private readonly meetingLiveKitService = inject(MeetingLiveKitService);
	private readonly deviceService = inject(DeviceService);
	private readonly actionService = inject(ActionService);
	private readonly recordingService = inject(RecordingService);
	private readonly translateService = inject(MeetingTranslateService);
	private readonly cdkOverlayService = inject(CdkOverlayService);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly platformService = inject(PlatformService);
	private readonly destroyRef = inject(DestroyRef);
	readonly templateRegistry = inject(TemplateRegistryService);

	/**
	 * This event is emitted when the room has been disconnected.
	 * @deprecated Use {@link ToolbarComponent.onParticipantLeft} instead.
	 */
	readonly onRoomDisconnected = output<void>();

	/**
	 * This event is emitted when the local participant leaves the room.
	 */
	readonly onParticipantLeft = output<ParticipantLeftEvent>();

	/**
	 * This event is emitted when the fullscreen state changes, providing information about if the fullscreen is enabled (true) or disabled (false).
	 */
	readonly onFullscreenEnabledChanged = output<boolean>();

	/**
	 * This event is fired when the user clicks on the start recording button.
	 * It provides the {@link RecordingStartRequestedEvent} payload as event data.
	 */
	readonly onRecordingStartRequested = output<RecordingStartRequestedEvent>();
	/**
	 * Provides event notifications that fire when stop recording has been requested.
	 * It provides the {@link RecordingStopRequestedEvent} payload as event data.
	 */
	readonly onRecordingStopRequested = output<RecordingStopRequestedEvent>();

	/**
	 * @internal
	 * This event is fired when the user clicks on the view recordings button.
	 */
	readonly onViewRecordingsClicked = output<void>();

	/**
	 * @ignore
	 */
	readonly menuTriggerQuery = viewChild(MatMenuTrigger);
	public menuTrigger: MatMenuTrigger | undefined;

	/**
	 * @ignore
	 */
	readonly room = signal<Room | null>(null);
	/**
	 * @ignore
	 */
	unreadMessages: WritableSignal<number> = signal(0);
	/**
	 * @ignore
	 */
	readonly messageList: WritableSignal<ChatMessage[]> = signal([]);
	/**
	 * @internal
	 */
	private readonly lastKnownChatMessageCount = signal(0);
	/**
	 * @ignore
	 * Local media state, read from its single owner. These used to be local signals synced against
	 * the participant by an effect that also compared the previous value by hand.
	 */
	readonly isScreenShareEnabled = this.localMediaState.screenShareEnabled;
	/**
	 * @ignore
	 */
	readonly isCameraEnabled = this.localMediaState.cameraEnabled;
	/**
	 * @ignore
	 */
	readonly isMicrophoneEnabled = this.localMediaState.microphoneEnabled;
	/**
	 * @ignore
	 * Read straight off the connection owner instead of mirroring `RoomEvent.Reconnecting`/`Reconnected`
	 * into a local signal — that duplicated a subscription MeetingEventsService already holds.
	 */
	readonly isConnectionLost = this.meetingLiveKitService.isReconnecting;
	/**
	 * @ignore
	 */
	readonly hasVideoDevices = this.deviceService.hasVideoDevices;
	/**
	 * @ignore
	 */
	readonly hasAudioDevices = this.deviceService.hasAudioDevices;
	/**
	 * @ignore
	 */
	readonly isFullscreenActive = signal(false);
	/**
	 * @ignore
	 */
	readonly isChatOpened = signal(false);
	/**
	 * @ignore
	 */
	readonly isParticipantsOpened = signal(false);

	/**
	 * @ignore
	 */
	readonly isActivitiesOpened = signal(false);

	/**
	 * @ignore
	 */
	readonly showCameraButton = this.libService.cameraButtonSignal;
	/**
	 * @ignore
	 */
	readonly showMicrophoneButton = this.libService.microphoneButtonSignal;
	/**
	 * @ignore
	 */
	readonly showScreenshareButton = computed(
		() => this.libService.screenshareButtonSignal() && !this.platformService.isMobile()
	);
	/**
	 * @ignore
	 */
	readonly showFullscreenButton = this.libService.fullscreenButtonSignal;

	/**
	 * @ignore
	 */
	readonly showBackgroundEffectsButton = this.libService.backgroundEffectsButtonSignal;

	/**
	 * @ignore
	 */
	readonly showLeaveButton = this.libService.leaveButtonSignal;

	/**
	 * @ignore
	 */
	readonly showRecordingButton = this.libService.recordingButtonSignal;

	/**
	 * @ignore
	 */
	readonly showViewRecordingsButton = this.libService.toolbarViewRecordingsButtonSignal;

	/**
	 * @ignore
	 */
	readonly showSettingsButton = this.libService.toolbarSettingsButtonSignal;

	/**
	 * @ignore
	 */
	readonly showMoreOptionsButton = computed(
		() =>
			this.showFullscreenButton() ||
			this.showBackgroundEffectsButton() ||
			this.showRecordingButton() ||
			this.showSettingsButton()
	);

	/**
	 * @ignore
	 */
	readonly showParticipantsPanelButton = this.libService.participantsPanelButtonSignal;

	/**
	 * @ignore
	 */
	readonly showActivitiesPanelButton = this.libService.activitiesPanelButtonSignal;
	/**
	 * @ignore
	 */
	readonly showChatPanelButton = this.libService.chatPanelButtonSignal;
	/**
	 * @ignore
	 */
	readonly showLogo = this.libService.displayLogoSignal;

	/**
	 * @ignore
	 */
	readonly brandingLogo = this.libService.brandingLogoSignal;
	/**
	 * @ignore
	 */
	readonly showRoomName = this.libService.displayRoomNameSignal;

	/**
	 * @ignore
	 */
	readonly roomName = signal('');

	/**
	 * @internal
	 */
	readonly isFirefoxBrowser = signal(false);

	/**
	 * @ignore
	 */
	readonly additionalButtonsPosition = this.libService.toolbarAdditionalButtonsPositionSignal;
	cameraMuteChanging: WritableSignal<boolean> = signal(false);
	microphoneMuteChanging: WritableSignal<boolean> = signal(false);

	/**
	 * @ignore
	 */
	recordingStatus = this.recordingService.recordingStatus.asReadonly();

	isRecordingStarted = computed(() => this.recordingStatus().status === RecordingState.STARTED);

	/**
	 * @ignore
	 */
	_recordingStatus = RecordingState;

	recordingTime: WritableSignal<Date | undefined> = signal(undefined);

	readonly totalParticipants = this.participantService.totalParticipantsSignal;

	private log: ILogger = inject(LoggerService).get('ToolbarComponent');

	private readonly roomNameEffect = effect(() => {
		this.evalAndSetRoomName(this.libService.roomNameSignal());
	});
	private readonly querySyncEffect = effect(() => {
		this.menuTrigger = this.menuTriggerQuery();
	});
	private readonly menuTogglingEffect = effect(() => {
		const ev = this.panelService.panelOpened();
		const shouldChatBeOpened = ev.isOpened && ev.panelType === PanelType.CHAT;
		const shouldParticipantsBeOpened = ev.isOpened && ev.panelType === PanelType.PARTICIPANTS;
		const shouldActivitiesBeOpened = ev.isOpened && ev.panelType === PanelType.ACTIVITIES;

		// Update states
		this.isChatOpened.set(shouldChatBeOpened);
		this.isParticipantsOpened.set(shouldParticipantsBeOpened);
		this.isActivitiesOpened.set(shouldActivitiesBeOpened);

		// Use the derived values, not the signals we just modified
		if (shouldChatBeOpened) {
			this.unreadMessages.set(0);
		}
	});
	private readonly chatMessagesEffect = effect(() => {
		const messages = this.chatService.chatMessages();
		const currentMessageCount = messages.length;
		const previousMessageCount = this.lastKnownChatMessageCount();
		const newMessagesCount = Math.max(0, currentMessageCount - previousMessageCount);

		// Only update unread messages if panel is not open AND there are new messages
		// Do this calculation BEFORE modifying lastKnownChatMessageCount
		if (!this.panelService.isChatPanelOpened() && newMessagesCount > 0) {
			this.unreadMessages.update((count) => count + newMessagesCount);
		}

		// NOW update the signals for next effect run
		// Do this last to avoid circular reads
		this.lastKnownChatMessageCount.set(currentMessageCount);
		this.messageList.set(messages);
	});
	private readonly recordingStatusEffect = effect(() => {
		const { status, startedAt } = this.recordingStatus();

		if (status === RecordingState.STARTED && startedAt) {
			this.recordingTime.set(startedAt);
		}
	});
	/**
	 * Closes any open panel when the connection drops. `isConnectionLost` is a boolean signal, so this
	 * runs on the transition into the reconnecting state — the same moment the old
	 * `RoomEvent.Reconnecting` listener fired.
	 */
	private readonly connectionLostEffect = effect(() => {
		if (this.isConnectionLost() && this.panelService.isPanelOpened()) {
			this.panelService.closePanel();
		}
	});

	constructor() {
		this.isFirefoxBrowser.set(this.platformService.isFirefox());

		// F11 is the only key the toolbar reacts to. Bound as a native listener (not a
		// (document:keydown) host binding) so typing — e.g. in the chat input — doesn't schedule a
		// change-detection tick per keystroke; fullscreen state itself is tracked reactively via the
		// fullscreenchange subscription.
		const onDocumentKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'F11') return;

			event.preventDefault();
			this.toggleFullscreen();
		};

		document.addEventListener('keydown', onDocumentKeyDown);
		this.destroyRef.onDestroy(() => document.removeEventListener('keydown', onDocumentKeyDown));
	}

	async ngOnInit() {
		const roomValue = this.meetingLiveKitService.getRoom();
		this.room.set(roomValue);
	}

	ngAfterViewInit() {
		this.subscribeToFullscreenChanged();
	}

	ngOnDestroy(): void {
		this.panelService.clear();
		this.isFullscreenActive.set(false);
		this.cdkOverlayService.setSelector('body');
	}

	/**
	 * @internal
	 */
	get hasRoomTracksPublished(): boolean {
		return this.meetingLiveKitService.hasRoomTracksPublished();
	}

	/**
	 * @ignore
	 */
	async toggleMicrophone() {
		try {
			this.microphoneMuteChanging.set(false);
			const isMicrophoneEnabled = this.isMicrophoneEnabled();
			await this.localMediaControlService.setMicrophoneEnabled(!isMicrophoneEnabled);
		} catch (error: unknown) {
			this.log.e('There was an error toggling microphone:', (error as any).code, (error as any).message);
			this.actionService.openDialog(
				this.translateService.translate('ERRORS.TOGGLE_MICROPHONE'),
				this.translateService.translate('ERRORS.GENERIC')
			);
		} finally {
			this.microphoneMuteChanging.set(false);
		}
	}

	/**
	 * @ignore
	 */
	async toggleCamera() {
		try {
			this.cameraMuteChanging.set(true);
			const isCameraEnabled = this.isCameraEnabled();

			if (this.panelService.isBackgroundEffectsPanelOpened() && isCameraEnabled) {
				this.panelService.togglePanel(PanelType.BACKGROUND_EFFECTS);
			}

			await this.localMediaControlService.setCameraEnabled(!isCameraEnabled);
		} catch (error) {
			this.log.e('There was an error toggling camera:', (error as any).code, (error as any).message);
			this.actionService.openDialog(
				this.translateService.translate('ERRORS.TOGGLE_CAMERA'),
				this.translateService.translate('ERRORS.GENERIC')
			);
		} finally {
			this.cameraMuteChanging.set(false);
		}
	}

	/**
	 * @ignore
	 */
	async toggleScreenShare() {
		const isScreenShareEnabled = this.isScreenShareEnabled();
		await this.localMediaControlService.setScreenShareEnabled(!isScreenShareEnabled);
	}

	/**
	 * @ignore
	 */
	async replaceScreenTrack() {
		await this.localMediaControlService.switchScreenShare();
	}

	/**
	 * The participant leaves the room voluntarily.
	 * @ignore
	 */
	async disconnect() {
		try {
			await this.meetingLiveKitService.disconnect(() => {
				this.onParticipantLeft.emit({
					roomName: this.meetingLiveKitService.getRoomName(),
					participantName: this.participantService.getMyName() || '',
					identity: this.participantService.getMyIdentity() || '',
					reason: ParticipantLeftReason.LEAVE
				});
				this.onRoomDisconnected.emit();
			}, false);
		} catch (error) {
			this.log.e('There was an error disconnecting:', (error as any).code, (error as any).message);
			this.actionService.openDialog(
				this.translateService.translate('ERRORS.DISCONNECT'),
				this.translateService.translate('ERRORS.GENERIC')
			);
		}
	}

	/**
	 * @ignore
	 */
	openRecordingActivityPanel() {
		if (this.showActivitiesPanelButton() && !this.isActivitiesOpened()) {
			this.panelService.togglePanel(PanelType.ACTIVITIES, 'recording');
		}
	}

	/**
	 * @ignore
	 */
	toggleRecording() {
		const recordingStatus = this.recordingStatus().status;

		if (recordingStatus === RecordingState.FAILED) {
			this.openRecordingActivityPanel();
			return;
		}

		if (recordingStatus === RecordingState.STARTED) {
			this.onRecordingStopRequested.emit({
				roomName: this.meetingLiveKitService.getRoomName(),
				recordingId: this.recordingStatus().id!
			});
		} else if (recordingStatus === RecordingState.STOPPED) {
			this.onRecordingStartRequested.emit({
				roomName: this.meetingLiveKitService.getRoomName()
			});
			this.openRecordingActivityPanel();
		}
	}

	/**
	 * @ignore
	 */
	toggleBackgroundEffects() {
		this.panelService.togglePanel(PanelType.BACKGROUND_EFFECTS);
	}

	/**
	 * @ignore
	 */
	toggleSettings() {
		this.panelService.togglePanel(PanelType.SETTINGS);
	}

	/**
	 * @ignore
	 */
	toggleParticipantsPanel() {
		this.panelService.togglePanel(PanelType.PARTICIPANTS);
	}

	/**
	 * @ignore
	 */
	toggleChatPanel() {
		this.panelService.togglePanel(PanelType.CHAT);
	}

	/**
	 * @ignore
	 */
	toggleFullscreen() {
		this.documentService.toggleFullscreen('meeting-stage');
	}

	/**
	 * @internal
	 * @param expandPanel
	 */
	toggleActivitiesPanel(expandPanel: string) {
		this.panelService.togglePanel(PanelType.ACTIVITIES, expandPanel);
	}

	private subscribeToFullscreenChanged() {
		fromEvent(document, 'fullscreenchange')
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => {
				const isFullscreen = Boolean(document.fullscreenElement);

				if (isFullscreen) {
					this.cdkOverlayService.setSelector('#meeting-stage');
				} else {
					this.cdkOverlayService.setSelector('body');
				}

				this.isFullscreenActive.set(isFullscreen);
				this.onFullscreenEnabledChanged.emit(this.isFullscreenActive());
			});
	}

	private evalAndSetRoomName(value: string) {
		if (value) {
			this.roomName.set(value);
		} else {
			const roomValue = this.room();

			if (!!roomValue && roomValue.name) {
				this.roomName.set(roomValue.name);
			} else {
				this.roomName.set('');
			}
		}
	}
}
