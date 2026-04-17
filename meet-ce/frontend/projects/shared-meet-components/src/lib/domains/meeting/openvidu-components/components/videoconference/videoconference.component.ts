import { animate, style, transition, trigger } from '@angular/animations';
import {
	AfterViewInit,
	ChangeDetectorRef,
	Component,
	DestroyRef,
	OnDestroy,
	TemplateRef,
	contentChild,
	inject,
	output,
	viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, skip, take } from 'rxjs';
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
import { BroadcastingStartRequestedEvent, BroadcastingStopRequestedEvent } from '../../models/broadcasting.model';
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
import { VideoconferenceState, VideoconferenceStateInfo } from '../../models/videoconference-state.model';
import { ActionService } from '../../services/action/action.service';
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { DeviceService } from '../../services/device/device.service';
import { E2eeService } from '../../services/e2ee/e2ee.service';
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

/**
 * The **VideoconferenceComponent** is the parent of all OpenVidu components.
 * It allow us to create a modern, useful and powerful videoconference apps with ease.
 */
@Component({
	selector: 'ov-videoconference',
	templateUrl: './videoconference.component.html',
	styleUrls: ['./videoconference.component.scss'],
	animations: [
		trigger('inOutAnimation', [
			transition(':enter', [
				style({ opacity: 0 }),
				animate(`${VideoconferenceComponent.ANIMATION_DURATION_MS}ms ease-out`, style({ opacity: 1 }))
			])
			// transition(':leave', [style({ opacity: 1 }), animate('50ms ease-in', style({ opacity: 0.9 }))])
		])
	],
	standalone: false
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
	private readonly e2eeService = inject(E2eeService);
	private readonly cd = inject(ChangeDetectorRef);

	// Constants
	private static readonly PARTICIPANT_NAME_TIMEOUT_MS = 1000;
	private static readonly ANIMATION_DURATION_MS = 300;
	private static readonly MATERIAL_ICONS_URL = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined';
	private static readonly MATERIAL_ICONS_SELECTOR = 'link[href*="Material+Symbols+Outlined"]';
	private static readonly SPINNER_DIAMETER = 50;
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
	readonly externalParticipantPanelAfterLocalParticipant = contentChild(ParticipantPanelAfterLocalParticipantDirective);
	readonly externalLayoutAdditionalElements = contentChild(LayoutAdditionalElementsDirective);
	readonly externalSettingsPanelGeneralAdditionalElements = contentChild(SettingsPanelGeneralAdditionalElementsDirective);
	readonly externalToolbarMoreOptionsAdditionalMenuItems = contentChild(ToolbarMoreOptionsAdditionalMenuItemsDirective);

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

	/**
	 * Provides event notifications that fire when the local participant is ready to join to the room.
	 * This event emits the participant name as data.
	 */
	readonly onTokenRequested = output<string>();

	/**
	 * Provides event notifications that fire when the local participant is ready to join to the room.
	 * This event is only emitted when the prejoin page has been shown.
	 */
	readonly onReadyToJoin = output<void>();

	/**
	 * Provides event notifications that fire when Room is disconnected for the local participant.
	 * @deprecated Use {@link VideoconferenceComponent.onParticipantLeft} instead
	 */
	readonly onRoomDisconnected = output<void>();

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
	 * Provides event notifications that fire when start broadcasting button is clicked.
	 * It provides the {@link BroadcastingStartRequestedEvent} payload as event data.
	 */
	readonly onBroadcastingStartRequested = output<BroadcastingStartRequestedEvent>();

	/**
	 * Provides event notifications that fire when stop broadcasting button is clicked.
	 * It provides the {@link BroadcastingStopRequestedEvent} payload as event data.
	 */
	readonly onBroadcastingStopRequested = output<BroadcastingStopRequestedEvent>();

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

	/**
	 * @internal
	 * Centralized state management for the videoconference component
	 */
	componentState: VideoconferenceStateInfo = {
		state: VideoconferenceState.INITIALIZING,
		showPrejoin: true,
		isRoomReady: false,
		isConnected: false,
		hasAudioDevices: false,
		hasVideoDevices: false,
		hasUserInitiatedJoin: false,
		wasPrejoinShown: false,
		isLoading: true,
		error: {
			hasError: false,
			message: '',
			tokenError: null
		}
	};

	private readonly destroyRef = inject(DestroyRef);
	private log: ILogger;
	private latestParticipantName: string | undefined;

	// Expose constants to template
	get spinnerDiameter(): number {
		return VideoconferenceComponent.SPINNER_DIAMETER;
	}

	/**
	 * @internal
	 * Updates the component state
	 */
	private updateComponentState(newState: Partial<VideoconferenceStateInfo>): void {
		this.componentState = { ...this.componentState, ...newState };
		this.log.d(`State updated to: ${this.componentState.state}`, this.componentState);
	}

	/**
	 * @internal
	 * Checks if user has initiated the join process
	 */
	private hasUserInitiatedJoin(): boolean {
		return (
			this.componentState.state === VideoconferenceState.JOINING ||
			this.componentState.state === VideoconferenceState.READY_TO_CONNECT ||
			this.componentState.state === VideoconferenceState.CONNECTED
		);
	}

	/**
	 * @internal
	 */
	constructor() {
		this.log = this.loggerSrv.get('VideoconferenceComponent');

		this.addMaterialIconsIfNeeded();

		// Initialize state
		this.updateComponentState({
			state: VideoconferenceState.INITIALIZING,
			showPrejoin: true,
			isRoomReady: false,
			wasPrejoinShown: false,
			isLoading: true,
			error: { hasError: false }
		});

		this.themeService.initializeTheme();
		this.subscribeToVideconferenceDirectives();
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
				this.updateComponentState({
					state: VideoconferenceState.PREJOIN_SHOWN,
					error: {
						hasError: false,
						message: ''
					}
				});
			})
			.finally(() => {
				this.updateComponentState({
					isLoading: false
				});
				this.cd.markForCheck();
			});
	}

	/**
	 * @internal
	 */
	private addMaterialIconsIfNeeded(): void {
		//Add material icons to the page if not already present
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

		// Use the template manager service to set up all templates
		this.templateConfig = this.templateManagerService.setupTemplates(externalDirectives, defaultTemplates);

		// Apply the configuration to the component properties
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

		// Optional templates
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

	/**
	 * @internal
	 * Handles the ready-to-join event, initializing the room and managing the prejoin flow.
	 * This method coordinates the transition from prejoin state to actual room joining.
	 */
	_onReadyToJoin(): void {
		this.log.d('Ready to join - initializing room and handling prejoin flow');
		try {
			// Mark that user has initiated the join process
			this.updateComponentState({
				state: VideoconferenceState.JOINING,
				wasPrejoinShown: this.componentState.showPrejoin
			});

			// Always initialize the room when ready to join
			this.openviduService.initRoom();

			// Get the most current participant name from the service
			// This ensures we have the latest value after any batch updates
			const participantName = this.libService.getCurrentParticipantName() || this.latestParticipantName;

			if (this.componentState.isRoomReady) {
				// Room is ready, hide prejoin and proceed
				this.log.d('Room is ready, proceeding to join');
				this.updateComponentState({
					state: VideoconferenceState.READY_TO_CONNECT,
					showPrejoin: false
				});
			} else {
				// Room not ready, request token if we have a participant name
				if (participantName) {
					this.log.d(`Requesting token for participant: ${participantName}`);
					this.onTokenRequested.emit(participantName);
				} else {
					this.log.w('No participant name available when requesting token');
					// Wait a bit and try again in case name is still propagating
					setTimeout(() => {
						const retryName = this.libService.getCurrentParticipantName() || this.latestParticipantName;
						if (retryName) {
							this.log.d(`Retrying token request for participant: ${retryName}`);
							this.onTokenRequested.emit(retryName);
						} else {
							this.log.e('Still no participant name available after retry');
						}
					}, 10);
				}
			}

			// Emit onReadyToJoin event only if prejoin page was actually shown
			// This ensures the event semantics are correct
			if (this.componentState.wasPrejoinShown) {
				this.log.d('Emitting onReadyToJoin event (prejoin was shown)');
				this.onReadyToJoin.emit();
			}
		} catch (error) {
			this.log.e('Error during ready to join process', error);
			this.updateComponentState({
				state: VideoconferenceState.ERROR,
				error: {
					hasError: true,
					message: 'Error during ready to join process'
				}
			});
		}
	}
	/**
	 * @internal
	 */
	_onParticipantLeft(event: ParticipantLeftEvent) {
		this.onParticipantLeft.emit(event);

		// Reset to disconnected state
		// Set showPrejoin to false to prevent prejoin from showing and creating tracks
		// This avoids the race condition where tracks are created before navigation
		this.updateComponentState({
			state: VideoconferenceState.DISCONNECTED,
			isRoomReady: false,
			showPrejoin: false
		});
	}

	private subscribeToVideconferenceDirectives() {
		this.libService.token$.pipe(skip(1), takeUntilDestroyed(this.destroyRef)).subscribe((token: string) => {
			try {
				if (!token) {
					this.log.e('Token is empty');
					return;
				}

				const livekitUrl = this.libService.getLivekitUrl();
				this.openviduService.initializeAndSetToken(token, livekitUrl);
				this.log.d('Token has been successfully set. Room is ready to join');

				if (this.hasUserInitiatedJoin()) {
					// User has initiated join, proceed to hide prejoin and continue
					this.log.d('User has initiated join, hiding prejoin and proceeding');
					this.updateComponentState({
						state: VideoconferenceState.READY_TO_CONNECT,
						isRoomReady: true,
						showPrejoin: false
					});
				} else {
					// Only update showPrejoin if user hasn't initiated join process yet
					// This prevents prejoin from showing again after user clicked join
					this.updateComponentState({
						state: VideoconferenceState.PREJOIN_SHOWN,
						isRoomReady: true,
						showPrejoin: this.libService.showPrejoin()
					});
				}
			} catch (error) {
				this.log.e('Error trying to set token', error);
				this.updateComponentState({
					state: VideoconferenceState.ERROR,
					error: {
						hasError: true,
						message: 'Error setting token',
						tokenError: error
					}
				});
			}
		});

		this.libService.tokenError$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((error: any) => {
			if (!error) return;

			this.log.e('Token error received', error);
			this.updateComponentState({
				state: VideoconferenceState.ERROR,
				error: {
					hasError: true,
					message: 'Token error',
					tokenError: error
				}
			});

			if (!this.componentState.showPrejoin) {
				this.actionService.openDialog(error.name, error.message, false);
			}
		});

		this.libService.prejoin$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value: boolean) => {
			this.updateComponentState({
				showPrejoin: value
			});

			if (!value) {
				// Emit token ready if the prejoin page won't be shown

				// Ensure we have a participant name before proceeding with the join
				this.log.d('Prejoin page is hidden, checking participant name');
				// Check if we have a participant name already
				if (this.latestParticipantName) {
					// We have a name, proceed immediately
					this._onReadyToJoin();
				} else {
					// No name yet - set up a one-time subscription to wait for it
					this.libService.participantName$
						.pipe(
							filter((name) => !!name),
							take(1),
							takeUntilDestroyed(this.destroyRef)
						)
						.subscribe(() => {
							// Now we have the name in latestParticipantName
							this._onReadyToJoin();
						});
					// Add safety timeout in case name never arrives
					setTimeout(() => {
						if (!this.latestParticipantName) {
							this.log.w('No participant name received after timeout, proceeding anyway');
							const storedName = this.storageSrv.getParticipantName();
							if (storedName) {
								this.latestParticipantName = storedName;
								this.libService.updateGeneralConfig({ participantName: storedName });
							}
							this._onReadyToJoin();
						}
					}, VideoconferenceComponent.PARTICIPANT_NAME_TIMEOUT_MS);
				}
			}
		});

		this.libService.participantName$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async (name: string) => {
			if (name) {
				this.latestParticipantName = await this.e2eeService.decrypt(name);
				this.storageSrv.setParticipantName(name);

				// If we're waiting for a participant name to proceed with joining, do it now
				if (
					this.componentState.state === VideoconferenceState.JOINING &&
					this.componentState.isRoomReady &&
					!this.componentState.showPrejoin
				) {
					this.log.d('Participant name received, proceeding to join');
					this.updateComponentState({
						state: VideoconferenceState.READY_TO_CONNECT,
						showPrejoin: false
					});
				}
			}
		});
	}
}
