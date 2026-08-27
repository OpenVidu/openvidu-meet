import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetRecordingAutoStartMode } from '@openvidu-meet/typings';
import { TranslateService } from '../../../shared/services/i18n/translate.service';
import { RoomWizardStateService } from './wizard-state.service';

/**
 * B4 (MEET-BRANCH-AUDIT-FINDINGS.md): RoomWizardStateService is a root singleton with no reset on
 * every wizard entry — only on Cancel and on the create/update `finally`. Leaving the wizard any
 * other way (browser-back, a navbar link) skips those, so `initializeWizard`'s merge-onto-stale-state
 * lets a previous, abandoned session's choices ride into the next one.
 */
describe('RoomWizardStateService — B4: stale state leaking across wizard entries', () => {
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
 * B5 / F7 (MEET-BRANCH-AUDIT-FINDINGS.md): nothing client-side stopped `maxParticipants` and the
 * recording auto-start trigger from being set to a combination the backend can only reject (e.g.
 * `maxParticipants: 1` with `when_second_participant_joins`). `recordingAutoStartUnreachable`
 * evaluates the same rule the backend does, from the same shared typings preset data, so Finish can
 * be blocked before a doomed request is ever sent.
 */
describe('RoomWizardStateService — B5/F7: cross-field guard for an unreachable recording auto-start', () => {
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
