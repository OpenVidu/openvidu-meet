import { Injectable, computed, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { distinctUntilChanged, shareReplay } from 'rxjs/operators';
import { ParticipantModel } from '../../models/participant.model';
import { RecordingInfo } from '../../models/recording.model';
import { ToolbarAdditionalButtonsPosition } from '../../models/toolbar.model';

/**
 * Recording activity controls configuration
 */
interface RecordingControls {
	play: boolean;
	download: boolean;
	delete: boolean;
	externalView: boolean;
}

/**
 * Toolbar configuration grouped by domain
 */
interface ToolbarConfig {
	camera: boolean;
	microphone: boolean;
	screenshare: boolean;
	fullscreen: boolean;
	captions: boolean;
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
	broadcasting: boolean;
	brandingLogo: string;
	additionalButtonsPosition: ToolbarAdditionalButtonsPosition;
}

/**
 * Stream/Video configuration
 */
interface StreamConfig {
	videoEnabled: boolean;
	audioEnabled: boolean;
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
	readOnly: boolean;
	showControls: RecordingControls;
	startStopButton: boolean;
	viewRecordingsButton: boolean;
	showRecordingsList: boolean;
}

/**
 * Admin dashboard configuration
 */
interface AdminConfig {
	recordingsList: RecordingInfo[];
	loginError: any;
	loginTitle: string;
	dashboardTitle: string;
}

/**
 * General application configuration
 */
interface GeneralConfig {
	token: string;
	livekitUrl: string;
	tokenError: any;
	minimal: boolean;
	participantName: string;
	prejoin: boolean;
	prejoinDisplayParticipantName: boolean;
	showDisconnectionDialog: boolean;
	showThemeSelector: boolean;
	recordingStreamBaseUrl: string;
	e2eeKey?: string;
}

/**
 * @internal
 */
@Injectable({
	providedIn: 'root'
})
export class OpenViduComponentsConfigService {
	/**
	 * Create a shared Observable bridge from a signal selector.
	 */
	private toStoreObservable<T>(selector: () => T, comparator?: (prev: T, curr: T) => boolean): Observable<T> {
		const source$ = toObservable(computed(selector));
		return comparator
			? source$.pipe(distinctUntilChanged(comparator), shareReplay(1))
			: source$.pipe(distinctUntilChanged(), shareReplay(1));
	}

	/**
	 * Optimized deep equality check
	 */
	private deepEqual(a: any, b: any): boolean {
		if (a === b) return true;
		if (a == null || b == null) return a === b;
		if (typeof a !== typeof b) return false;
		if (typeof a !== 'object') return a === b;

		const keysA = Object.keys(a);
		const keysB = Object.keys(b);
		if (keysA.length !== keysB.length) return false;

		return keysA.every((key) => this.deepEqual(a[key], b[key]));
	}

	// Grouped configuration items by domain
	private readonly generalConfig = signal<GeneralConfig>({
		token: '',
		livekitUrl: '',
		tokenError: null,
		minimal: false,
		participantName: '',
		prejoin: true,
		prejoinDisplayParticipantName: true,
		showDisconnectionDialog: true,
		showThemeSelector: false,
		recordingStreamBaseUrl: 'call/api/recordings',
		e2eeKey: undefined
	});

	private readonly toolbarConfig = signal<ToolbarConfig>({
		camera: true,
		microphone: true,
		screenshare: true,
		fullscreen: true,
		captions: true,
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
		broadcasting: true,
		brandingLogo: '',
		additionalButtonsPosition: ToolbarAdditionalButtonsPosition.AFTER_MENU
	});

	private readonly streamConfig = signal<StreamConfig>({
		videoEnabled: true,
		audioEnabled: true,
		displayParticipantName: true,
		displayAudioDetection: true,
		videoControls: true,
		participantItemMuteButton: true
	});

	private readonly recordingActivityConfig = signal<RecordingActivityConfig>({
		enabled: true,
		readOnly: false,
		showControls: {
			play: true,
			download: true,
			delete: true,
			externalView: false
		},
		startStopButton: true,
		viewRecordingsButton: false,
		showRecordingsList: true
	});

	private readonly adminConfig = signal<AdminConfig>({
		recordingsList: [],
		loginError: null,
		loginTitle: '',
		dashboardTitle: ''
	});

	// Individual configs that don't fit into groups
	private readonly broadcastingActivityConfig = signal(true);
	private readonly layoutRemoteParticipantsConfig = signal<ParticipantModel[] | undefined>(undefined);

	// Signals-first selectors used by migrated consumers/directives
	readonly minimalSignal = computed(() => this.generalConfig().minimal);
	readonly displayParticipantNameSignal = computed(() => this.streamConfig().displayParticipantName);
	readonly displayAudioDetectionSignal = computed(() => this.streamConfig().displayAudioDetection);
	readonly streamVideoControlsSignal = computed(() => this.streamConfig().videoControls);
	readonly cameraButtonSignal = computed(() => this.toolbarConfig().camera);
	readonly microphoneButtonSignal = computed(() => this.toolbarConfig().microphone);
	readonly screenshareButtonSignal = computed(() => this.toolbarConfig().screenshare);
	readonly fullscreenButtonSignal = computed(() => this.toolbarConfig().fullscreen);
	readonly captionsButtonSignal = computed(() => this.toolbarConfig().captions);
	readonly toolbarSettingsButtonSignal = computed(() => this.toolbarConfig().settings);
	readonly leaveButtonSignal = computed(() => this.toolbarConfig().leave);
	readonly participantsPanelButtonSignal = computed(() => this.toolbarConfig().participantsPanel);
	readonly chatPanelButtonSignal = computed(() => this.toolbarConfig().chatPanel);
	readonly activitiesPanelButtonSignal = computed(() => this.toolbarConfig().activitiesPanel);
	readonly displayRoomNameSignal = computed(() => this.toolbarConfig().displayRoomName);
	readonly roomNameSignal = computed(() => this.toolbarConfig().roomName);
	readonly brandingLogoSignal = computed(() => this.toolbarConfig().brandingLogo);
	readonly displayLogoSignal = computed(() => this.toolbarConfig().displayLogo);
	readonly toolbarAdditionalButtonsPositionSignal = computed(() => this.toolbarConfig().additionalButtonsPosition);
	readonly backgroundEffectsButtonSignal = computed(() => this.toolbarConfig().backgroundEffects);
	readonly recordingButtonSignal = computed(() => this.toolbarConfig().recording);
	readonly toolbarViewRecordingsButtonSignal = computed(() => this.toolbarConfig().viewRecordings);
	readonly broadcastingButtonSignal = computed(() => this.toolbarConfig().broadcasting);
	readonly broadcastingActivitySignal = this.broadcastingActivityConfig.asReadonly();
	readonly layoutRemoteParticipantsSignal = this.layoutRemoteParticipantsConfig.asReadonly();

	// General observables
	token$: Observable<string> = this.toStoreObservable(() => this.generalConfig().token);
	livekitUrl$: Observable<string> = this.toStoreObservable(() => this.generalConfig().livekitUrl);
	tokenError$: Observable<any> = this.toStoreObservable(() => this.generalConfig().tokenError);
	minimal$: Observable<boolean> = this.toStoreObservable(() => this.generalConfig().minimal);
	participantName$: Observable<string> = this.toStoreObservable(() => this.generalConfig().participantName);
	prejoin$: Observable<boolean> = this.toStoreObservable(() => this.generalConfig().prejoin);
	prejoinDisplayParticipantName$: Observable<boolean> = this.toStoreObservable(() => this.generalConfig().prejoinDisplayParticipantName);
	showDisconnectionDialog$: Observable<boolean> = this.toStoreObservable(() => this.generalConfig().showDisconnectionDialog);
	showThemeSelector$: Observable<boolean> = this.toStoreObservable(() => this.generalConfig().showThemeSelector);
	recordingStreamBaseUrl$: Observable<string> = this.toStoreObservable(() => this.generalConfig().recordingStreamBaseUrl);
	e2eeKey$: Observable<string | undefined> = this.toStoreObservable(() => this.generalConfig().e2eeKey);

	// Stream observables
	videoEnabled$: Observable<boolean> = this.toStoreObservable(() => this.streamConfig().videoEnabled);
	audioEnabled$: Observable<boolean> = this.toStoreObservable(() => this.streamConfig().audioEnabled);
	displayParticipantName$: Observable<boolean> = this.toStoreObservable(() => this.streamConfig().displayParticipantName);
	displayAudioDetection$: Observable<boolean> = this.toStoreObservable(() => this.streamConfig().displayAudioDetection);
	streamVideoControls$: Observable<boolean> = this.toStoreObservable(() => this.streamConfig().videoControls);
	participantItemMuteButton$: Observable<boolean> = this.toStoreObservable(() => this.streamConfig().participantItemMuteButton);

	// Toolbar observables
	cameraButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().camera);
	microphoneButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().microphone);
	screenshareButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().screenshare);
	fullscreenButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().fullscreen);
	captionsButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().captions);
	toolbarSettingsButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().settings);
	leaveButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().leave);
	participantsPanelButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().participantsPanel);
	chatPanelButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().chatPanel);
	activitiesPanelButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().activitiesPanel);
	displayRoomName$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().displayRoomName);
	roomName$: Observable<string> = this.toStoreObservable(() => this.toolbarConfig().roomName);
	brandingLogo$: Observable<string> = this.toStoreObservable(() => this.toolbarConfig().brandingLogo);
	displayLogo$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().displayLogo);
	toolbarAdditionalButtonsPosition$: Observable<ToolbarAdditionalButtonsPosition> = this.toStoreObservable(
		() => this.toolbarConfig().additionalButtonsPosition
	);
	backgroundEffectsButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().backgroundEffects);
	recordingButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().recording);
	toolbarViewRecordingsButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().viewRecordings);
	broadcastingButton$: Observable<boolean> = this.toStoreObservable(() => this.toolbarConfig().broadcasting);

	// Recording activity observables
	recordingActivity$: Observable<boolean> = this.toStoreObservable(() => this.recordingActivityConfig().enabled);
	recordingActivityReadOnly$: Observable<boolean> = this.toStoreObservable(() => this.recordingActivityConfig().readOnly);
	recordingActivityShowControls$: Observable<RecordingControls> = this.toStoreObservable(
		() => this.recordingActivityConfig().showControls,
		(prev, curr) =>
			prev.play === curr.play &&
			prev.download === curr.download &&
			prev.delete === curr.delete &&
			prev.externalView === curr.externalView
	);
	recordingActivityStartStopRecordingButton$: Observable<boolean> = this.toStoreObservable(
		() => this.recordingActivityConfig().startStopButton
	);
	recordingActivityViewRecordingsButton$: Observable<boolean> = this.toStoreObservable(
		() => this.recordingActivityConfig().viewRecordingsButton
	);
	recordingActivityShowRecordingsList$: Observable<boolean> = this.toStoreObservable(
		() => this.recordingActivityConfig().showRecordingsList
	);

	// Admin observables
	adminRecordingsList$: Observable<RecordingInfo[]> = this.toStoreObservable(
		() => this.adminConfig().recordingsList,
		(prev, curr) => prev.length === curr.length && prev.every((item, index) => this.deepEqual(item, curr[index]))
	);
	adminLoginError$: Observable<any> = this.toStoreObservable(() => this.adminConfig().loginError);
	adminLoginTitle$: Observable<string> = this.toStoreObservable(() => this.adminConfig().loginTitle);
	adminDashboardTitle$: Observable<string> = this.toStoreObservable(() => this.adminConfig().dashboardTitle);

	// Individual observables that don't fit into groups
	broadcastingActivity$: Observable<boolean> = this.toStoreObservable(() => this.broadcastingActivityConfig());
	layoutRemoteParticipants$: Observable<ParticipantModel[] | undefined> = this.toStoreObservable(
		() => this.layoutRemoteParticipantsConfig(),
		(prev, curr) => {
			if (prev === curr) return true;
			if (!prev || !curr) return prev === curr;
			if (prev.length !== curr.length) return false;
			return prev.every((item, index) => this.deepEqual(item, curr[index]));
		}
	);

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
	 * Update multiple admin configuration properties at once
	 */
	updateAdminConfig(partialConfig: Partial<AdminConfig>): void {
		this.adminConfig.update((current) => ({ ...current, ...partialConfig }));
	}

	/**
	 * Update recording controls specifically with batch support
	 */
	updateRecordingControls(partialControls: Partial<RecordingControls>): void {
		const current = this.recordingActivityConfig();
		const updatedControls = { ...current.showControls, ...partialControls };
		this.updateRecordingActivityConfig({ showControls: updatedControls });
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

	getShowDisconnectionDialog(): boolean {
		return this.generalConfig().showDisconnectionDialog;
	}

	getRecordingStreamBaseUrl(): string {
		let baseUrl = this.generalConfig().recordingStreamBaseUrl;
		// Add trailing slash if not present
		baseUrl += baseUrl.endsWith('/') ? '' : '/';
		return baseUrl;
	}

	getE2EEKey(): string | undefined {
		return this.generalConfig().e2eeKey;
	}

	// Stream configuration methods

	isVideoEnabled(): boolean {
		return this.streamConfig().videoEnabled;
	}

	isAudioEnabled(): boolean {
		return this.streamConfig().audioEnabled;
	}

	// Toolbar configuration methods

	getRoomName(): string {
		return this.toolbarConfig().roomName;
	}

	setBroadcastingButton(broadcastingButton: boolean) {
		this.updateToolbarConfig({ broadcasting: broadcastingButton });
	}

	showBackgroundEffectsButton(): boolean {
		return this.toolbarConfig().backgroundEffects;
	}

	// Activity methods (these remain individual as they don't fit cleanly into toolbar config)

	setBroadcastingActivity(broadcastingActivity: boolean) {
		this.broadcastingActivityConfig.set(broadcastingActivity);
	}

	// Internals
	setLayoutRemoteParticipants(participants: ParticipantModel[] | undefined) {
		this.layoutRemoteParticipantsConfig.set(participants);
	}

	// Recording Activity Configuration methods

	showRecordingActivityRecordingsList(): boolean {
		return this.recordingActivityConfig().showRecordingsList;
	}
}
