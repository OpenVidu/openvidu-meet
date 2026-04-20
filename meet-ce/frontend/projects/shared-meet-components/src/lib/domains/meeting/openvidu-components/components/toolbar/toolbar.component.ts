import {
	AfterViewInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	computed,
	contentChild,
	DestroyRef,
	effect,
	inject,
	OnDestroy,
	OnInit,
	output,
	TemplateRef,
	viewChild
} from '@angular/core';

	import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { ChatService } from '../../services/chat/chat.service';
import { DocumentService } from '../../services/document/document.service';
import { PanelService } from '../../services/panel/panel.service';

import { MatMenuTrigger } from '@angular/material/menu';
import {
	LeaveButtonDirective,
	ToolbarMoreOptionsAdditionalMenuItemsDirective
} from '../../directives/template/internals.directive';
import {
	ToolbarAdditionalButtonsDirective,
	ToolbarAdditionalPanelButtonsDirective
} from '../../directives/template/openvidu-components-angular.directive';
import {
	BroadcastingStatus,
	BroadcastingStopRequestedEvent
} from '../../models/broadcasting.model';
import { ChatMessage } from '../../models/chat.model';
import { ILogger } from '../../models/logger.model';
import { PanelType } from '../../models/panel.model';
import { ParticipantLeftEvent, ParticipantLeftReason } from '../../models/participant.model';
import {
	RecordingInfo,
	RecordingStartRequestedEvent,
	RecordingState,
	RecordingStopRequestedEvent
} from '../../models/recording.model';
import { ActionService } from '../../services/action/action.service';
import { BroadcastingService } from '../../services/broadcasting/broadcasting.service';
import { CdkOverlayService } from '../../services/cdk-overlay/cdk-overlay.service';
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { DeviceService } from '../../services/device/device.service';
import { LayoutService } from '../../services/layout/layout.service';
import { Room, RoomEvent } from '../../services/livekit-adapter';
import { LoggerService } from '../../services/logger/logger.service';
import { OpenViduService } from '../../services/openvidu/openvidu.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { PlatformService } from '../../services/platform/platform.service';
import { RecordingService } from '../../services/recording/recording.service';
import { StorageService } from '../../services/storage/storage.service';
import { TemplateManagerService, ToolbarTemplateConfiguration } from '../../services/template/template-manager.service';
import { TranslateService } from '../../services/translate/translate.service';

/**
 * The **ToolbarComponent** is hosted inside of the {@link VideoconferenceComponent}.
 * It is in charge of displaying the participants controlls for handling the media, panels and more videoconference features.
 */
@Component({
	selector: 'ov-toolbar',
	templateUrl: './toolbar.component.html',
	styleUrl: './toolbar.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'(window:resize)': 'sizeChange($event)',
		'(document:keydown)': 'keyDown($event)'
	},
	standalone: false
})
export class ToolbarComponent implements OnInit, OnDestroy, AfterViewInit {
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
	private readonly externalMoreOptionsAdditionalMenuItemsEffect = effect(() => {
		this._externalMoreOptionsAdditionalMenuItems = this.externalMoreOptionsAdditionalMenuItemsQuery();
		this.setupTemplates();
		this.cd.markForCheck();
	});
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
	private readonly externalAdditionalButtonsEffect = effect(() => {
		this._externalAdditionalButtons = this.externalAdditionalButtonsQuery();
		this.updateTemplatesAndMarkForCheck();
	});

	/**
	 * @ignore
	 */
	private readonly externalLeaveButtonQuery = contentChild(LeaveButtonDirective);
	private readonly externalLeaveButtonEffect = effect(() => {
		this._externalLeaveButton = this.externalLeaveButtonQuery();
		this.updateTemplatesAndMarkForCheck();
	});

	/**
	 * @ignore
	 */
	private readonly externalAdditionalPanelButtonsQuery = contentChild(ToolbarAdditionalPanelButtonsDirective);
	private readonly externalAdditionalPanelButtonsEffect = effect(() => {
		this._externalAdditionalPanelButtons = this.externalAdditionalPanelButtonsQuery();
		this.updateTemplatesAndMarkForCheck();
	});

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
	 * Provides event notifications that fire when stop broadcasting has been requested.
	 * It provides the {@link BroadcastingStopRequestedEvent} payload as event data.
	 */
	readonly onBroadcastingStopRequested = output<BroadcastingStopRequestedEvent>();

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
	room!: Room;
	/**
	 * @ignore
	 */
	unreadMessages: number = 0;
	/**
	 * @ignore
	 */
	messageList: ChatMessage[] = [];
	/**
	 * @internal
	 */
	firstChatMessageEmission: boolean = true;
	/**
	 * @ignore
	 */
	isScreenShareEnabled: boolean = false;
	/**
	 * @ignore
	 */
	isCameraEnabled: boolean = true;
	/**
	 * @ignore
	 */
	isMicrophoneEnabled: boolean = true;
	/**
	 * @ignore
	 */
	isConnectionLost: boolean = false;
	/**
	 * @ignore
	 */
	hasVideoDevices: boolean = true;
	/**
	 * @ignore
	 */
	hasAudioDevices: boolean = true;
	/**
	 * @ignore
	 */
	isFullscreenActive: boolean = false;
	/**
	 * @ignore
	 */
	isChatOpened: boolean = false;
	/**
	 * @ignore
	 */
	isParticipantsOpened: boolean = false;

	/**
	 * @ignore
	 */
	isActivitiesOpened: boolean = false;
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly platformService = inject(PlatformService);

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
	readonly showScreenshareButton = computed(() => this.libService.screenshareButtonSignal() && !this.platformService.isMobile());
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
	readonly showBroadcastingButton = this.libService.broadcastingButtonSignal;

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
			this.showBroadcastingButton() ||
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
	roomName: string = '';

	/**
	 * @internal
	 */
	isFirefoxBrowser: boolean = false;

	/**
	 * @ignore
	 */
	readonly additionalButtonsPosition = this.libService.toolbarAdditionalButtonsPositionSignal;

	/**
	 * @ignore
	 */
	cameraMuteChanging: boolean = false;

	/**
	 * @ignore
	 */
	microphoneMuteChanging: boolean = false;

	/**
	 * @ignore
	 */
	recordingStatus: RecordingState = RecordingState.STOPPED;

	/**
	 * @ignore
	 */
	isRecordingReadOnlyMode: boolean = false;

	/**
	 * @ignore
	 */
	private startedRecording: RecordingInfo | undefined;

	/**
	 * @ignore
	 */
	broadcastingStatus: BroadcastingStatus = BroadcastingStatus.STOPPED;
	/**
	 * @ignore
	 */
	broadcastingId: string | undefined;
	/**
	 * @ignore
	 */
	_recordingStatus = RecordingState;
	/**
	 * @ignore
	 */
	_broadcastingStatus = BroadcastingStatus;

	/**
	 * @ignore
	 */
	recordingTime: Date | undefined;

	/**
	 * @internal
	 * Template configuration managed by the service
	 */
	templateConfig: ToolbarTemplateConfiguration = {};

	/**
	 * @internal
	 * Computed signal for total participants count (local + remote)
	 */
	totalParticipants = computed(() => {
		const local = this.participantService.localParticipantSignal();
		const remotes = this.participantService.remoteParticipantsSignal();
		return (local ? 1 : 0) + remotes.length;
	});

	// Store directive references for template setup
	private _externalAdditionalButtons?: ToolbarAdditionalButtonsDirective;
	private _externalLeaveButton?: LeaveButtonDirective;
	private _externalAdditionalPanelButtons?: ToolbarAdditionalPanelButtonsDirective;

	private log: ILogger = {
		d: () => {},
		v: () => {},
		w: () => {},
		e: () => {}
	};
	private readonly destroyRef = inject(DestroyRef);
	private currentWindowHeight = window.innerHeight;

	/**
	 * @ignore
	 */
	private readonly layoutService = inject(LayoutService);
	private readonly documentService = inject(DocumentService);
	private readonly chatService = inject(ChatService);
	private readonly panelService = inject(PanelService);
	private readonly participantService = inject(ParticipantService);
	private readonly openviduService = inject(OpenViduService);
	private readonly deviceService = inject(DeviceService);
	private readonly actionService = inject(ActionService);
	private readonly loggerSrv = inject(LoggerService);
	private readonly cd = inject(ChangeDetectorRef);
	private readonly recordingService = inject(RecordingService);
	private readonly broadcastingService = inject(BroadcastingService);
	private readonly translateService = inject(TranslateService);
	private readonly storageSrv = inject(StorageService);
	private readonly cdkOverlayService = inject(CdkOverlayService);
	private readonly templateManagerService = inject(TemplateManagerService);
	private readonly roomNameEffect = effect(() => {
		this.evalAndSetRoomName(this.libService.roomNameSignal());
		this.cd.markForCheck();
	});
	private readonly querySyncEffect = effect(() => {
		this.menuTrigger = this.menuTriggerQuery();
		this.toolbarAdditionalButtonsTemplate = this.toolbarAdditionalButtonsTemplateQuery();
		this.toolbarLeaveButtonTemplate = this.toolbarLeaveButtonTemplateQuery();
		this.toolbarAdditionalPanelButtonsTemplate = this.toolbarAdditionalPanelButtonsTemplateQuery();
		this.setupTemplates();
		this.cd.markForCheck();
	});

	constructor() {
		this.log = this.loggerSrv.get('ToolbarComponent');
		this.isFirefoxBrowser = this.platformService.isFirefox();

		// Effect to react to local participant changes
		effect(() => {
			const p = this.participantService.localParticipantSignal();
			if (p) {
				if (this.isCameraEnabled !== p.isCameraEnabled) {
					this.onVideoEnabledChanged.emit(p.isCameraEnabled);
					this.isCameraEnabled = p.isCameraEnabled;
					this.storageSrv.setCameraEnabled(this.isCameraEnabled);
				}

				if (this.isMicrophoneEnabled !== p.isMicrophoneEnabled) {
					this.onAudioEnabledChanged.emit(p.isMicrophoneEnabled);
					this.isMicrophoneEnabled = p.isMicrophoneEnabled;
					this.storageSrv.setMicrophoneEnabled(this.isMicrophoneEnabled);
				}

				if (this.isScreenShareEnabled !== p.isScreenShareEnabled) {
					this.onScreenShareEnabledChanged.emit(p.isScreenShareEnabled);
					this.isScreenShareEnabled = p.isScreenShareEnabled;
				}
				this.cd.markForCheck();
			}
		});
	}

	/**
	 * @ignore
	 */
	get isRecordingStarted(): boolean {
		return this.recordingStatus === this._recordingStatus.STARTED;
	}

	/**
	 * @ignore
	 */
	get isBroadcastingStarted(): boolean {
		return this.broadcastingStatus === this._broadcastingStatus.STARTED;
	}
	/**
	 * @ignore
	 */
	sizeChange(_: Event) {
		if (this.currentWindowHeight >= window.innerHeight) {
			// The user has exit the fullscreen mode
			this.currentWindowHeight = window.innerHeight;
		}
	}

	/**
	 * @ignore
	 */
	keyDown(event: KeyboardEvent) {
		if (event.key === 'F11') {
			event.preventDefault();
			this.toggleFullscreen();
			this.currentWindowHeight = window.innerHeight;
			return false;
		}
		return true;
	}

	async ngOnInit() {
		this.room = this.openviduService.getRoom();

		this.hasVideoDevices = this.deviceService.hasVideoDeviceAvailable();
		this.hasAudioDevices = this.deviceService.hasAudioDeviceAvailable();

		this.setupTemplates();

		this.subscribeToReconnection();
		this.subscribeToMenuToggling();
		this.subscribeToChatMessages();
		this.subscribeToRecordingStatus();
		this.subscribeToBroadcastingStatus();
	}

	ngAfterViewInit() {
		this.subscribeToFullscreenChanged();
	}

	ngOnDestroy(): void {
		this.panelService.clear();
		this.isFullscreenActive = false;
		this.cdkOverlayService.setSelector('body');
	}

	/**
	 * @internal
	 * Sets up all templates using the template manager service
	 */
	private setupTemplates(): void {
		this.templateConfig = this.templateManagerService.setupToolbarTemplates(
			this._externalAdditionalButtons,
			this._externalAdditionalPanelButtons,
			this._externalLeaveButton,
			this._externalMoreOptionsAdditionalMenuItems
		);

		// Apply templates to component properties for backward compatibility
		this.applyTemplateConfiguration();
	}

	/**
	 * @internal
	 * Applies the template configuration to component properties
	 */
	private applyTemplateConfiguration(): void {
		if (this.templateConfig.toolbarAdditionalButtonsTemplate) {
			this.toolbarAdditionalButtonsTemplate = this.templateConfig.toolbarAdditionalButtonsTemplate;
		}
		if (this.templateConfig.toolbarAdditionalPanelButtonsTemplate) {
			this.toolbarAdditionalPanelButtonsTemplate = this.templateConfig.toolbarAdditionalPanelButtonsTemplate;
		}
		if (this.templateConfig.toolbarLeaveButtonTemplate) {
			this.toolbarLeaveButtonTemplate = this.templateConfig.toolbarLeaveButtonTemplate;
		}
		if (this.templateConfig.toolbarMoreOptionsAdditionalMenuItemsTemplate) {
			this.moreOptionsAdditionalMenuItemsTemplate =
				this.templateConfig.toolbarMoreOptionsAdditionalMenuItemsTemplate;
		}
	}

	/**
	 * @internal
	 * Updates templates and triggers change detection
	 */
	private updateTemplatesAndMarkForCheck(): void {
		this.setupTemplates();
		this.cd.markForCheck();
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
			this.microphoneMuteChanging = false;
			const isMicrophoneEnabled = this.participantService.isMyMicrophoneEnabled();
			await this.participantService.setMicrophoneEnabled(!isMicrophoneEnabled);
		} catch (error: unknown) {
			this.log.e('There was an error toggling microphone:', (error as any).code, (error as any).message);
			this.actionService.openDialog(
				this.translateService.translate('ERRORS.TOGGLE_MICROPHONE'),
				(error as any)?.error || (error as any)?.message || error
			);
		} finally {
			this.microphoneMuteChanging = false;
		}
	}

	/**
	 * @ignore
	 */
	async toggleCamera() {
		try {
			this.cameraMuteChanging = true;
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
			this.cameraMuteChanging = false;
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
					participantName: this.participantService.localParticipantSignal()!.name || '',
					identity: this.participantService.localParticipantSignal()!.identity || '',
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
	openBroadcastingActivityPanel() {
		if (this.showActivitiesPanelButton() && !this.isActivitiesOpened) {
			this.panelService.togglePanel(PanelType.ACTIVITIES, 'broadcasting');
		}
	}

	/**
	 * @ignore
	 */
	toggleRecording() {
		if (this.recordingStatus === RecordingState.FAILED) {
			this.openRecordingActivityPanel();
			return;
		}

		const payload: RecordingStartRequestedEvent = {
			roomName: this.openviduService.getRoomName()
		};
		if (this.recordingStatus === RecordingState.STARTED) {
			this.log.d('Stopping recording');
			payload.recordingId = this.startedRecording?.id;
			this.onRecordingStopRequested.emit(payload);
		} else if (this.recordingStatus === RecordingState.STOPPED) {
			this.onRecordingStartRequested.emit(payload);
			this.openRecordingActivityPanel();
		}
	}

	/**
	 * @ignore
	 */
	toggleBroadcasting() {
		if (this.broadcastingStatus === BroadcastingStatus.STARTED) {
			this.log.d('Stopping broadcasting');
			const payload: BroadcastingStopRequestedEvent = {
				roomName: this.openviduService.getRoomName(),
				broadcastingId: this.broadcastingId as string
			};
			this.onBroadcastingStopRequested.emit(payload);
			this.broadcastingService.setBroadcastingStopped();
		} else if (this.broadcastingStatus === BroadcastingStatus.STOPPED) {
			this.openBroadcastingActivityPanel();
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
	onCaptionsToggle() {
		// if (this.openviduService.isOpenViduPro()) {
		// 	this.layoutService.toggleCaptions();
		// } else {
		// 	this.actionService.openProFeatureDialog(
		// 		this.translateService.translate('PANEL.SETTINGS.CAPTIONS'),
		// 		this.translateService.translate('PANEL.PRO_FEATURE')
		// 	);
		// }
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
		this.room.on(RoomEvent.Reconnecting, () => {
			if (this.panelService.isPanelOpened()) {
				this.panelService.closePanel();
			}
			this.isConnectionLost = true;
		});
		this.room.on(RoomEvent.Reconnected, () => (this.isConnectionLost = false));
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
				this.isFullscreenActive = isFullscreen;
				this.onFullscreenEnabledChanged.emit(this.isFullscreenActive);
				this.cd.detectChanges();
			});
	}

	private subscribeToMenuToggling() {
		effect(() => {
			const ev = this.panelService.panelOpened();
			this.isChatOpened = ev.isOpened && ev.panelType === PanelType.CHAT;
			this.isParticipantsOpened = ev.isOpened && ev.panelType === PanelType.PARTICIPANTS;
			this.isActivitiesOpened = ev.isOpened && ev.panelType === PanelType.ACTIVITIES;
			if (this.isChatOpened) {
				this.unreadMessages = 0;
			}
			this.cd.markForCheck();
		});
	}

	private subscribeToChatMessages() {
		effect(() => {
			const messages = this.chatService.chatMessages();
			// Skip first emission like the old skip(1) operator
			if (this.firstChatMessageEmission) {
				this.firstChatMessageEmission = false;
				return;
			}
			if (!this.panelService.isChatPanelOpened()) {
				this.unreadMessages++;
			}
			this.messageList = messages;
			this.cd.markForCheck();
		});
	}

	private subscribeToRecordingStatus() {
		this.libService.recordingActivityReadOnly$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((readOnly: boolean) => {
				this.isRecordingReadOnlyMode = readOnly;
				this.cd.markForCheck();
			});

		effect(() => {
			const event = this.recordingService.recordingState();
			const { status, startedAt } = event;
			this.recordingStatus = status;
			if (status === RecordingState.STARTED) {
				this.startedRecording = event.recordingList.find((rec) => rec.status === RecordingState.STARTED);
			} else {
				this.startedRecording = undefined;
			}

			if (startedAt) {
				this.recordingTime = startedAt;
			}
			this.cd.markForCheck();
		});
	}

	private subscribeToBroadcastingStatus() {
		effect(() => {
			const ev = this.broadcastingService.broadcastingStatus();
			if (!!ev) {
				this.broadcastingStatus = ev.status;
				this.broadcastingId = ev.broadcastingId;
				this.cd.markForCheck();
			}
		});
	}

	private evalAndSetRoomName(value: string) {
		if (!!value) {
			this.roomName = value;
		} else if (!!this.room && this.room.name) {
			this.roomName = this.room.name;
		} else {
			this.roomName = '';
		}
	}
}
