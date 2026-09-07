import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetRecordingAutoStartMode } from '@openvidu-meet/typings';
import { TranslateService } from '../../../shared/services/i18n/translate.service';
import { WizardStepId } from '../models/wizard.model';
import { RoomWizardStateService } from './wizard-state.service';

/**
 * RoomWizardStateService is a root singleton with no reset on every wizard entry — only on Cancel
 * and on the create/update `finally`. Leaving the wizard any other way (browser-back, a navbar link)
 * skips those, so `initializeWizard`'s merge-onto-stale-state lets a previous, abandoned session's
 * choices ride into the next one.
 */
describe('RoomWizardStateService.initializeWizard (stale state does not leak across wizard entries)', () => {
	let service: RoomWizardStateService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RoomWizardStateService,
				{ provide: TranslateService, useValue: { translate: (key: string) => key } }
			]
		});
		service = TestBed.inject(RoomWizardStateService);
	});

	it('does not leak a stale autoStart selection into a brand-new create-mode session', () => {
		// First "session": the user reaches the recording-trigger step and picks a threshold...
		service.initializeWizard(false);
		service.updateStepData({
			config: { recording: { autoStart: MeetRecordingAutoStartMode.WHEN_SECOND_PARTICIPANT_JOINS } }
		});
		expect(service.roomOptions().config?.recording?.autoStart).toBe(
			MeetRecordingAutoStartMode.WHEN_SECOND_PARTICIPANT_JOINS
		);

		// ...then leaves via browser-back / a navbar link instead of Cancel or Create, so
		// resetWizard() never runs. Returning to the wizard re-enters create mode with no
		// existingData — this should start from defaults, not from what was left behind.
		service.initializeWizard(false, undefined);

		expect(service.roomOptions().config?.recording?.autoStart).toBeUndefined();
	});

	it('does not leak a stale field that the edited room genuinely omits', () => {
		service.initializeWizard(false);
		service.updateStepData({
			config: { recording: { autoStart: MeetRecordingAutoStartMode.WHEN_SECOND_PARTICIPANT_JOINS } }
		});

		// Now entering EDIT mode for a real room that has no auto-start configured at all — the
		// key is genuinely absent from the fetched room, not an explicit null.
		service.initializeWizard(true, {
			roomName: 'Existing room',
			config: {
				chat: { enabled: true },
				virtualBackground: { enabled: true },
				e2ee: { enabled: false },
				captions: { enabled: true },
				recording: { enabled: false }
			}
		});

		expect(service.roomOptions().config?.recording?.autoStart).toBeUndefined();
	});
});

/**
 * `recordingAutoStartUnreachable` evaluates the same reachability rule the backend enforces between
 * `maxParticipants` and the recording auto-start trigger, from the same shared typings preset data,
 * so Finish can be blocked before a request the backend can only reject is ever sent.
 */
describe('RoomWizardStateService.recordingAutoStartUnreachable (cross-field guard against an unreachable auto-start trigger)', () => {
	let service: RoomWizardStateService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RoomWizardStateService,
				{ provide: TranslateService, useValue: { translate: (key: string) => key } }
			]
		});
		service = TestBed.inject(RoomWizardStateService);
		service.initializeWizard(false);
	});

	it('flags a maxParticipants limit below the trigger threshold and blocks Finish', () => {
		service.updateStepData({
			config: {
				maxParticipants: 1,
				recording: { autoStart: MeetRecordingAutoStartMode.WHEN_SECOND_PARTICIPANT_JOINS }
			}
		});

		expect(service.recordingAutoStartUnreachable()).toBe(true);
		expect(service.getNavigationConfig().disableFinish).toBe(true);
	});

	it('does not flag a limit that the trigger can reach', () => {
		service.updateStepData({
			config: {
				maxParticipants: 2,
				recording: { autoStart: MeetRecordingAutoStartMode.WHEN_SECOND_PARTICIPANT_JOINS }
			}
		});

		expect(service.recordingAutoStartUnreachable()).toBe(false);
		expect(service.getNavigationConfig().disableFinish).toBe(false);
	});

	it('does not flag an unlimited room regardless of the trigger', () => {
		service.updateStepData({
			config: {
				maxParticipants: null,
				recording: { autoStart: MeetRecordingAutoStartMode.WHEN_SECOND_PARTICIPANT_JOINS }
			}
		});

		expect(service.recordingAutoStartUnreachable()).toBe(false);
	});

	it('does not flag a limited room with no auto-start trigger configured', () => {
		service.updateStepData({ config: { maxParticipants: 1 } });

		expect(service.recordingAutoStartUnreachable()).toBe(false);
	});
});

describe('RoomWizardStateService.getStepById (maxDurationMinutes control bounds)', () => {
	let service: RoomWizardStateService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RoomWizardStateService,
				{ provide: TranslateService, useValue: { translate: (key: string) => key } }
			]
		});
		service = TestBed.inject(RoomWizardStateService);
		service.initializeWizard(false);
	});

	const maxDurationMinutesControl = () =>
		service.getStepById(WizardStepId.ROOM_CONFIG)!.formGroup.controls.maxDurationMinutes;

	it('rejects a duration below one minute, which no limit can express', () => {
		maxDurationMinutesControl().setValue(0);

		expect(maxDurationMinutesControl().valid).toBe(false);
	});

	it('accepts a one-minute duration, the room being the only judge of how short is useful', () => {
		maxDurationMinutesControl().setValue(1);

		expect(maxDurationMinutesControl().valid).toBe(true);
	});

	it('accepts an empty value as unlimited', () => {
		maxDurationMinutesControl().setValue(null);

		expect(maxDurationMinutesControl().valid).toBe(true);
	});
});

describe('RoomWizardStateService.getStepById (initial media state controls)', () => {
	let service: RoomWizardStateService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RoomWizardStateService,
				{ provide: TranslateService, useValue: { translate: (key: string) => key } }
			]
		});
		service = TestBed.inject(RoomWizardStateService);
	});

	const roomConfigControls = () => service.getStepById(WizardStepId.ROOM_CONFIG)!.formGroup.controls;

	it('starts a create-mode session with both devices active, matching the backend creation default', () => {
		service.initializeWizard(false);

		expect(roomConfigControls().initialAudioActive.value).toBe(true);
		expect(roomConfigControls().initialVideoActive.value).toBe(true);
	});

	it('prefills the toggles from the edited room rather than the creation default', () => {
		service.initializeWizard(true, {
			roomName: 'Existing room',
			config: { initialAudioActive: false, initialVideoActive: false }
		});

		expect(roomConfigControls().initialAudioActive.value).toBe(false);
		expect(roomConfigControls().initialVideoActive.value).toBe(false);
	});
});
