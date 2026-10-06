import { provideZonelessChangeDetection, signal } from '@angular/core';
import { MeetRecordingInfo } from '@openvidu-meet/typings';
import { TestBed } from '@angular/core/testing';
import { MeetParticipantModerationAction } from '@openvidu-meet/typings';
import {
	LocalMediaService,
	MeetingPhaseService,
	MeetingViewPhase,
	RecordingState,
	RecordingStateInfo,
	ScreenShareService,
	MeetingLiveKitService
} from '../../meeting/openvidu-components';
import { RecordingService as RecordingStateService } from '../../meeting/openvidu-components/services/recording/recording.service';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';
import { MeetingHandService } from '../../meeting/services/meeting-hand.service';
import { MeetingModerationService } from '../../meeting/services/meeting-moderation.service';
import { RecordingService } from '../../recordings/services/recording.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { EmbeddedCommandService } from './embedded-command.service';

class LoggerServiceStub {
	readonly warn = jasmine.createSpy('warn');
	readonly error = jasmine.createSpy('error');

	get() {
		return { d: () => {}, w: this.warn, e: this.error };
	}
}

const ROOM_ID = 'room1';
const IDENTITY = 'participant-1';
const RECORDING_ID = 'rec-1';
const STARTED_RECORDING_ID = 'rec-new';

/**
 * The command × phase × permission matrix of the embedded command bridge. Both transports (the
 * webcomponent's element methods and the iframe postMessage bridge) land on this service, so what
 * is frozen here is the acceptance/rejection behaviour of the whole embedding API: which commands
 * need a permission, which need a connected meeting, and — the reason the phase is declared per
 * command — that the media toggles keep working from the prejoin screen, where the room does not
 * exist yet.
 */
describe('EmbeddedCommandService', () => {
	let service: EmbeddedCommandService;
	let moderationService: jasmine.SpyObj<MeetingModerationService>;
	let localMedia: {
		setMicrophoneEnabled: jasmine.Spy;
		setCameraEnabled: jasmine.Spy;
		microphone: { enabled: ReturnType<typeof signal<boolean>> };
		camera: { enabled: ReturnType<typeof signal<boolean>> };
	};
	let screenShare: { setEnabled: jasmine.Spy; enabled: ReturnType<typeof signal<boolean>> };
	let recordingService: jasmine.SpyObj<RecordingService>;
	let handService: jasmine.SpyObj<MeetingHandService>;
	let recordingStatus: ReturnType<typeof signal<RecordingStateInfo>>;
	let setRecordingStarting: jasmine.Spy;
	let liveKitService: { isSessionActive: ReturnType<typeof signal<boolean>>; disconnect: jasmine.Spy };
	let phase: ReturnType<typeof signal<MeetingViewPhase>>;
	let hasPermission: jasmine.Spy;
	let logger: LoggerServiceStub;
	let roomId: ReturnType<typeof signal<string | undefined>>;
	let microphoneEnabled: ReturnType<typeof signal<boolean>>;
	let cameraEnabled: ReturnType<typeof signal<boolean>>;
	let screenShareEnabled: ReturnType<typeof signal<boolean>>;

	// Defaults: active session, not on the prejoin screen, every permission granted — each test narrows one axis.
	beforeEach(() => {
		moderationService = jasmine.createSpyObj<MeetingModerationService>('MeetingModerationService', [
			'endMeeting',
			'kickParticipant',
			'muteParticipant',
			'muteAllParticipants',
			'changeParticipantRole'
		]);
		moderationService.endMeeting.and.resolveTo();
		moderationService.kickParticipant.and.resolveTo();
		moderationService.muteParticipant.and.resolveTo();
		moderationService.muteAllParticipants.and.resolveTo();
		moderationService.changeParticipantRole.and.resolveTo();

		microphoneEnabled = signal(true);
		cameraEnabled = signal(true);
		screenShareEnabled = signal(false);
		localMedia = {
			setMicrophoneEnabled: jasmine.createSpy('setMicrophoneEnabled').and.resolveTo(),
			setCameraEnabled: jasmine.createSpy('setCameraEnabled').and.resolveTo(),
			microphone: { enabled: microphoneEnabled },
			camera: { enabled: cameraEnabled }
		};
		screenShare = { setEnabled: jasmine.createSpy('setEnabled').and.resolveTo(), enabled: screenShareEnabled };

		recordingService = jasmine.createSpyObj<RecordingService>('RecordingService', [
			'startRecording',
			'stopRecording'
		]);
		recordingService.startRecording.and.resolveTo({ recordingId: STARTED_RECORDING_ID } as MeetRecordingInfo);
		recordingService.stopRecording.and.resolveTo();

		handService = jasmine.createSpyObj<MeetingHandService>('MeetingHandService', [
			'raise',
			'lower',
			'lowerAll',
			'isOwn'
		]);
		handService.raise.and.resolveTo();
		handService.lower.and.resolveTo();
		handService.lowerAll.and.resolveTo();
		handService.isOwn.and.callFake(
			(participantIdentity?: string) => !participantIdentity || participantIdentity === IDENTITY
		);
		recordingStatus = signal<RecordingStateInfo>({
			id: RECORDING_ID,
			status: RecordingState.STARTED,
			elapsed: new Date(0)
		});
		setRecordingStarting = jasmine
			.createSpy('setRecordingStarting')
			.and.callFake((id: string) =>
				recordingStatus.set({ id, status: RecordingState.STARTING, elapsed: new Date(0) })
			);

		liveKitService = {
			isSessionActive: signal(true),
			disconnect: jasmine.createSpy('disconnect').and.resolveTo()
		};
		phase = signal<MeetingViewPhase>('live');
		hasPermission = jasmine.createSpy('hasPermission').and.returnValue(true);
		roomId = signal<string | undefined>(ROOM_ID);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				EmbeddedCommandService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: MeetingModerationService, useValue: moderationService },
				{ provide: LocalMediaService, useValue: localMedia as unknown as LocalMediaService },
				{ provide: ScreenShareService, useValue: screenShare as unknown as ScreenShareService },
				{ provide: RecordingService, useValue: recordingService },
				{ provide: MeetingHandService, useValue: handService },
				{
					provide: RecordingStateService,
					useValue: { recordingStatus, setRecordingStarting } as unknown as RecordingStateService
				},
				{ provide: MeetingLiveKitService, useValue: liveKitService as unknown as MeetingLiveKitService },
				{ provide: MeetingPhaseService, useValue: { phase } as unknown as MeetingPhaseService },
				{
					provide: RoomMemberContextService,
					useValue: { hasPermission } as unknown as RoomMemberContextService
				},
				{ provide: MeetingContextService, useValue: { roomId } as unknown as MeetingContextService }
			]
		});

		service = TestBed.inject(EmbeddedCommandService);
		logger = TestBed.inject(LoggerService) as unknown as LoggerServiceStub;
	});

	describe('phase gating', () => {
		it('runs mediaToggleAudio on the prejoin screen (no session yet)', async () => {
			liveKitService.isSessionActive.set(false);
			phase.set('prejoin');

			await service.mediaToggleAudio(false);

			expect(localMedia.setMicrophoneEnabled).toHaveBeenCalledOnceWith(false);
		});

		it('runs mediaToggleVideo on the prejoin screen (no session yet)', async () => {
			liveKitService.isSessionActive.set(false);
			phase.set('prejoin');

			await service.mediaToggleVideo(false);

			expect(localMedia.setCameraEnabled).toHaveBeenCalledOnceWith(false);
		});

		it('rejects mediaToggleAudio when neither the session nor the prejoin screen is active', async () => {
			liveKitService.isSessionActive.set(false);
			phase.set('loading');

			await service.mediaToggleAudio(true);

			expect(localMedia.setMicrophoneEnabled).not.toHaveBeenCalled();
		});

		it('rejects mediaToggleVideo when neither the session nor the prejoin screen is active', async () => {
			liveKitService.isSessionActive.set(false);
			phase.set('loading');

			await service.mediaToggleVideo(true);

			expect(localMedia.setCameraEnabled).not.toHaveBeenCalled();
		});

		it('rejects mediaToggleScreenShare on the prejoin screen', async () => {
			liveKitService.isSessionActive.set(false);
			phase.set('prejoin');

			await service.mediaToggleScreenShare(true);

			expect(screenShare.setEnabled).not.toHaveBeenCalled();
		});

		it('rejects meetingEnd with no active session, even with the permission', async () => {
			liveKitService.isSessionActive.set(false);

			await service.meetingEnd();

			expect(moderationService.endMeeting).not.toHaveBeenCalled();
		});

		it('rejects participantKick with no active session', async () => {
			liveKitService.isSessionActive.set(false);

			await service.participantKick(IDENTITY);

			expect(moderationService.kickParticipant).not.toHaveBeenCalled();
		});

		it('rejects participantMute with no active session', async () => {
			liveKitService.isSessionActive.set(false);

			await service.participantMute(IDENTITY, { audioActive: false });

			expect(moderationService.muteParticipant).not.toHaveBeenCalled();
		});

		it('rejects recordingStart with no active session', async () => {
			liveKitService.isSessionActive.set(false);

			await service.recordingStart();

			expect(recordingService.startRecording).not.toHaveBeenCalled();
		});

		it('rejects recordingStop with no active session', async () => {
			liveKitService.isSessionActive.set(false);

			await service.recordingStop();

			expect(recordingService.stopRecording).not.toHaveBeenCalled();
		});

		it('rejects participantUpdateRole with no active session', async () => {
			liveKitService.isSessionActive.set(false);

			await service.participantUpdateRole(IDENTITY, MeetParticipantModerationAction.UPGRADE);

			expect(moderationService.changeParticipantRole).not.toHaveBeenCalled();
		});

		it('rejects meetingLeave with no active session (disconnect would be a no-op anyway)', async () => {
			liveKitService.isSessionActive.set(false);

			await service.meetingLeave();

			expect(liveKitService.disconnect).not.toHaveBeenCalled();
		});

		it('runs meetingEnd while the session is active (covers reconnecting)', async () => {
			await service.meetingEnd();

			expect(moderationService.endMeeting).toHaveBeenCalledOnceWith(ROOM_ID);
		});

		it('runs mediaToggleScreenShare while the session is active', async () => {
			await service.mediaToggleScreenShare(true);

			expect(screenShare.setEnabled).toHaveBeenCalledOnceWith(true);
		});

		it('re-evaluates the phase on every command, not just the first', async () => {
			await service.meetingLeave();
			expect(liveKitService.disconnect).toHaveBeenCalledTimes(1);

			// Session ended after the first command: the next one must be rejected.
			liveKitService.isSessionActive.set(false);
			await service.meetingEnd();
			expect(moderationService.endMeeting).not.toHaveBeenCalled();
		});

		// There is no public event telling the host a command did nothing, so this warning is
		// currently the only diagnostic available for a rejected command.
		it('logs a warning when a command is rejected for the meeting phase', async () => {
			liveKitService.isSessionActive.set(false);

			await service.meetingEnd();

			expect(logger.warn).toHaveBeenCalledWith('meetingEnd rejected: not available in the current meeting phase');
		});
	});

	describe('permission gating', () => {
		it('rejects meetingEnd without the meetingEnd permission', async () => {
			hasPermission.and.returnValue(false);

			await service.meetingEnd();

			expect(hasPermission).toHaveBeenCalledWith('meetingEnd');
			expect(moderationService.endMeeting).not.toHaveBeenCalled();
		});

		it('rejects participantKick without the participantKick permission', async () => {
			hasPermission.and.returnValue(false);

			await service.participantKick(IDENTITY);

			expect(hasPermission).toHaveBeenCalledWith('participantKick');
			expect(moderationService.kickParticipant).not.toHaveBeenCalled();
		});

		it('rejects participantMute without the participantMute permission', async () => {
			hasPermission.and.returnValue(false);

			await service.participantMute(IDENTITY, { audioActive: false });

			expect(hasPermission).toHaveBeenCalledWith('participantMute');
			expect(moderationService.muteParticipant).not.toHaveBeenCalled();
		});

		it('gates participantMuteAll on the same participantMute permission', async () => {
			await service.participantMuteAll({ videoActive: false });

			expect(hasPermission).toHaveBeenCalledWith('participantMute');
			expect(moderationService.muteAllParticipants).toHaveBeenCalledOnceWith(ROOM_ID, { videoActive: false });
		});

		it('rejects participantUpdateRole without the participantPromote permission', async () => {
			hasPermission.and.returnValue(false);

			await service.participantUpdateRole(IDENTITY, MeetParticipantModerationAction.UPGRADE);

			expect(hasPermission).toHaveBeenCalledWith('participantPromote');
			expect(moderationService.changeParticipantRole).not.toHaveBeenCalled();
		});

		// Raising and lowering one's own hand is never gated: the room toggle is the server's to enforce.
		it('raises the own hand without checking any permission', async () => {
			hasPermission.and.returnValue(false);

			await service.participantHandRaise();

			expect(hasPermission).not.toHaveBeenCalled();
			expect(handService.raise).toHaveBeenCalledTimes(1);
		});

		it('lowers the own hand without checking any permission, naming nobody or oneself', async () => {
			hasPermission.and.returnValue(false);

			await service.participantHandLower();
			await service.participantHandLower(IDENTITY);

			expect(hasPermission).not.toHaveBeenCalled();
			expect(handService.lower).toHaveBeenCalledTimes(2);
			expect(handService.lower).toHaveBeenCalledWith(IDENTITY);
		});

		it('gates lowering another participant hand on participantHandLower', async () => {
			await service.participantHandLower('participant-2');

			expect(hasPermission).toHaveBeenCalledWith('participantHandLower');
			expect(handService.lower).toHaveBeenCalledOnceWith('participant-2');
		});

		it('rejects lowering another participant hand without participantHandLower', async () => {
			hasPermission.and.returnValue(false);

			await service.participantHandLower('participant-2');

			expect(handService.lower).not.toHaveBeenCalled();
		});

		it('gates participantHandLowerAll on participantHandLower', async () => {
			await service.participantHandLowerAll();

			expect(hasPermission).toHaveBeenCalledWith('participantHandLower');
			expect(handService.lowerAll).toHaveBeenCalledTimes(1);
		});

		it('rejects a hand command before the meeting is connected', async () => {
			liveKitService.isSessionActive.set(false);

			await service.participantHandRaise();

			expect(handService.raise).not.toHaveBeenCalled();
		});

		it('rejects mediaToggleAudio without the mediaPublishAudio permission', async () => {
			hasPermission.and.returnValue(false);

			await service.mediaToggleAudio(false);

			expect(hasPermission).toHaveBeenCalledWith('mediaPublishAudio');
			expect(localMedia.setMicrophoneEnabled).not.toHaveBeenCalled();
		});

		it('rejects mediaToggleVideo without the mediaPublishVideo permission', async () => {
			hasPermission.and.returnValue(false);

			await service.mediaToggleVideo(false);

			expect(hasPermission).toHaveBeenCalledWith('mediaPublishVideo');
			expect(localMedia.setCameraEnabled).not.toHaveBeenCalled();
		});

		it('rejects mediaToggleScreenShare without the mediaShareScreen permission', async () => {
			hasPermission.and.returnValue(false);

			await service.mediaToggleScreenShare(true);

			expect(hasPermission).toHaveBeenCalledWith('mediaShareScreen');
			expect(screenShare.setEnabled).not.toHaveBeenCalled();
		});

		it('rejects recordingStart without the recordingControl permission', async () => {
			hasPermission.and.returnValue(false);

			await service.recordingStart();

			expect(hasPermission).toHaveBeenCalledWith('recordingControl');
			expect(recordingService.startRecording).not.toHaveBeenCalled();
		});

		it('rejects recordingStop without the recordingControl permission', async () => {
			hasPermission.and.returnValue(false);

			await service.recordingStop();

			expect(hasPermission).toHaveBeenCalledWith('recordingControl');
			expect(recordingService.stopRecording).not.toHaveBeenCalled();
		});

		it('meetingLeave requires no permission: any participant may leave', async () => {
			hasPermission.and.returnValue(false);

			await service.meetingLeave();

			expect(hasPermission).not.toHaveBeenCalled();
			expect(liveKitService.disconnect).toHaveBeenCalledTimes(1);
		});

		// There is no public event telling the host a command did nothing, so this warning is
		// currently the only diagnostic available for a rejected command.
		it('logs a warning when a command is rejected for lack of permission', async () => {
			hasPermission.and.returnValue(false);

			await service.mediaToggleAudio(false);

			expect(logger.warn).toHaveBeenCalledWith(
				"mediaToggleAudio rejected: local participant lacks the 'mediaPublishAudio' permission"
			);
		});
	});

	describe('command actions', () => {
		it('meetingEnd ends the current meeting by its room id', async () => {
			await service.meetingEnd();

			expect(moderationService.endMeeting).toHaveBeenCalledOnceWith(ROOM_ID);
		});

		it('meetingEnd is rejected when the room id is undefined', async () => {
			roomId.set(undefined);

			await service.meetingEnd();

			expect(moderationService.endMeeting).not.toHaveBeenCalled();
		});

		it('participantKick kicks the named participant from the current meeting', async () => {
			await service.participantKick(IDENTITY);

			expect(moderationService.kickParticipant).toHaveBeenCalledOnceWith(ROOM_ID, IDENTITY);
		});

		it('participantKick is rejected without a participant identity', async () => {
			await service.participantKick('');

			expect(moderationService.kickParticipant).not.toHaveBeenCalled();
		});

		// A third rejection path, inside the action itself rather than run()'s own guards, logs the
		// same way — there is no rejection a host-side developer cannot at least see in the console.
		it('logs a warning when participantKick is rejected without a participant identity', async () => {
			await service.participantKick('');

			expect(logger.warn).toHaveBeenCalledWith(
				'participantKick() called without a participant identity or room id'
			);
		});

		it('recordingStart starts a recording of the current meeting by its room id', async () => {
			await service.recordingStart();

			expect(recordingService.startRecording).toHaveBeenCalledOnceWith(ROOM_ID);
		});

		it('recordingStart is rejected when the room id is undefined', async () => {
			roomId.set(undefined);

			await service.recordingStart();

			expect(recordingService.startRecording).not.toHaveBeenCalled();
		});

		it('recordingStart hands the recording it created to the recording state', async () => {
			await service.recordingStart();

			expect(setRecordingStarting).toHaveBeenCalledOnceWith(STARTED_RECORDING_ID);
		});

		// The server reports the new recording some time after accepting it, so a host that stops right
		// away would otherwise find nothing to stop while the recording goes on.
		it('recordingStop sent right after recordingStart stops the recording that start created', async () => {
			recordingStatus.set({ status: RecordingState.STOPPED, elapsed: new Date(0) });
			let accept!: (info: MeetRecordingInfo) => void;
			recordingService.startRecording.and.returnValue(new Promise((resolve) => (accept = resolve)));

			const start = service.recordingStart();
			const stop = service.recordingStop();
			accept({ recordingId: STARTED_RECORDING_ID } as MeetRecordingInfo);
			await Promise.all([start, stop]);

			expect(recordingService.stopRecording).toHaveBeenCalledOnceWith(STARTED_RECORDING_ID);
		});

		it('recordingStop after a start that failed finds nothing to stop', async () => {
			recordingStatus.set({ status: RecordingState.STOPPED, elapsed: new Date(0) });
			recordingService.startRecording.and.rejectWith(new Error('recording disabled'));

			await service.recordingStart();
			await service.recordingStop();

			expect(recordingService.stopRecording).not.toHaveBeenCalled();
		});

		it('recordingStop stops the recording in progress by its id', async () => {
			await service.recordingStop();

			expect(recordingService.stopRecording).toHaveBeenCalledOnceWith(RECORDING_ID);
		});

		it('recordingStop is rejected, with a warning, when no recording is in progress', async () => {
			recordingStatus.set({ status: RecordingState.STOPPED, elapsed: new Date(0) });

			await service.recordingStop();

			expect(recordingService.stopRecording).not.toHaveBeenCalled();
			expect(logger.warn).toHaveBeenCalledWith('recordingStop() called but no recording is in progress');
		});

		it('participantUpdateRole applies the action to the named participant of the current meeting', async () => {
			await service.participantUpdateRole(IDENTITY, MeetParticipantModerationAction.DOWNGRADE);

			expect(moderationService.changeParticipantRole).toHaveBeenCalledOnceWith(
				ROOM_ID,
				IDENTITY,
				MeetParticipantModerationAction.DOWNGRADE
			);
		});

		it('participantUpdateRole is rejected without a participant identity', async () => {
			await service.participantUpdateRole('', MeetParticipantModerationAction.UPGRADE);

			expect(moderationService.changeParticipantRole).not.toHaveBeenCalled();
		});

		it('mediaToggleAudio passes an explicit active flag through', async () => {
			await service.mediaToggleAudio(false);

			expect(localMedia.setMicrophoneEnabled).toHaveBeenCalledOnceWith(false);
		});

		it('mediaToggleAudio without a flag inverts the current microphone state', async () => {
			microphoneEnabled.set(false);

			await service.mediaToggleAudio();

			expect(localMedia.setMicrophoneEnabled).toHaveBeenCalledOnceWith(true);
		});

		// A6 (MEET-BRANCH-AUDIT-FINDINGS.md): the webcomponent's element methods are a JS API, not a
		// typed one: `el.mediaToggleAudio('false')` reaches this service with a truthy string, not a
		// boolean. It must be treated the same as "omitted" (toggle), not as `active`.
		it('mediaToggleAudio treats a non-boolean active value as omitted (toggle), not as truthy', async () => {
			microphoneEnabled.set(true);

			await (service.mediaToggleAudio as (active?: unknown) => Promise<void>)('false');

			expect(localMedia.setMicrophoneEnabled).toHaveBeenCalledOnceWith(false);
		});

		it('mediaToggleVideo without a flag inverts the current camera state', async () => {
			cameraEnabled.set(true);

			await service.mediaToggleVideo();

			expect(localMedia.setCameraEnabled).toHaveBeenCalledOnceWith(false);
		});

		it('mediaToggleScreenShare without a flag inverts the current screen share state', async () => {
			screenShareEnabled.set(false);

			await service.mediaToggleScreenShare();

			expect(screenShare.setEnabled).toHaveBeenCalledOnceWith(true);
		});
	});

	describe('error boundary', () => {
		it('a failing action is logged, not propagated to the host', async () => {
			moderationService.endMeeting.and.rejectWith(new Error('boom'));

			await expectAsync(service.meetingEnd()).toBeResolved();
		});

		it('a failing recording start is logged, not propagated to the host', async () => {
			recordingService.startRecording.and.rejectWith(new Error('boom'));

			await expectAsync(service.recordingStart()).toBeResolved();
			expect(logger.error).toHaveBeenCalled();
		});

		it('a failing media toggle is logged, not propagated to the host', async () => {
			localMedia.setMicrophoneEnabled.and.rejectWith(new Error('boom'));

			await expectAsync(service.mediaToggleAudio(false)).toBeResolved();
		});
	});

	describe('deprecated aliases', () => {
		it('endMeeting() forwards to meetingEnd()', async () => {
			await service.endMeeting();

			expect(moderationService.endMeeting).toHaveBeenCalledOnceWith(ROOM_ID);
		});

		it('leaveRoom() forwards to meetingLeave()', async () => {
			await service.leaveRoom();

			expect(liveKitService.disconnect).toHaveBeenCalledTimes(1);
		});

		it('kickParticipant() forwards to participantKick(), identity intact', async () => {
			await service.kickParticipant(IDENTITY);

			expect(moderationService.kickParticipant).toHaveBeenCalledOnceWith(ROOM_ID, IDENTITY);
		});
	});
});
