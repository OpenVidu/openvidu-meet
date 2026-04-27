import { CommonModule, DatePipe } from '@angular/common';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	computed,
	contentChild,
	DestroyRef,
	effect,
	inject,
	OnDestroy,
	OnInit,
	output,
	signal,
	TemplateRef,
	viewChild,
	WritableSignal
} from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuTrigger } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { fromEvent } from 'rxjs';
import { FallbackLogoDirective } from '../../directives/api/internals.directive';
import {
	LeaveButtonDirective,
	ToolbarMoreOptionsAdditionalMenuItemsDirective
} from '../../directives/template/internals.directive';
import {
	ToolbarAdditionalButtonsDirective,
	ToolbarAdditionalPanelButtonsDirective
} from '../../directives/template/openvidu-components-angular.directive';
import { ChatMessage } from '../../models/chat.model';
import { ILogger } from '../../models/logger.model';
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
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { DeviceService } from '../../services/device/device.service';
import { DocumentService } from '../../services/document/document.service';
import { Room, RoomEvent } from '../../services/livekit-adapter';
import { LoggerService } from '../../services/logger/logger.service';
import { OpenViduService } from '../../services/openvidu/openvidu.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { PlatformService } from '../../services/platform/platform.service';
import { RecordingService } from '../../services/recording/recording.service';
import { StorageService } from '../../services/storage/storage.service';
import { TemplateManagerService, ToolbarTemplateConfiguration } from '../../services/template/template-manager.service';
import { TranslateService } from '../../services/translate/translate.service';
import { ToolbarMediaButtonsComponent } from './toolbar-media-buttons/toolbar-media-buttons.component';
import { ToolbarPanelButtonsComponent } from './toolbar-panel-buttons/toolbar-panel-buttons.component';

/**
 * The **ToolbarComponent** is hosted inside of the {@link VideoconferenceComponent}.
 * It is in charge of displaying the participants controlls for handling the media, panels and more videoconference features.
 */
@Component({
	selector: 'ov-toolbar',
	imports: [
		CommonModule,
		DatePipe,
		MatIconModule,
		MatToolbarModule,
		FallbackLogoDirective,
		ToolbarMoreOptionsAdditionalMenuItemsDirective,
		ToolbarMediaButtonsComponent,
		ToolbarPanelButtonsComponent
	],
	templateUrl: './toolbar.component.html',
	styleUrl: './toolbar.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'(window:resize)': 'sizeChange($event)',
		'(document:keydown)': 'keyDown($event)'
	},
	standalone: true
})
export class ToolbarComponent implements OnInit, OnDestroy, AfterViewInit {
	private readonly documentService = inject(DocumentService);
	private readonly chatService = inject(ChatService);
	private readonly panelService = inject(PanelService);
	private readonly participantService = inject(ParticipantService);
	private readonly openviduService = inject(OpenViduService);
	private readonly deviceService = inject(DeviceService);
	private readonly actionService = inject(ActionService);
	private readonly loggerSrv = inject(LoggerService);
	private readonly recordingService = inject(RecordingService);
	private readonly translateService = inject(TranslateService);
	private readonly storageSrv = inject(StorageService);
	private readonly cdkOverlayService = inject(CdkOverlayService);
	private readonly templateManagerService = inject(TemplateManagerService);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly platformService = inject(PlatformService);
	private readonly destroyRef = inject(DestroyRef);

	/**
	 * @ignore
	 */
	readonly toolbarAdditionalButtonsTemplateQuery = contentChild('toolbarAdditionalButtons', { read: TemplateRef });
	toolbarAdditionalButtonsTemplate: TemplateRef<any> | undefined;

	/**
	 * @ignore
	 */
	readonly toolbarLeaveButtonTemplateQuery = contentChild('toolbarLeaveButton', { read: TemplateRef });
	toolbarLeaveButtonTemplate: TemplateRef<any> | undefined;
	/**
	 * @ignore
	 */
	readonly toolbarAdditionalPanelButtonsTemplateQuery = contentChild('toolbarAdditionalPanelButtons', {
		read: TemplateRef
	});
	toolbarAdditionalPanelButtonsTemplate: TemplateRef<any> | undefined;

	/**
	 * @internal
	 * Template for additional menu items in the more options menu
	 */
	moreOptionsAdditionalMenuItemsTemplate: TemplateRef<any> | undefined;

	private _externalMoreOptionsAdditionalMenuItems?: ToolbarMoreOptionsAdditionalMenuItemsDirective;
	private readonly externalMoreOptionsAdditionalMenuItemsQuery = contentChild(
		ToolbarMoreOptionsAdditionalMenuItemsDirective
	);
	/**
	 * @internal
	 */
	get externalMoreOptionsAdditionalMenuItems(): ToolbarMoreOptionsAdditionalMenuItemsDirective | undefined {
		return this._externalMoreOptionsAdditionalMenuItems;
	}

	/**
	 * @ignore
	 */
	private readonly externalAdditionalButtonsQuery = contentChild(ToolbarAdditionalButtonsDirective);

	/**
	 * @ignore
	 */
	private readonly externalLeaveButtonQuery = contentChild(LeaveButtonDirective);

	/**
	 * @ignore
	 */
	private readonly externalAdditionalPanelButtonsQuery = contentChild(ToolbarAdditionalPanelButtonsDirective);

	/**
	 * This event is emitted when the room has been disconnected.
	 *  @deprecated Use {@link ToolbarComponent.onParticipantLeft} instead.
	 */
	readonly onRoomDisconnected = output<void>();

	/**
	 * This event is emitted when the local participant leaves the room.
	 */
	readonly onParticipantLeft = output<ParticipantLeftEvent>();

	/**
	 * This event is emitted when the video state changes, providing information about if the video is enabled (true) or disabled (false).
	 */
	readonly onVideoEnabledChanged = output<boolean>();

	/**
	 * This event is emitted when the video state changes, providing information about if the video is enabled (true) or disabled (false).
	 */
	readonly onAudioEnabledChanged = output<boolean>();

	/**
	 * This event is emitted when the fullscreen state changes, providing information about if the fullscreen is enabled (true) or disabled (false).
	 */
	readonly onFullscreenEnabledChanged = output<boolean>();

	/**
	 * This event is emitted when the screen share state changes, providing information about if the screen share is enabled (true) or disabled (false).
	 */
	readonly onScreenShareEnabledChanged = output<boolean>();

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
	 */
	readonly isScreenShareEnabled = signal(false);
	/**
	 * @ignore
	 */
	readonly isCameraEnabled = signal(true);
	/**
	 * @ignore
	 */
	readonly isMicrophoneEnabled = signal(true);
	/**
	 * @ignore
	 */
	readonly isConnectionLost = signal(false);
	/**
	 * @ignore
	 */
	readonly hasVideoDevices = signal(true);
	/**
	 * @ignore
	 */
	readonly hasAudioDevices = signal(true);
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
	readonly isMinimal = this.libService.minimalSignal;
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

	/**
	 * @internal
	 * Template configuration managed by the service
	 */
	readonly templateConfig: WritableSignal<ToolbarTemplateConfiguration> = signal({});

	// Store directive references for template setup
	private _externalAdditionalButtons?: ToolbarAdditionalButtonsDirective;
	private _externalLeaveButton?: LeaveButtonDirective;
	private _externalAdditionalPanelButtons?: ToolbarAdditionalPanelButtonsDirective;

	private log: ILogger = inject(LoggerService).get('ToolbarComponent');
	private readonly currentWindowHeight = signal(window.innerHeight);

	private readonly roomNameEffect = effect(() => {
		this.evalAndSetRoomName(this.libService.roomNameSignal());
	});
	private readonly querySyncEffect = effect(() => {
		// Track all content queries in one effect to avoid cascading setupTemplates calls
		this.menuTrigger = this.menuTriggerQuery();
		this.toolbarAdditionalButtonsTemplate = this.toolbarAdditionalButtonsTemplateQuery();
		this.toolbarLeaveButtonTemplate = this.toolbarLeaveButtonTemplateQuery();
		this.toolbarAdditionalPanelButtonsTemplate = this.toolbarAdditionalPanelButtonsTemplateQuery();

		// Update all external directives
		this._externalMoreOptionsAdditionalMenuItems = this.externalMoreOptionsAdditionalMenuItemsQuery();
		this._externalAdditionalButtons = this.externalAdditionalButtonsQuery();
		this._externalLeaveButton = this.externalLeaveButtonQuery();
		this._externalAdditionalPanelButtons = this.externalAdditionalPanelButtonsQuery();

		// Call setupTemplates only ONCE after all queries have been synced
		this.setupTemplates();
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

	constructor() {
		this.isFirefoxBrowser.set(this.platformService.isFirefox());

		// Effect to react to local participant changes
		effect(() => {
			const p = this.participantService.localParticipantSignal();
			if (!p) return;

			// Read current state into local variables first
			const currentCameraEnabled = this.isCameraEnabled();
			const currentMicEnabled = this.isMicrophoneEnabled();
			const currentScreenShareEnabled = this.isScreenShareEnabled();

			// Compare with participant state
			const cameraChanged = currentCameraEnabled !== p.isCameraEnabled;
			const micChanged = currentMicEnabled !== p.isMicrophoneEnabled;
			const screenShareChanged = currentScreenShareEnabled !== p.isScreenShareEnabled;

			// Only emit and update if there's an actual change
			if (cameraChanged) {
				this.onVideoEnabledChanged.emit(p.isCameraEnabled);
				this.isCameraEnabled.set(p.isCameraEnabled);
				this.storageSrv.setCameraEnabled(p.isCameraEnabled);
			}

			if (micChanged) {
				this.onAudioEnabledChanged.emit(p.isMicrophoneEnabled);
				this.isMicrophoneEnabled.set(p.isMicrophoneEnabled);
				this.storageSrv.setMicrophoneEnabled(p.isMicrophoneEnabled);
			}

			if (screenShareChanged) {
				this.onScreenShareEnabledChanged.emit(p.isScreenShareEnabled);
				this.isScreenShareEnabled.set(p.isScreenShareEnabled);
			}
		});
	}

	/**
	 * @ignore
	 */
	sizeChange(_: Event) {
		if (this.currentWindowHeight() >= window.innerHeight) {
			// The user has exit the fullscreen mode
			this.currentWindowHeight.set(window.innerHeight);
		}
	}

	/**
	 * @ignore
	 */
	keyDown(event: KeyboardEvent) {
		if (event.key === 'F11') {
			event.preventDefault();
			this.toggleFullscreen();
			this.currentWindowHeight.set(window.innerHeight);
			return false;
		}
		return true;
	}

	async ngOnInit() {
		const roomValue = this.openviduService.getRoom();
		this.room.set(roomValue);

		this.hasVideoDevices.set(this.deviceService.hasVideoDeviceAvailable());
		this.hasAudioDevices.set(this.deviceService.hasAudioDeviceAvailable());

		this.setupTemplates();

		this.subscribeToReconnection();
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
	 * Sets up all templates using the template manager service
	 */
	private setupTemplates(): void {
		const config = this.templateManagerService.setupToolbarTemplates(
			this._externalAdditionalButtons,
			this._externalAdditionalPanelButtons,
			this._externalLeaveButton,
			this._externalMoreOptionsAdditionalMenuItems
		);
		this.templateConfig.set(config);

		// Apply templates to component properties for backward compatibility
		this.applyTemplateConfiguration();
	}

	/**
	 * @internal
	 * Applies the template configuration to component properties
	 */
	private applyTemplateConfiguration(): void {
		const config = this.templateConfig();
		if (config.toolbarAdditionalButtonsTemplate) {
			this.toolbarAdditionalButtonsTemplate = config.toolbarAdditionalButtonsTemplate;
		}
		if (config.toolbarAdditionalPanelButtonsTemplate) {
			this.toolbarAdditionalPanelButtonsTemplate = config.toolbarAdditionalPanelButtonsTemplate;
		}
		if (config.toolbarLeaveButtonTemplate) {
			this.toolbarLeaveButtonTemplate = config.toolbarLeaveButtonTemplate;
		}
		if (config.toolbarMoreOptionsAdditionalMenuItemsTemplate) {
			this.moreOptionsAdditionalMenuItemsTemplate =
				config.toolbarMoreOptionsAdditionalMenuItemsTemplate;
		}
	}

	/**
	 * @internal
	 * Updates templates and triggers change detection
	 */
	private updateTemplatesAndMarkForCheck(): void {
		this.setupTemplates();
	}

	/**
	 * @internal
	 */
	get hasRoomTracksPublished(): boolean {
		return this.openviduService.hasRoomTracksPublished();
	}

	/**
	 * @ignore
	 */
	async toggleMicrophone() {
		try {
			this.microphoneMuteChanging.set(false);
			const isMicrophoneEnabled = this.participantService.isMyMicrophoneEnabled();
			await this.participantService.setMicrophoneEnabled(!isMicrophoneEnabled);
		} catch (error: unknown) {
			this.log.e('There was an error toggling microphone:', (error as any).code, (error as any).message);
			this.actionService.openDialog(
				this.translateService.translate('ERRORS.TOGGLE_MICROPHONE'),
				(error as any)?.error || (error as any)?.message || error
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
			const isCameraEnabled = this.participantService.isMyCameraEnabled();
			if (this.panelService.isBackgroundEffectsPanelOpened() && isCameraEnabled) {
				this.panelService.togglePanel(PanelType.BACKGROUND_EFFECTS);
			}
			await this.participantService.setCameraEnabled(!isCameraEnabled);
		} catch (error) {
			this.log.e('There was an error toggling camera:', (error as any).code, (error as any).message);
			this.actionService.openDialog(
				this.translateService.translate('ERRORS.TOGGLE_CAMERA'),
				(error as any)?.error || (error as any)?.message || error
			);
		} finally {
			this.cameraMuteChanging.set(false);
		}
	}

	/**
	 * @ignore
	 */
	async toggleScreenShare() {
		const isScreenShareEnabled = this.participantService.isMyScreenShareEnabled();
		await this.participantService.setScreenShareEnabled(!isScreenShareEnabled);
	}

	/**
	 * @ignore
	 */
	async replaceScreenTrack() {
		await this.participantService.switchScreenShare();
	}

	/**
	 * The participant leaves the room voluntarily.
	 * @ignore
	 */
	async disconnect() {
		try {
			await this.openviduService.disconnectRoom(() => {
				this.onParticipantLeft.emit({
					roomName: this.openviduService.getRoomName(),
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
				(error as any)?.error || (error as any)?.message || error
			);
		}
	}

	/**
	 * @ignore
	 */
	openRecordingActivityPanel() {
		if (this.showActivitiesPanelButton() && !this.isActivitiesOpened) {
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
				roomName: this.openviduService.getRoomName(),
				recordingId: this.recordingStatus().id!
			});
		} else if (recordingStatus === RecordingState.STOPPED) {
			this.onRecordingStartRequested.emit({
				roomName: this.openviduService.getRoomName()
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
		this.documentService.toggleFullscreen('session-container');
	}

	/**
	 * @internal
	 * @param expandPanel
	 */
	toggleActivitiesPanel(expandPanel: string) {
		this.panelService.togglePanel(PanelType.ACTIVITIES, expandPanel);
	}

	private subscribeToReconnection() {
		const roomValue = this.room();
		if (!roomValue) return;

		roomValue.on(RoomEvent.Reconnecting, () => {
			if (this.panelService.isPanelOpened()) {
				this.panelService.closePanel();
			}
			this.isConnectionLost.set(true);
		});
		roomValue.on(RoomEvent.Reconnected, () => this.isConnectionLost.set(false));
	}

	private subscribeToFullscreenChanged() {
		fromEvent(document, 'fullscreenchange')
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => {
				const isFullscreen = Boolean(document.fullscreenElement);
				if (isFullscreen) {
					this.cdkOverlayService.setSelector('#session-container');
				} else {
					this.cdkOverlayService.setSelector('body');
				}
				this.isFullscreenActive.set(isFullscreen);
				this.onFullscreenEnabledChanged.emit(this.isFullscreenActive());
			});
	}

	private evalAndSetRoomName(value: string) {
		if (!!value) {
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
