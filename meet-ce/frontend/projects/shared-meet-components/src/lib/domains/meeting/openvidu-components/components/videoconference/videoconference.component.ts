import { CommonModule } from '@angular/common';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	contentChild,
	effect,
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
import { ILogger } from '../../models/logger.model';
import {
	ActivitiesPanelStatusEvent,
	ChatPanelStatusEvent,
	ParticipantsPanelStatusEvent,
	SettingsPanelStatusEvent
} from '../../models/panel.model';
import { ParticipantLeftEvent, ParticipantModel } from '../../models/participant.model';
import {
	RecordingDeleteRequestedEvent,
	RecordingDownloadClickedEvent,
	RecordingPlayClickedEvent,
	RecordingStartRequestedEvent,
	RecordingStopRequestedEvent
} from '../../models/recording.model';
import { VideoconferencePhase } from '../../models/videoconference-state.model';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ActionService } from '../../services/action/action.service';
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { DeviceService } from '../../services/device/device.service';
import type { OVRoom } from '../../services/livekit-adapter';
import { LoggerService } from '../../services/logger/logger.service';
import { OpenViduService } from '../../services/openvidu/openvidu.service';
import { StorageService } from '../../services/storage/storage.service';
import {
	DefaultTemplates,
	ExternalDirectives,
	TemplateConfiguration,
	TemplateManagerService
} from '../../services/template/template-manager.service';
import { OpenViduThemeService } from '../../services/theme/theme.service';
import { LayoutComponent } from '../layout/layout.component';
import { ActivitiesPanelComponent } from '../panel/activities-panel/activities-panel.component';
import { BackgroundEffectsPanelComponent } from '../panel/background-effects-panel/background-effects-panel.component';
import { ChatPanelComponent } from '../panel/chat-panel/chat-panel.component';
import { PanelComponent } from '../panel/panel.component';
import { ParticipantPanelItemComponent } from '../panel/participants-panel/participant-panel-item/participant-panel-item.component';
import { ParticipantsPanelComponent } from '../panel/participants-panel/participants-panel/participants-panel.component';
import { SettingsPanelComponent } from '../panel/settings-panel/settings-panel.component';
import { PreJoinComponent } from '../pre-join/pre-join.component';
import { SessionComponent } from '../session/session.component';
import { StreamComponent } from '../stream/stream.component';
import { ToolbarComponent } from '../toolbar/toolbar.component';

/**
 * The **VideoconferenceComponent** is the parent of all OpenVidu components.
 * It allow us to create a modern, useful and powerful videoconference apps with ease.
 */
@Component({
	selector: 'ov-videoconference',
	imports: [
		CommonModule,
		MatIconModule,
		MatProgressSpinnerModule,
		TranslatePipe,
		PreJoinComponent,
		SessionComponent,
		ToolbarComponent,
		PanelComponent,
		BackgroundEffectsPanelComponent,
		SettingsPanelComponent,
		ChatPanelComponent,
		ActivitiesPanelComponent,
		ParticipantsPanelComponent,
		ParticipantPanelItemComponent,
		LayoutComponent,
		StreamComponent,
		ToolbarMoreOptionsAdditionalMenuItemsDirective,
		SettingsPanelGeneralAdditionalElementsDirective
	],
	templateUrl: './videoconference.component.html',
	styleUrls: ['./videoconference.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class VideoconferenceComponent implements OnDestroy, AfterViewInit {
	private readonly loggerSrv = inject(LoggerService);
	private readonly storageSrv = inject(StorageService);
	private readonly deviceSrv = inject(DeviceService);
	private readonly openviduService = inject(OpenViduService);
	private readonly actionService = inject(ActionService);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly templateManagerService = inject(TemplateManagerService);
	private readonly themeService = inject(OpenViduThemeService);

	// Constants
	private static readonly MATERIAL_ICONS_URL = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined';
	private static readonly MATERIAL_ICONS_SELECTOR = 'link[href*="Material+Symbols+Outlined"]';
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
	openviduAngularToolbarTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	openviduAngularToolbarAdditionalButtonsTemplate: TemplateRef<any> | undefined = undefined;

	/**
	 * @internal
	 */
	openviduAngularToolbarLeaveButtonTemplate: TemplateRef<any> | undefined;

	/**
	 * @internal
	 */
	openviduAngularActivitiesPanelTemplate: TemplateRef<any> | undefined = undefined;

	/**
	 * @internal
	 */
	openviduAngularToolbarAdditionalPanelButtonsTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	openviduAngularPanelTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	openviduAngularChatPanelTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	openviduAngularParticipantsPanelTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	openviduAngularAdditionalPanelsTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	openviduAngularParticipantPanelAfterLocalParticipantTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	openviduAngularParticipantPanelItemTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	openviduAngularParticipantPanelItemElementsTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	openviduAngularLayoutTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	openviduAngularStreamTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	openviduAngularPreJoinTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	ovLayoutAdditionalElementsTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	ovSettingsPanelGeneralAdditionalElementsTemplate: TemplateRef<any> | undefined = undefined;
	/**
	 * @internal
	 */
	ovToolbarMoreOptionsAdditionalMenuItemsTemplate: TemplateRef<any> | undefined = undefined;

	/**
	 * @internal
	 * Template configuration managed by TemplateManagerService
	 */
	private templateConfig: TemplateConfiguration = {} as TemplateConfiguration;

	// ── State machine ────────────────────────────────────────────────────────
	// Single phase signal drives all UI branching. Effects only write to it
	// and use untracked() for any internal reads, so there are no reactive loops.
	/** @internal */
	readonly phase = signal<VideoconferencePhase>('loading');

	/** @internal - error details from token operations */
	readonly tokenError = signal<{ name: string; message: string } | undefined>(undefined);

	// Expose constants to template
	get spinnerDiameter(): number {
		return VideoconferenceComponent.SPINNER_DIAMETER;
	}

	get enterAnimationClass(): string {
		return VideoconferenceComponent.ENTER_ANIMATION_CLASS;
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
	 * Provides event notifications that fire when delete recording button has been clicked.
	 * It provides the {@link RecordingDeleteRequestedEvent} payload as event data.
	 */
	readonly onRecordingDeleteRequested = output<RecordingDeleteRequestedEvent>();

	/**
	 * Provides event notifications that fire when play recording button is clicked from {@link ActivitiesPanelComponent}.
	 * It provides the {@link RecordingPlayClickedEvent} payload as event data.
	 */
	readonly onRecordingPlayClicked = output<RecordingPlayClickedEvent>();

	/**
	 * @internal
	 * This event is fired when the user clicks on the view recording button.
	 * It provides the recording ID as event data.
	 */
	readonly onViewRecordingClicked = output<string>();

	/**
	 * Provides event notifications that fire when download recording button is clicked from {@link ActivitiesPanelComponent}.
	 * It provides the {@link RecordingDownloadClickedEvent} payload as event data.
	 */
	readonly onRecordingDownloadClicked = output<RecordingDownloadClickedEvent>();

	/**
	 * @internal
	 * This event is fired when the user clicks on the view recordings button.
	 */
	readonly onViewRecordingsClicked = output<void>();

	/**
	 * Provides event notifications that fire when Room is created for the local participant.
	 * It provides the {@link https://openvidu.io/latest/docs/getting-started/#room Room} payload as event data.
	 */
	readonly onRoomCreated = output<OVRoom>();

	/**
	 * Provides event notifications that fire when local participant is created and connected to the Room.
	 * @deprecated Use `onParticipantConnected` instead
	 */
	readonly onParticipantCreated = output<ParticipantModel>();

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
	});

	private log: ILogger;

	/**
	 * @internal
	 */
	constructor() {
		this.log = this.loggerSrv.get('VideoconferenceComponent');
		this.addMaterialIconsIfNeeded();
		this.themeService.initializeTheme();
	}

	ngOnDestroy() {
		this.deviceSrv.clear();
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
	 * Transitions from 'prejoin' → 'ready' by applying the token immediately.
	 */
	_onReadyToJoin(): void {
		this.log.d('User clicked join in prejoin');

		const rawName = this.libService.getCurrentParticipantName() || this.storageSrv.getParticipantName() || '';
		this.storageSrv.setParticipantName(rawName);

		this.openviduService.initRoom();
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
		this.openviduService.initRoom();
		this._applyToken(this.libService.tokenSignal());
	}

	/**
	 * @internal
	 * Applies a received token and transitions to the 'ready' phase.
	 */
	private _applyToken(token: string): void {
		try {
			const livekitUrl = this.libService.getLivekitUrl();
			this.openviduService.initializeAndSetToken(token, livekitUrl);
			this.log.d('Token applied, room is ready to connect');
			this.phase.set('ready');
		} catch (error: any) {
			this.log.e('Error applying token', error);
			this.tokenError.set({ name: 'Token error', message: error?.message ?? String(error) });
			this.phase.set('error');
		}
	}

	/**
	 * @internal
	 */
	private addMaterialIconsIfNeeded(): void {
		const existingLink = document.querySelector(VideoconferenceComponent.MATERIAL_ICONS_SELECTOR);
		if (!existingLink) {
			const link = document.createElement('link');
			link.href = VideoconferenceComponent.MATERIAL_ICONS_URL;
			link.rel = 'stylesheet';
			document.head.appendChild(link);
		}
	}

	/**
	 * @internal
	 */
	private setupTemplates(): void {
		const externalDirectives: ExternalDirectives = {
			toolbar: this.externalToolbar(),
			toolbarAdditionalButtons: this.externalToolbarAdditionalButtons(),
			toolbarAdditionalPanelButtons: this.externalToolbarAdditionalPanelButtons(),
			toolbarLeaveButton: this.externalToolbarLeaveButton(),
			additionalPanels: this.externalAdditionalPanels(),
			panel: this.externalPanel(),
			chatPanel: this.externalChatPanel(),
			activitiesPanel: this.externalActivitiesPanel(),
			participantsPanel: this.externalParticipantsPanel(),
			participantPanelAfterLocalParticipant: this.externalParticipantPanelAfterLocalParticipant(),
			participantPanelItem: this.externalParticipantPanelItem(),
			participantPanelItemElements: this.externalParticipantPanelItemElements(),
			layout: this.externalLayout(),
			stream: this.externalStream(),
			preJoin: this.externalPreJoin(),
			layoutAdditionalElements: this.externalLayoutAdditionalElements(),
			settingsPanelGeneralAdditionalElements: this.externalSettingsPanelGeneralAdditionalElements(),
			toolbarMoreOptionsAdditionalMenuItems: this.externalToolbarMoreOptionsAdditionalMenuItems()
		};

		const defaultTemplates: DefaultTemplates = {
			toolbar: this.defaultToolbarTemplate()!,
			panel: this.defaultPanelTemplate()!,
			chatPanel: this.defaultChatPanelTemplate()!,
			participantsPanel: this.defaultParticipantsPanelTemplate()!,
			activitiesPanel: this.defaultActivitiesPanelTemplate()!,
			participantPanelItem: this.defaultParticipantPanelItemTemplate()!,
			layout: this.defaultLayoutTemplate()!,
			stream: this.defaultStreamTemplate()!
		};

		this.templateConfig = this.templateManagerService.setupTemplates(externalDirectives, defaultTemplates);
		this.applyTemplateConfiguration();
	}

	/**
	 * @internal
	 * Applies the template configuration to component properties
	 */
	private applyTemplateConfiguration(): void {
		const assignIfChanged = <K extends keyof this>(prop: K, value: this[K]) => {
			if (this[prop] !== value) {
				this[prop] = value;
			}
		};

		assignIfChanged('openviduAngularToolbarTemplate', this.templateConfig.toolbarTemplate);
		assignIfChanged('openviduAngularPanelTemplate', this.templateConfig.panelTemplate);
		assignIfChanged('openviduAngularChatPanelTemplate', this.templateConfig.chatPanelTemplate);
		assignIfChanged('openviduAngularParticipantsPanelTemplate', this.templateConfig.participantsPanelTemplate);
		assignIfChanged('openviduAngularActivitiesPanelTemplate', this.templateConfig.activitiesPanelTemplate);
		assignIfChanged(
			'openviduAngularParticipantPanelItemTemplate',
			this.templateConfig.participantPanelItemTemplate
		);
		assignIfChanged('openviduAngularLayoutTemplate', this.templateConfig.layoutTemplate);
		assignIfChanged('openviduAngularStreamTemplate', this.templateConfig.streamTemplate);

		if (this.templateConfig.toolbarAdditionalButtonsTemplate) {
			assignIfChanged(
				'openviduAngularToolbarAdditionalButtonsTemplate',
				this.templateConfig.toolbarAdditionalButtonsTemplate
			);
		}
		if (this.templateConfig.toolbarLeaveButtonTemplate) {
			assignIfChanged(
				'openviduAngularToolbarLeaveButtonTemplate',
				this.templateConfig.toolbarLeaveButtonTemplate
			);
		}
		if (this.templateConfig.toolbarAdditionalPanelButtonsTemplate) {
			assignIfChanged(
				'openviduAngularToolbarAdditionalPanelButtonsTemplate',
				this.templateConfig.toolbarAdditionalPanelButtonsTemplate
			);
		}
		if (this.templateConfig.additionalPanelsTemplate) {
			assignIfChanged('openviduAngularAdditionalPanelsTemplate', this.templateConfig.additionalPanelsTemplate);
		}
		if (this.templateConfig.participantPanelAfterLocalParticipantTemplate) {
			assignIfChanged(
				'openviduAngularParticipantPanelAfterLocalParticipantTemplate',
				this.templateConfig.participantPanelAfterLocalParticipantTemplate
			);
		}
		if (this.templateConfig.participantPanelItemElementsTemplate) {
			assignIfChanged(
				'openviduAngularParticipantPanelItemElementsTemplate',
				this.templateConfig.participantPanelItemElementsTemplate
			);
		}
		if (this.templateConfig.preJoinTemplate) {
			assignIfChanged('openviduAngularPreJoinTemplate', this.templateConfig.preJoinTemplate);
		}
		if (this.templateConfig.layoutAdditionalElementsTemplate) {
			assignIfChanged('ovLayoutAdditionalElementsTemplate', this.templateConfig.layoutAdditionalElementsTemplate);
		}
		if (this.templateConfig.settingsPanelGeneralAdditionalElementsTemplate) {
			assignIfChanged(
				'ovSettingsPanelGeneralAdditionalElementsTemplate',
				this.templateConfig.settingsPanelGeneralAdditionalElementsTemplate
			);
		}
		if (this.templateConfig.toolbarMoreOptionsAdditionalMenuItemsTemplate) {
			assignIfChanged(
				'ovToolbarMoreOptionsAdditionalMenuItemsTemplate',
				this.templateConfig.toolbarMoreOptionsAdditionalMenuItemsTemplate
			);
		}
	}
}
