import { NgTemplateOutlet } from '@angular/common';
import {
	AfterViewInit,
	Component,
	contentChild,
	effect,
	ElementRef,
	inject,
	OnDestroy,
	output,
	signal,
	TemplateRef,
	untracked,
	viewChild
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { SidenavLayoutDirective } from '../../directives/layout/sidenav-layout.directive';
import {
	LayoutAdditionalElementsDirective,
	LeaveButtonDirective,
	ParticipantPanelAfterLocalParticipantDirective,
	PreJoinDirective,
	SettingsPanelGeneralAdditionalElementsDirective,
	ToolbarMoreOptionsAdditionalMenuItemsDirective
} from '../../directives/template/internals.directive';
import {
	ActivitiesPanelDirective,
	AdditionalPanelsDirective,
	ChatPanelDirective,
	LayoutDirective,
	PanelDirective,
	ParticipantPanelItemDirective,
	ParticipantPanelItemElementsDirective,
	ParticipantsPanelDirective,
	StreamDirective,
	ToolbarAdditionalButtonsDirective,
	ToolbarAdditionalPanelButtonsDirective,
	ToolbarDirective
} from '../../directives/template/openvidu-components-angular.directive';
import { CustomDevice } from '../../models/device.model';
import { LangOption } from '../../models/lang.model';
import { MeetingViewPhase } from '../../models/meeting-view-state.model';
import {
	ActivitiesPanelStatusEvent,
	ChatPanelStatusEvent,
	ParticipantsPanelStatusEvent,
	SettingsPanelStatusEvent
} from '../../models/panel.model';
import { ParticipantLeftEvent, ParticipantLeftReason, ParticipantModel } from '../../models/participant.model';
import { RecordingStartRequestedEvent, RecordingStopRequestedEvent } from '../../models/recording.model';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ActionService } from '../../services/action/action.service';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';
import { DeviceService } from '../../services/device/device.service';
import type { Room } from '../../services/livekit';
import { MeetingEventsService } from '../../services/meeting-events/meeting-events.service';
import { MeetingLiveKitService } from '../../services/meeting-livekit/meeting-livekit.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { MediaStorageService } from '../../services/storage/storage.service';
import { TemplateRegistryService } from '../../services/template/template-registry.service';
import { MeetingTranslateService } from '../../services/translate/meeting-translate.service';
import { ViewportService } from '../../services/viewport/viewport.service';
import { VirtualBackgroundService } from '../../services/virtual-background/virtual-background.service';
import { SmartLayoutComponent } from '../layout/smart-layout/smart-layout.component';
import { ActivitiesPanelComponent } from '../panel/activities-panel/activities-panel.component';
import { BackgroundEffectsPanelComponent } from '../panel/background-effects-panel/background-effects-panel.component';
import { ChatPanelComponent } from '../panel/chat-panel/chat-panel.component';
import { PanelComponent } from '../panel/panel.component';
import { ParticipantPanelItemComponent } from '../panel/participants-panel/participant-panel-item/participant-panel-item.component';
import { ParticipantsPanelComponent } from '../panel/participants-panel/participants-panel/participants-panel.component';
import { SettingsPanelComponent } from '../panel/settings-panel/settings-panel.component';
import { LandscapeWarningComponent } from '../landscape-warning/landscape-warning.component';
import { MeetingMediaSetupComponent } from '../meeting-media-setup/meeting-media-setup.component';
import { StreamComponent } from '../stream/stream.component';
import { ToolbarComponent } from '../toolbar/toolbar.component';
import { LoggerService } from '../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../shared/models/logger.model';

/**
 * The **MeetingViewComponent** is the parent of all OpenVidu components: it owns the phase machine
 * that decides what is on screen (device setup → prejoin → connecting → live) **and** the live stage
 * itself, including the LiveKit connection.
 */
@Component({
	selector: 'ov-meeting-view',
	imports: [
		MatIconModule,
		MatProgressSpinnerModule,
		MatSidenavModule,
		SidenavLayoutDirective,
		TranslatePipe,
		MeetingMediaSetupComponent,
		LandscapeWarningComponent,
		ToolbarComponent,
		PanelComponent,
		BackgroundEffectsPanelComponent,
		SettingsPanelComponent,
		ChatPanelComponent,
		ActivitiesPanelComponent,
		ParticipantsPanelComponent,
		ParticipantPanelItemComponent,
		SmartLayoutComponent,
		StreamComponent,
		SettingsPanelGeneralAdditionalElementsDirective,
		NgTemplateOutlet
	],
	templateUrl: './meeting-view.component.html',
	styleUrls: ['./meeting-view.component.scss'],
	host: {
		'(window:beforeunload)': 'beforeunloadHandler()'
	}
})
export class MeetingViewComponent implements OnDestroy, AfterViewInit {
	private readonly loggerSrv = inject(LoggerService);
	private readonly storageSrv = inject(MediaStorageService);
	private readonly deviceSrv = inject(DeviceService);
	private readonly meetingLiveKitService = inject(MeetingLiveKitService);
	private readonly actionService = inject(ActionService);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly participantService = inject(ParticipantService);
	private readonly panelService = inject(PanelService);
	private readonly backgroundService = inject(VirtualBackgroundService);
	private readonly meetingEventsService = inject(MeetingEventsService);
	private readonly translateService = inject(MeetingTranslateService);
	protected readonly viewportService = inject(ViewportService);
	readonly templateRegistry = inject(TemplateRegistryService);

	// Constants
	private static readonly SPINNER_DIAMETER = 50;
	private static readonly ENTER_ANIMATION_CLASS = 'ov-fade-in-enter';

	// *** Toolbar ***

	readonly externalToolbar = contentChild(ToolbarDirective);
	readonly externalToolbarAdditionalButtons = contentChild(ToolbarAdditionalButtonsDirective);
	readonly externalToolbarLeaveButton = contentChild(LeaveButtonDirective);
	readonly externalToolbarAdditionalPanelButtons = contentChild(ToolbarAdditionalPanelButtonsDirective);
	readonly externalAdditionalPanels = contentChild(AdditionalPanelsDirective);

	// *** Panels ***

	readonly externalPanel = contentChild(PanelDirective);
	readonly externalChatPanel = contentChild(ChatPanelDirective);
	readonly externalActivitiesPanel = contentChild(ActivitiesPanelDirective);
	readonly externalParticipantsPanel = contentChild(ParticipantsPanelDirective);
	readonly externalParticipantPanelItem = contentChild(ParticipantPanelItemDirective);
	readonly externalParticipantPanelItemElements = contentChild(ParticipantPanelItemElementsDirective);

	// *** Layout ***

	readonly externalLayout = contentChild(LayoutDirective);
	readonly externalStream = contentChild(StreamDirective);

	// *** PreJoin ***

	readonly externalPreJoin = contentChild(PreJoinDirective);
	readonly externalParticipantPanelAfterLocalParticipant = contentChild(
		ParticipantPanelAfterLocalParticipantDirective
	);
	readonly externalLayoutAdditionalElements = contentChild(LayoutAdditionalElementsDirective);
	readonly externalSettingsPanelGeneralAdditionalElements = contentChild(
		SettingsPanelGeneralAdditionalElementsDirective
	);
	readonly externalToolbarMoreOptionsAdditionalMenuItems = contentChild(
		ToolbarMoreOptionsAdditionalMenuItemsDirective
	);

	/**
	 * @internal
	 */
	readonly defaultToolbarTemplate = viewChild('defaultToolbar', { read: TemplateRef });
	/**
	 * @internal
	 */
	readonly defaultPanelTemplate = viewChild('defaultPanel', { read: TemplateRef });
	/**
	 * @internal
	 */
	readonly defaultChatPanelTemplate = viewChild('defaultChatPanel', { read: TemplateRef });
	/**
	 * @internal
	 */
	readonly defaultParticipantsPanelTemplate = viewChild('defaultParticipantsPanel', { read: TemplateRef });
	/**
	 * @internal
	 */
	readonly defaultActivitiesPanelTemplate = viewChild('defaultActivitiesPanel', { read: TemplateRef });

	/**
	 * @internal
	 */
	readonly defaultParticipantPanelItemTemplate = viewChild('defaultParticipantPanelItem', { read: TemplateRef });
	/**
	 * @internal
	 */
	readonly defaultLayoutTemplate = viewChild('defaultLayout', { read: TemplateRef });
	/**
	 * @internal
	 */
	readonly defaultStreamTemplate = viewChild('defaultStream', { read: TemplateRef });
	/**
	 * @internal
	 */
	readonly defaultBackgroundEffectsPanelTemplate = viewChild('defaultBackgroundEffectsPanel', { read: TemplateRef });
	/**
	 * @internal
	 */
	readonly defaultSettingsPanelTemplate = viewChild('defaultSettingsPanel', { read: TemplateRef });

	/**
	 * @internal
	 * The layout container entering the DOM is the cue that the live stage is on screen and the
	 * stored virtual background can be applied.
	 */
	readonly layoutContainerQuery = viewChild<ElementRef>('layoutContainer');

	// ── State machine ────────────────────────────────────────────────────────
	// Single phase signal drives all UI branching. Effects only write to it
	// and use untracked() for any internal reads, so there are no reactive loops.
	//
	// IMPORTANT — template-registry ordering invariant: setupTemplates() runs in ngAfterViewInit
	// because it needs both the consumer's contentChild slots and this component's own viewChild
	// default <ng-template>s. The 'live' branch *reads* that registry through its ngTemplateOutlets,
	// and it is only reachable after a successful connect, i.e. strictly later than ngAfterViewInit.
	// Reordering the phases so that 'live' can be entered earlier breaks it.
	/** @internal */
	readonly phase = signal<MeetingViewPhase>('loading');

	/** @internal - error details from token operations */
	readonly tokenError = signal<{ name: string; message: string } | undefined>(undefined);

	// No `room` field on purpose: MeetingLiveKitService owns the Room and may recreate it (E2EE
	// reconfiguration), so a copy here could go stale. Always read it through the service.

	// False until the connect starts: destroying the view during device setup or prejoin must not
	// reach into MeetingLiveKitService, which is root-provided and outlives this component.
	private shouldDisconnectRoomWhenComponentIsDestroyed = false;

	// Expose constants to template
	get spinnerDiameter(): number {
		return MeetingViewComponent.SPINNER_DIAMETER;
	}

	get enterAnimationClass(): string {
		return MeetingViewComponent.ENTER_ANIMATION_CLASS;
	}

	// ── Outputs ──────────────────────────────────────────────────────────────

	/**
	 * Provides event notifications that fire when Room is being reconnected for the local participant.
	 */
	readonly onRoomReconnecting = output<void>();

	/**
	 * Provides event notifications that fire when Room is reconnected for the local participant.
	 */
	readonly onRoomReconnected = output<void>();

	/**
	 * This event is emitted when the local participant leaves the room.
	 */
	readonly onParticipantLeft = output<ParticipantLeftEvent>();

	/**
	 * This event is emitted when the video state changes, providing information about if the video is enabled (true) or disabled (false).
	 */
	readonly onVideoEnabledChanged = output<boolean>();
	/**
	 * This event is emitted when the selected video device changes, providing information about the new custom device that has been selected.
	 */
	readonly onVideoDeviceChanged = output<CustomDevice>();

	/**
	 * This event is emitted when the audio state changes, providing information about if the audio is enabled (true) or disabled (false).
	 */
	readonly onAudioEnabledChanged = output<boolean>();

	/**
	 * This event is emitted when the selected audio device changes, providing information about the new custom device that has been selected.
	 */
	readonly onAudioDeviceChanged = output<CustomDevice>();

	/**
	 * This event is emitted when the language changes, providing information about the new language that has been selected.
	 */
	readonly onLangChanged = output<LangOption>();

	/**
	 * This event is emitted when the screen share state changes, providing information about if the screen share is enabled (true) or disabled (false).
	 */
	readonly onScreenShareEnabledChanged = output<boolean>();

	/**
	 * The event is emitted when the fullscreen state changes, providing information about if the fullscreen is enabled (true) or disabled (false).
	 */
	readonly onFullscreenEnabledChanged = output<boolean>();

	/**
	 * This event is fired when the chat panel status has been changed.
	 * It provides the new status of the chat panel as {@link ChatPanelStatusEvent} payload.
	 */
	readonly onChatPanelStatusChanged = output<ChatPanelStatusEvent>();

	/**
	 * This event is fired when the participants panel status has been changed.
	 * It provides the new status of the participants panel as {@link ParticipantsPanelStatusEvent} payload.
	 */
	readonly onParticipantsPanelStatusChanged = output<ParticipantsPanelStatusEvent>();

	/**
	 * This event is fired when the settings panel status has been changed.
	 * It provides the new status of the settings panel as {@link SettingsPanelStatusEvent} payload.
	 */
	readonly onSettingsPanelStatusChanged = output<SettingsPanelStatusEvent>();

	/**
	 * This event is fired when the activities panel status has been changed.
	 * It provides the new status of the activities panel as {@link ActivitiesPanelStatusEvent} payload.
	 */
	readonly onActivitiesPanelStatusChanged = output<ActivitiesPanelStatusEvent>();

	/**
	 * Provides event notifications that fire when stop recording button has been clicked.
	 * It provides the {@link RecordingStopRequestedEvent} payload as event data.
	 */
	readonly onRecordingStopRequested = output<RecordingStopRequestedEvent>();

	/**
	 * This event is fired when the user clicks on the start recording button.
	 * It provides the {@link RecordingStartRequestedEvent} payload as event data.
	 */
	readonly onRecordingStartRequested = output<RecordingStartRequestedEvent>();

	/**
	 * @internal
	 * This event is fired when the user clicks on the view recordings button.
	 */
	readonly onViewRecordingsClicked = output<void>();

	/**
	 * Provides event notifications that fire when Room is created for the local participant.
	 * It provides the {@link https://openvidu.io/latest/docs/getting-started/#room Room} payload as event data.
	 */
	readonly onRoomCreated = output<Room>();

	/**
	 * Provides event notifications that fire when local participant is connected to the Room.
	 * It provides the {@link ParticipantModel} payload as event data.
	 */
	readonly onParticipantConnected = output<ParticipantModel>();

	// ── Effects ──────────────────────────────────────────────────────────────
	// Each effect reads only from libService signals and uses untracked() for
	// any reads of internal signals, preventing reactive dependency cycles.

	/**
	 * @internal
	 * Handles token errors received from the parent.
	 */
	private readonly _tokenErrorEffect = effect(() => {
		const error = this.libService.tokenErrorSignal();

		if (!error) return;

		this.log.e('Token error received', error);

		const prevPhase = untracked(() => this.phase());
		this.tokenError.set(error);
		this.phase.set('error');

		// Open dialog only when user is already in the session (not on prejoin)
		if (prevPhase !== 'prejoin' && prevPhase !== 'loading') {
			this.actionService.openDialog(error.name, error.message, false);
		}

		// A token error raised while connected has to release the room. Before the merge this was
		// implicit: leaving the live phase destroyed <ov-session>, whose ngOnDestroy disconnected.
		// Behaviour kept as it was, including the side effect that the disconnection emits
		// onParticipantLeft and therefore moves the phase on from 'error' to 'disconnected'.
		if (prevPhase === 'connecting' || prevPhase === 'live') {
			void this.disconnectRoom(ParticipantLeftReason.LEAVE);
		}
	});

	/**
	 * @internal
	 * Applies the stored virtual background once the live stage is on screen, and only when the
	 * background-effects button is enabled.
	 */
	private readonly applyStoredBackgroundEffect = effect(() => {
		const container = this.layoutContainerQuery();

		if (container) {
			// Use microtask instead of setTimeout for better performance
			Promise.resolve().then(async () => {
				if (container && this.libService.showBackgroundEffectsButton()) {
					await this.backgroundService.applyBackgroundFromStorage();
				}
			});
		}
	});

	// Close background effects panel and remove background if the button is disabled
	private readonly backgroundEffectsEffect = effect(() => {
		const enabled = this.libService.backgroundEffectsButtonSignal();

		if (enabled) return;

		if (this.backgroundService.isBackgroundApplied()) {
			void this.backgroundService.removeBackground().then(() => {
				if (this.panelService.isBackgroundEffectsPanelOpened()) {
					this.panelService.closePanel();
				}
			});
		}
	});

	private log: ILogger;

	/**
	 * @internal
	 */
	constructor() {
		this.log = this.loggerSrv.get('MeetingViewComponent');
	}

	async ngOnDestroy() {
		if (this.shouldDisconnectRoomWhenComponentIsDestroyed) {
			await this.disconnectRoom(ParticipantLeftReason.LEAVE);
		}

		if (this.meetingLiveKitService.isInitialized()) {
			this.meetingLiveKitService.getRoom().removeAllListeners();
		}

		this.participantService.clear();
		this.deviceSrv.clear();
	}

	/**
	 * @internal
	 */
	beforeunloadHandler() {
		// Only meaningful once there is something to disconnect from.
		if (this.phase() !== 'connecting' && this.phase() !== 'live') return;

		this.disconnectRoom(ParticipantLeftReason.BROWSER_UNLOAD);
	}

	/**
	 * @internal
	 */
	ngAfterViewInit() {
		this.setupTemplates();
		this.deviceSrv
			.initializeDevices()
			.catch((error) => {
				this.log.w('Device initialization failed. Continuing without blocking UI.', error);
			})
			.finally(() => {
				this._transitionAfterDevicesReady();
			});
	}

	/**
	 * @internal
	 * Called by the PreJoin component when the user clicks join.
	 * Transitions from 'prejoin' → 'connecting' by applying the token immediately.
	 */
	_onReadyToJoin(): void {
		this.log.d('User clicked join in prejoin');

		const rawName = this.libService.getCurrentParticipantName() || this.storageSrv.getParticipantName() || '';
		this.storageSrv.setParticipantName(rawName);

		this.meetingLiveKitService.init();
		this._applyToken(this.libService.tokenSignal());
	}

	/**
	 * @internal
	 */
	_onParticipantLeft(event: ParticipantLeftEvent) {
		this.onParticipantLeft.emit(event);
		// showPrejoin stays false to prevent track creation before navigation
		this.phase.set('disconnected');
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	/**
	 * @internal
	 * Decides the next phase once device initialization finishes.
	 */
	private _transitionAfterDevicesReady(): void {
		if (this.libService.showPrejoin()) {
			this.log.d('Devices ready, showing prejoin');
			this.phase.set('prejoin');
		} else {
			this.log.d('Devices ready, no prejoin — requesting token directly');
			this._requestTokenSkippingPrejoin();
		}
	}

	/**
	 * @internal
	 * Used when showPrejoin = false. Applies the token directly without showing the prejoin page.
	 */
	private _requestTokenSkippingPrejoin(): void {
		this.meetingLiveKitService.init();
		this._applyToken(this.libService.tokenSignal());
	}

	/**
	 * @internal
	 * Applies a received token and connects: 'connecting' → 'live'.
	 */
	private _applyToken(token: string): void {
		try {
			const livekitUrl = this.libService.getLivekitUrl();
			this.meetingLiveKitService.initializeAndSetToken(token, livekitUrl);
			this.log.d('Token applied, room is ready to connect');
			this.phase.set('connecting');
		} catch (error: any) {
			this.log.e('Error applying token', error);
			this.tokenError.set({ name: 'Token error', message: error?.message ?? String(error) });
			this.phase.set('error');
			return;
		}

		void this._connectToRoom();
	}

	/**
	 * @internal
	 * Joins the room the token was applied to and transitions to the 'live' phase.
	 *
	 * Only reachable after `initializeAndSetToken()` succeeded, so the room exists; `getRoom()` is
	 * still wrapped because it throws rather than returning undefined.
	 */
	private async _connectToRoom(): Promise<void> {
		this.shouldDisconnectRoomWhenComponentIsDestroyed = true;

		let room: Room;

		try {
			room = this.meetingLiveKitService.getRoom();
		} catch (error: unknown) {
			this.log.e('Unexpected error getting room:', error);
			this.showStartupError('ERRORS.MEETING_NOT_READY');
			return;
		}

		this.meetingEventsService.bindRoom(room, {
			onRoomReconnecting: () => this.onRoomReconnecting.emit(),
			onRoomReconnected: () => this.onRoomReconnected.emit(),
			onParticipantLeft: (event) => this._onParticipantLeft(event)
		});

		try {
			await this.participantService.connect();
			// Send room created after participant connect for avoiding to send incomplete room payload
			this.onRoomCreated.emit(room);

			this.phase.set('live');

			const localParticipant = this.participantService.localParticipant();

			if (localParticipant) {
				this.onParticipantConnected.emit(localParticipant);
			}
		} catch (error: any) {
			// The technical detail goes to the log; the user gets a translated, actionable message.
			this.log.e('There was an error connecting to the meeting:', error?.code, error?.message, error);
			this.showStartupError('ERRORS.MEETING_CONNECTION_FAILED');
		}
	}

	/**
	 * @internal
	 * Leaves the room, emitting `onParticipantLeft` once the disconnection completes.
	 */
	async disconnectRoom(reason: ParticipantLeftReason) {
		// Mark the room as disconnected to avoid doing it again in ngOnDestroy
		this.shouldDisconnectRoomWhenComponentIsDestroyed = false;
		await this.meetingLiveKitService.disconnect(() => {
			this._onParticipantLeft({
				roomName: this.meetingLiveKitService.getRoomName(),
				participantName: this.participantService.getMyName() || '',
				identity: this.participantService.getMyIdentity() || '',
				reason
			});
		}, false);
	}

	/**
	 * Single policy for the errors that prevent the meeting from starting: same translated title,
	 * a translated message keyed by cause, and never the raw error — which used to leak LiveKit
	 * internals into the dialog. Callers are responsible for logging the technical detail.
	 */
	private showStartupError(messageKey: string): void {
		this.actionService.openDialog(
			this.translateService.translate('ERRORS.SESSION'),
			this.translateService.translate(messageKey)
		);
	}

	/**
	 * @internal
	 */
	private setupTemplates(): void {
		const r = this.templateRegistry;

		// Core layout — external directive template takes priority over default
		r.toolbar.set(this.externalToolbar()?.template ?? this.defaultToolbarTemplate()!);
		r.panel.set(this.externalPanel()?.template ?? this.defaultPanelTemplate()!);
		r.layout.set(this.externalLayout()?.template ?? this.defaultLayoutTemplate()!);
		r.stream.set(this.externalStream()?.template ?? this.defaultStreamTemplate()!);
		r.preJoin.set(this.externalPreJoin()?.template);

		// Panel slots
		r.chatPanel.set(this.externalChatPanel()?.template ?? this.defaultChatPanelTemplate()!);
		r.participantsPanel.set(this.externalParticipantsPanel()?.template ?? this.defaultParticipantsPanelTemplate()!);
		r.activitiesPanel.set(this.externalActivitiesPanel()?.template ?? this.defaultActivitiesPanelTemplate()!);
		r.additionalPanels.set(this.externalAdditionalPanels()?.template);
		r.backgroundEffectsPanel.set(this.defaultBackgroundEffectsPanelTemplate());
		r.settingsPanel.set(this.defaultSettingsPanelTemplate());

		// Participant slots
		r.participantPanelItem.set(
			this.externalParticipantPanelItem()?.template ?? this.defaultParticipantPanelItemTemplate()!
		);
		r.participantPanelItemElements.set(this.externalParticipantPanelItemElements()?.template);
		r.participantPanelAfterLocalParticipant.set(this.externalParticipantPanelAfterLocalParticipant()?.template);

		// Toolbar extensions
		r.toolbarAdditionalButtons.set(this.externalToolbarAdditionalButtons()?.template);
		r.toolbarLeaveButton.set(this.externalToolbarLeaveButton()?.template);
		r.toolbarAdditionalPanelButtons.set(this.externalToolbarAdditionalPanelButtons()?.template);
		r.toolbarMoreOptionsAdditionalMenuItems.set(this.externalToolbarMoreOptionsAdditionalMenuItems()?.template);

		// Additional layout elements
		const layoutAdditional = this.externalLayoutAdditionalElements();
		r.layoutAdditionalElements.set(layoutAdditional?.template);
		r.layoutAdditionalElementsSlot.set(layoutAdditional?.slot() ?? 'default');

		// Settings panel extensions
		r.settingsPanelGeneralAdditionalElements.set(this.externalSettingsPanelGeneralAdditionalElements()?.template);
	}
}
