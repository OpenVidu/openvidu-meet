import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ParticipantModel } from '../../models/participant.model';
import { ToolbarAdditionalButtonsPosition } from '../../models/toolbar.model';
import { MeetingUiConfigService } from './meeting-ui-config.service';

/**
 * Every control a participant sees is switched here: the host's attributes and the room
 * configuration are written into this store and the templates bind to its selectors. A default
 * flipped, or a selector reading the wrong field, shows or hides part of the meeting without
 * anything else noticing.
 */
describe('MeetingUiConfigService', () => {
	let service: MeetingUiConfigService;

	const snapshot = () => ({
		tokenError: service.tokenErrorSignal(),
		participantName: service.participantNameSignal(),
		e2eeKey: service.e2eeKeySignal(),
		displayParticipantName: service.displayParticipantNameSignal(),
		displayAudioDetection: service.displayAudioDetectionSignal(),
		streamVideoControls: service.streamVideoControlsSignal(),
		participantItemMuteButton: service.participantItemMuteButtonSignal(),
		showCameraControls: service.showCameraControlsSignal(),
		showMicrophoneControls: service.showMicrophoneControlsSignal(),
		screenshareButton: service.screenshareButtonSignal(),
		fullscreenButton: service.fullscreenButtonSignal(),
		toolbarSettingsButton: service.toolbarSettingsButtonSignal(),
		leaveButton: service.leaveButtonSignal(),
		participantsPanelButton: service.participantsPanelButtonSignal(),
		chatPanelButton: service.chatPanelButtonSignal(),
		chatInputEnabled: service.chatInputEnabledSignal(),
		activitiesPanelButton: service.activitiesPanelButtonSignal(),
		displayRoomName: service.displayRoomNameSignal(),
		roomName: service.roomNameSignal(),
		brandingLogo: service.brandingLogoSignal(),
		displayLogo: service.displayLogoSignal(),
		showThemeSelector: service.showThemeSelectorSignal(),
		additionalButtonsPosition: service.toolbarAdditionalButtonsPositionSignal(),
		backgroundEffectsButton: service.backgroundEffectsButtonSignal(),
		recordingButton: service.recordingButtonSignal(),
		toolbarViewRecordingsButton: service.toolbarViewRecordingsButtonSignal(),
		recordingActivity: service.recordingActivitySignal(),
		recordingActivityStartStopButton: service.recordingActivityStartStopRecordingButtonSignal(),
		recordingActivityViewRecordingsButton: service.recordingActivityViewRecordingsButtonSignal(),
		layoutRemoteParticipants: service.layoutRemoteParticipantsSignal()
	});

	const DEFAULTS: ReturnType<typeof snapshot> = {
		tokenError: null,
		participantName: '',
		e2eeKey: undefined,
		displayParticipantName: true,
		displayAudioDetection: true,
		streamVideoControls: true,
		participantItemMuteButton: true,
		showCameraControls: true,
		showMicrophoneControls: true,
		screenshareButton: true,
		fullscreenButton: true,
		toolbarSettingsButton: true,
		leaveButton: true,
		participantsPanelButton: true,
		chatPanelButton: true,
		chatInputEnabled: true,
		activitiesPanelButton: true,
		displayRoomName: true,
		roomName: '',
		brandingLogo: '',
		displayLogo: true,
		showThemeSelector: false,
		additionalButtonsPosition: ToolbarAdditionalButtonsPosition.AFTER_MENU,
		backgroundEffectsButton: true,
		recordingButton: true,
		toolbarViewRecordingsButton: false,
		recordingActivity: true,
		recordingActivityStartStopButton: true,
		recordingActivityViewRecordingsButton: false,
		layoutRemoteParticipants: undefined
	};

	const remoteParticipants = [{ identity: 'ana' }] as unknown as ParticipantModel[];

	beforeEach(() => {
		TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), MeetingUiConfigService] });
		service = TestBed.inject(MeetingUiConfigService);
	});

	// A meeting nobody configured shows the whole product: the two exceptions are the theme
	// selector and the recordings list, which the host opts into.
	it('starts with the configuration a meeting opens with', () => {
		expect(snapshot()).toEqual(DEFAULTS);
	});

	it('routes every write to the selector the templates read', () => {
		service.updateGeneralConfig({
			livekitUrl: 'wss://livekit.example.com',
			tokenError: { error: 'expired' },
			participantName: 'Ana',
			prejoin: false,
			showThemeSelector: true,
			e2eeKey: 'a-shared-secret'
		});
		service.updateToolbarConfig({
			screenshare: false,
			fullscreen: false,
			settings: false,
			leave: false,
			participantsPanel: false,
			chatPanel: false,
			activitiesPanel: false,
			displayRoomName: false,
			roomName: 'Weekly sync',
			displayLogo: false,
			backgroundEffects: false,
			recording: false,
			viewRecordings: true,
			brandingLogo: 'https://host.example.com/logo.png',
			additionalButtonsPosition: ToolbarAdditionalButtonsPosition.BEFORE_MENU
		});
		service.updateStreamConfig({
			displayParticipantName: false,
			displayAudioDetection: false,
			videoControls: false,
			participantItemMuteButton: false
		});
		service.updateRecordingActivityConfig({ enabled: false, startStopButton: false, viewRecordingsButton: true });
		service.setChatInputEnabled(false);
		service.setShowCameraControls(false);
		service.setShowMicrophoneControls(false);
		service.setLayoutRemoteParticipants(remoteParticipants);

		expect(snapshot()).toEqual({
			tokenError: { error: 'expired' },
			participantName: 'Ana',
			e2eeKey: 'a-shared-secret',
			displayParticipantName: false,
			displayAudioDetection: false,
			streamVideoControls: false,
			participantItemMuteButton: false,
			showCameraControls: false,
			showMicrophoneControls: false,
			screenshareButton: false,
			fullscreenButton: false,
			toolbarSettingsButton: false,
			leaveButton: false,
			participantsPanelButton: false,
			chatPanelButton: false,
			chatInputEnabled: false,
			activitiesPanelButton: false,
			displayRoomName: false,
			roomName: 'Weekly sync',
			brandingLogo: 'https://host.example.com/logo.png',
			displayLogo: false,
			showThemeSelector: true,
			additionalButtonsPosition: ToolbarAdditionalButtonsPosition.BEFORE_MENU,
			backgroundEffectsButton: false,
			recordingButton: false,
			toolbarViewRecordingsButton: true,
			recordingActivity: false,
			recordingActivityStartStopButton: false,
			recordingActivityViewRecordingsButton: true,
			layoutRemoteParticipants: remoteParticipants
		});
	});

	// The updates are partial by contract: a host that sets one attribute must not reset the rest
	// of the group to undefined.
	it('leaves the rest of a group alone when a single entry is written', () => {
		service.updateGeneralConfig({ participantName: 'Ana' });
		service.updateToolbarConfig({ screenshare: false });
		service.updateStreamConfig({ videoControls: false });
		service.updateRecordingActivityConfig({ enabled: false });

		expect(snapshot()).toEqual({
			...DEFAULTS,
			participantName: 'Ana',
			screenshareButton: false,
			streamVideoControls: false,
			recordingActivity: false
		});
	});

	it('answers the direct reads from the same state as the selectors', () => {
		expect({
			livekitUrl: service.getLivekitUrl(),
			prejoin: service.showPrejoin(),
			e2eeKey: service.getE2EEKey(),
			participantName: service.getCurrentParticipantName(),
			roomName: service.getRoomName(),
			backgroundEffects: service.showBackgroundEffectsButton()
		}).toEqual({
			livekitUrl: '',
			prejoin: true,
			e2eeKey: undefined,
			participantName: '',
			roomName: '',
			backgroundEffects: true
		});

		service.updateGeneralConfig({
			livekitUrl: 'wss://livekit.example.com',
			prejoin: false,
			e2eeKey: 'a-shared-secret',
			participantName: 'Ana'
		});
		service.updateToolbarConfig({ roomName: 'Weekly sync', backgroundEffects: false });

		expect({
			livekitUrl: service.getLivekitUrl(),
			prejoin: service.showPrejoin(),
			e2eeKey: service.getE2EEKey(),
			participantName: service.getCurrentParticipantName(),
			roomName: service.getRoomName(),
			backgroundEffects: service.showBackgroundEffectsButton()
		}).toEqual({
			livekitUrl: 'wss://livekit.example.com',
			prejoin: false,
			e2eeKey: 'a-shared-secret',
			participantName: 'Ana',
			roomName: 'Weekly sync',
			backgroundEffects: false
		});
	});
});
