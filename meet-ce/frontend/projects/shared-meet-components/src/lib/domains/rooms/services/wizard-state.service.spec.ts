import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	MEET_PERMISSION_KEYS,
	MeetRecordingAutoStartMode,
	MeetRecordingLayout,
	MeetRoomMemberPermissions
} from '@openvidu-meet/typings';
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
		// First "session": the user reaches the recording trigger and picks a threshold...
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

	it('flags the two steps that hold each side of the conflict', () => {
		service.updateStepData({
			config: {
				maxParticipants: 1,
				recording: { autoStart: MeetRecordingAutoStartMode.WHEN_SECOND_PARTICIPANT_JOINS }
			}
		});

		expect(service.stepsWithAutoStartWarning()).toEqual([WizardStepId.MEETING, WizardStepId.RECORDING]);
	});
});

/**
 * One step per concept of the product: the room itself, the meetings held in it, their recording,
 * and who may do what. Room access comes last because its permissions depend on the features the
 * earlier steps turn on.
 */
describe('RoomWizardStateService.initializeWizard (steps)', () => {
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

	it('orders the steps room details, meeting, recording, room access', () => {
		service.initializeWizard(false);

		expect(service.steps().map((step) => step.id)).toEqual([
			WizardStepId.ROOM_DETAILS,
			WizardStepId.MEETING,
			WizardStepId.RECORDING,
			WizardStepId.ROOM_ACCESS
		]);
		expect(service.currentStep()?.id).toBe(WizardStepId.ROOM_DETAILS);
	});

	it('opens an edited room on the Meeting step, since the room details cannot change', () => {
		service.initializeWizard(true, { roomName: 'Existing room' });

		expect(service.currentStep()?.id).toBe(WizardStepId.MEETING);
	});

	it('prefills the whole recording step, trigger and layout included, from the edited room', () => {
		service.initializeWizard(true, {
			roomName: 'Existing room',
			config: {
				recording: {
					enabled: true,
					autoStart: MeetRecordingAutoStartMode.WHEN_MODERATOR_JOINS,
					layout: MeetRecordingLayout.SPEAKER
				}
			},
			access: { anonymous: { recording: { enabled: false } } }
		});

		expect(service.getStepById(WizardStepId.RECORDING)!.formGroup.getRawValue()).toEqual({
			recordingEnabled: true,
			trigger: MeetRecordingAutoStartMode.WHEN_MODERATOR_JOINS,
			layout: MeetRecordingLayout.SPEAKER,
			anonymousRecordingEnabled: false
		});
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
		service.getStepById(WizardStepId.MEETING)!.formGroup.controls.maxDurationMinutes;

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

	const meetingControls = () => service.getStepById(WizardStepId.MEETING)!.formGroup.controls;

	it('starts a create-mode session with both devices active, matching the backend creation default', () => {
		service.initializeWizard(false);

		expect(meetingControls().initialAudioActive.value).toBe(true);
		expect(meetingControls().initialVideoActive.value).toBe(true);
	});

	it('prefills the toggles from the edited room rather than the creation default', () => {
		service.initializeWizard(true, {
			roomName: 'Existing room',
			config: { initialAudioActive: false, initialVideoActive: false }
		});

		expect(meetingControls().initialAudioActive.value).toBe(false);
		expect(meetingControls().initialVideoActive.value).toBe(false);
	});
});

/**
 * The wizard is where a room's permissions and configuration are decided, and it proposes them
 * before the user reads a single toggle: whatever these defaults say is what most rooms are
 * created with. They are meant to match the room the backend creates when nobody configures one,
 * which is a claim that has to be held somewhere.
 */
describe('RoomWizardStateService.initializeWizard (the room it proposes)', () => {
	let service: RoomWizardStateService;

	const everyPermission = (granted: boolean): MeetRoomMemberPermissions =>
		MEET_PERMISSION_KEYS.reduce(
			(permissions, key) => ({ ...permissions, [key]: granted }),
			{} as MeetRoomMemberPermissions
		);

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

	it('proposes a moderator who may do everything and a speaker who may not moderate', () => {
		expect(service.roomOptions().roles).toEqual({
			moderator: { permissions: everyPermission(true) },
			speaker: {
				permissions: {
					...everyPermission(true),
					recordingControl: false,
					recordingDelete: false,
					roomShareAccessLinks: false,
					participantPromote: false,
					participantKick: false,
					participantMute: false,
					meetingEnd: false
				}
			}
		});
	});

	it('proposes recording, chat, captions and virtual backgrounds on, and end-to-end encryption off', () => {
		expect(service.roomOptions().config).toEqual({
			recording: { enabled: true, layout: MeetRecordingLayout.GRID },
			chat: { enabled: true },
			virtualBackground: { enabled: true },
			e2ee: { enabled: false },
			captions: { enabled: true },
			initialAudioActive: true,
			initialVideoActive: true
		});
	});

	it('proposes a room anyone with a link can join, and no access for registered users', () => {
		expect(service.roomOptions().access).toEqual({
			anonymous: {
				moderator: { enabled: true },
				speaker: { enabled: true },
				recording: { enabled: true }
			},
			user: { enabled: false }
		});
	});
});
