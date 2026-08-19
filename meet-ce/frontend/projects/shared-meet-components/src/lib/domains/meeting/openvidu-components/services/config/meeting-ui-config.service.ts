import { Service, computed, signal } from '@angular/core';
import { ParticipantModel } from '../../models/participant.model';
import { ToolbarAdditionalButtonsPosition } from '../../models/toolbar.model';

/**
 * Toolbar configuration grouped by domain
 */
interface ToolbarConfig {
	screenshare: boolean;
	fullscreen: boolean;
	settings: boolean;
	leave: boolean;
	participantsPanel: boolean;
	chatPanel: boolean;
	activitiesPanel: boolean;
	displayRoomName: boolean;
	roomName: string;
	displayLogo: boolean;
	backgroundEffects: boolean;
	recording: boolean;
	viewRecordings: boolean;
	brandingLogo: string;
	additionalButtonsPosition: ToolbarAdditionalButtonsPosition;
}

/**
 * Stream/Video configuration
 */
interface StreamConfig {
	displayParticipantName: boolean;
	displayAudioDetection: boolean;
	videoControls: boolean;
	participantItemMuteButton: boolean;
}

/**
 * Recording activity configuration
 */
interface RecordingActivityConfig {
	enabled: boolean;
	startStopButton: boolean;
	viewRecordingsButton: boolean;
}

/**
 * General application configuration
 */
interface GeneralConfig {
	token: string;
	livekitUrl: string;
	tokenError: any;
	participantName: string;
	prejoin: boolean;
	showThemeSelector: boolean;
	e2eeKey?: string;
}

/**
 * @internal
 */
@Service()
export class MeetingUiConfigService {
	// Grouped configuration items by domain
	private readonly generalConfig = signal<GeneralConfig>({
		token: '',
		livekitUrl: '',
		tokenError: null,
		participantName: '',
		prejoin: true,
		showThemeSelector: false,
		e2eeKey: undefined
	});

	private readonly toolbarConfig = signal<ToolbarConfig>({
		screenshare: true,
		fullscreen: true,
		settings: true,
		leave: true,
		participantsPanel: true,
		chatPanel: true,
		activitiesPanel: true,
		displayRoomName: true,
		roomName: '',
		displayLogo: true,
		backgroundEffects: true,
		recording: true,
		viewRecordings: false,
		brandingLogo: '',
		additionalButtonsPosition: ToolbarAdditionalButtonsPosition.AFTER_MENU
	});

	private readonly streamConfig = signal<StreamConfig>({
		displayParticipantName: true,
		displayAudioDetection: true,
		videoControls: true,
		participantItemMuteButton: true
	});

	private readonly recordingActivityConfig = signal<RecordingActivityConfig>({
		enabled: true,
		startStopButton: true,
		viewRecordingsButton: false,
	});

	// Individual configs that don't fit into groups
	private readonly layoutRemoteParticipantsConfig = signal<ParticipantModel[] | undefined>(undefined);
	// Whether the chat message input is enabled (the participant may send messages). The chat panel
	// visibility is a separate concern (chatPanel above); this only gates writing.
	private readonly chatInputEnabledConfig = signal<boolean>(true);
	// Whether the camera / microphone controls are shown. Deliberately NOT in ToolbarConfig: each gates
	// every control of its device — toolbar button, prejoin screen and settings panel — so it is a
	// meeting-wide capability, not a toolbar decoration.
	private readonly showCameraControlsConfig = signal<boolean>(true);
	private readonly showMicrophoneControlsConfig = signal<boolean>(true);

	// Signals-first selectors used by migrated consumers/directives
	readonly tokenSignal = computed(() => this.generalConfig().token);
	readonly tokenErrorSignal = computed(() => this.generalConfig().tokenError);
	readonly participantNameSignal = computed(() => this.generalConfig().participantName);
	readonly e2eeKeySignal = computed(() => this.generalConfig().e2eeKey);
	readonly displayParticipantNameSignal = computed(() => this.streamConfig().displayParticipantName);
	readonly displayAudioDetectionSignal = computed(() => this.streamConfig().displayAudioDetection);
	readonly streamVideoControlsSignal = computed(() => this.streamConfig().videoControls);
	readonly participantItemMuteButtonSignal = computed(() => this.streamConfig().participantItemMuteButton);
	readonly showCameraControlsSignal = this.showCameraControlsConfig.asReadonly();
	readonly showMicrophoneControlsSignal = this.showMicrophoneControlsConfig.asReadonly();
	readonly screenshareButtonSignal = computed(() => this.toolbarConfig().screenshare);
	readonly fullscreenButtonSignal = computed(() => this.toolbarConfig().fullscreen);
	readonly toolbarSettingsButtonSignal = computed(() => this.toolbarConfig().settings);
	readonly leaveButtonSignal = computed(() => this.toolbarConfig().leave);
	readonly participantsPanelButtonSignal = computed(() => this.toolbarConfig().participantsPanel);
	readonly chatPanelButtonSignal = computed(() => this.toolbarConfig().chatPanel);
	readonly chatInputEnabledSignal = this.chatInputEnabledConfig.asReadonly();
	readonly activitiesPanelButtonSignal = computed(() => this.toolbarConfig().activitiesPanel);
	readonly displayRoomNameSignal = computed(() => this.toolbarConfig().displayRoomName);
	readonly roomNameSignal = computed(() => this.toolbarConfig().roomName);
	readonly brandingLogoSignal = computed(() => this.toolbarConfig().brandingLogo);
	readonly displayLogoSignal = computed(() => this.toolbarConfig().displayLogo);
	readonly showThemeSelectorSignal = computed(() => this.generalConfig().showThemeSelector);
	readonly toolbarAdditionalButtonsPositionSignal = computed(() => this.toolbarConfig().additionalButtonsPosition);
	readonly backgroundEffectsButtonSignal = computed(() => this.toolbarConfig().backgroundEffects);
	readonly recordingButtonSignal = computed(() => this.toolbarConfig().recording);
	readonly toolbarViewRecordingsButtonSignal = computed(() => this.toolbarConfig().viewRecordings);
	readonly recordingActivitySignal = computed(() => this.recordingActivityConfig().enabled);
	readonly recordingActivityStartStopRecordingButtonSignal = computed(() => this.recordingActivityConfig().startStopButton);
	readonly recordingActivityViewRecordingsButtonSignal = computed(() => this.recordingActivityConfig().viewRecordingsButton);
	readonly layoutRemoteParticipantsSignal = this.layoutRemoteParticipantsConfig.asReadonly();

	// ============================================
	// BATCH UPDATE METHODS
	// ============================================

	/**
	 * Update multiple general configuration properties at once
	 */
	updateGeneralConfig(partialConfig: Partial<GeneralConfig>): void {
		this.generalConfig.update((current) => ({ ...current, ...partialConfig }));
	}

	/**
	 * Update multiple toolbar configuration properties at once
	 */
	updateToolbarConfig(partialConfig: Partial<ToolbarConfig>): void {
		this.toolbarConfig.update((current) => ({ ...current, ...partialConfig }));
	}

	/**
	 * Update multiple stream configuration properties at once
	 */
	updateStreamConfig(partialConfig: Partial<StreamConfig>): void {
		this.streamConfig.update((current) => ({ ...current, ...partialConfig }));
	}

	/**
	 * Update multiple recording activity configuration properties at once
	 */
	updateRecordingActivityConfig(partialConfig: Partial<RecordingActivityConfig>): void {
		this.recordingActivityConfig.update((current) => ({ ...current, ...partialConfig }));
	}

	/**
	 * Enable or disable the chat message input (whether the participant may send messages).
	 */
	setChatInputEnabled(enabled: boolean): void {
		this.chatInputEnabledConfig.set(enabled);
	}

	/**
	 * Show or hide every camera control: the toolbar button, the prejoin screen and the settings panel.
	 */
	setShowCameraControls(show: boolean): void {
		this.showCameraControlsConfig.set(show);
	}

	/**
	 * Show or hide every microphone control: the toolbar button, the prejoin screen and the settings
	 * panel.
	 */
	setShowMicrophoneControls(show: boolean): void {
		this.showMicrophoneControlsConfig.set(show);
	}

	// ============================================
	// DIRECT ACCESS METHODS (for internal use)
	// ============================================

	/**
	 * @internal
	 * Get current participant name directly
	 */
	getCurrentParticipantName(): string {
		return this.generalConfig().participantName;
	}

	// ============================================
	// INDIVIDUAL GETTER/SETTER METHODS
	// ============================================

	// General configuration methods

	getLivekitUrl(): string {
		return this.generalConfig().livekitUrl;
	}

	showPrejoin(): boolean {
		return this.generalConfig().prejoin;
	}


	getE2EEKey(): string | undefined {
		return this.generalConfig().e2eeKey;
	}

	// Toolbar configuration methods

	getRoomName(): string {
		return this.toolbarConfig().roomName;
	}

	showBackgroundEffectsButton(): boolean {
		return this.toolbarConfig().backgroundEffects;
	}

	// Activity methods (these remain individual as they don't fit cleanly into toolbar config)


	// Internals
	setLayoutRemoteParticipants(participants: ParticipantModel[] | undefined) {
		this.layoutRemoteParticipantsConfig.set(participants);
	}
}
