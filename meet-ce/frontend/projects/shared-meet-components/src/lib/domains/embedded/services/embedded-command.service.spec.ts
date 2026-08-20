import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	LocalMediaControlService,
	LocalMediaStateService,
	LocalTrackService,
	MeetingLiveKitService
} from '../../meeting/openvidu-components';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';
import { MeetingModerationService } from '../../meeting/services/meeting-moderation.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { EmbeddedCommandService } from './embedded-command.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

const ROOM_ID = 'room1';
const IDENTITY = 'participant-1';

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
	let mediaControlService: jasmine.SpyObj<LocalMediaControlService>;
	let liveKitService: { isSessionActive: ReturnType<typeof signal<boolean>>; disconnect: jasmine.Spy };
	let prejoinActive: ReturnType<typeof signal<boolean>>;
	let hasPermission: jasmine.Spy;
	let roomId: ReturnType<typeof signal<string | undefined>>;
	let microphoneEnabled: ReturnType<typeof signal<boolean>>;
	let cameraEnabled: ReturnType<typeof signal<boolean>>;
	let screenShareEnabled: ReturnType<typeof signal<boolean>>;

	// Defaults: active session, not on the prejoin screen, every permission granted — each test narrows one axis.
	beforeEach(() => {
		moderationService = jasmine.createSpyObj<MeetingModerationService>('MeetingModerationService', [
			'endMeeting',
			'kickParticipant'
		]);
		moderationService.endMeeting.and.resolveTo();
		moderationService.kickParticipant.and.resolveTo();

		mediaControlService = jasmine.createSpyObj<LocalMediaControlService>('LocalMediaControlService', [
			'setMicrophoneEnabled',
			'setCameraEnabled',
			'setScreenShareEnabled'
		]);
		mediaControlService.setMicrophoneEnabled.and.resolveTo();
		mediaControlService.setCameraEnabled.and.resolveTo();
		mediaControlService.setScreenShareEnabled.and.resolveTo();

		liveKitService = {
			isSessionActive: signal(true),
			disconnect: jasmine.createSpy('disconnect').and.resolveTo()
		};
		prejoinActive = signal(false);
		hasPermission = jasmine.createSpy('hasPermission').and.returnValue(true);
		roomId = signal<string | undefined>(ROOM_ID);
		microphoneEnabled = signal(true);
		cameraEnabled = signal(true);
		screenShareEnabled = signal(false);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				EmbeddedCommandService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: MeetingModerationService, useValue: moderationService },
				{ provide: LocalMediaControlService, useValue: mediaControlService },
				{ provide: MeetingLiveKitService, useValue: liveKitService as unknown as MeetingLiveKitService },
				{ provide: LocalTrackService, useValue: { prejoinActive } as unknown as LocalTrackService },
				{
					provide: RoomMemberContextService,
					useValue: { hasPermission } as unknown as RoomMemberContextService
				},
				{ provide: MeetingContextService, useValue: { roomId } as unknown as MeetingContextService },
				{
					provide: LocalMediaStateService,
					useValue: {
						microphoneEnabled,
						cameraEnabled,
						screenShareEnabled
					} as unknown as LocalMediaStateService
				}
			]
		});

		service = TestBed.inject(EmbeddedCommandService);
	});

	describe('phase gating', () => {
		it('runs mediaToggleAudio on the prejoin screen (no session yet)', async () => {
			liveKitService.isSessionActive.set(false);
			prejoinActive.set(true);

			await service.mediaToggleAudio(false);

			expect(mediaControlService.setMicrophoneEnabled).toHaveBeenCalledOnceWith(false);
		});

		it('runs mediaToggleVideo on the prejoin screen (no session yet)', async () => {
			liveKitService.isSessionActive.set(false);
			prejoinActive.set(true);

			await service.mediaToggleVideo(false);

			expect(mediaControlService.setCameraEnabled).toHaveBeenCalledOnceWith(false);
		});

		it('rejects mediaToggleAudio when neither the session nor the prejoin screen is active', async () => {
			liveKitService.isSessionActive.set(false);
			prejoinActive.set(false);

			await service.mediaToggleAudio(true);

			expect(mediaControlService.setMicrophoneEnabled).not.toHaveBeenCalled();
		});

		it('rejects mediaToggleVideo when neither the session nor the prejoin screen is active', async () => {
			liveKitService.isSessionActive.set(false);
			prejoinActive.set(false);

			await service.mediaToggleVideo(true);

			expect(mediaControlService.setCameraEnabled).not.toHaveBeenCalled();
		});

		it('rejects mediaToggleScreenShare on the prejoin screen', async () => {
			liveKitService.isSessionActive.set(false);
			prejoinActive.set(true);

			await service.mediaToggleScreenShare(true);

			expect(mediaControlService.setScreenShareEnabled).not.toHaveBeenCalled();
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

			expect(mediaControlService.setScreenShareEnabled).toHaveBeenCalledOnceWith(true);
		});

		it('re-evaluates the phase on every command, not just the first', async () => {
			await service.meetingLeave();
			expect(liveKitService.disconnect).toHaveBeenCalledTimes(1);

			// Session ended after the first command: the next one must be rejected.
			liveKitService.isSessionActive.set(false);
			await service.meetingEnd();
			expect(moderationService.endMeeting).not.toHaveBeenCalled();
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

		it('rejects mediaToggleAudio without the mediaPublishAudio permission', async () => {
			hasPermission.and.returnValue(false);

			await service.mediaToggleAudio(false);

			expect(hasPermission).toHaveBeenCalledWith('mediaPublishAudio');
			expect(mediaControlService.setMicrophoneEnabled).not.toHaveBeenCalled();
		});

		it('rejects mediaToggleVideo without the mediaPublishVideo permission', async () => {
			hasPermission.and.returnValue(false);

			await service.mediaToggleVideo(false);

			expect(hasPermission).toHaveBeenCalledWith('mediaPublishVideo');
			expect(mediaControlService.setCameraEnabled).not.toHaveBeenCalled();
		});

		it('rejects mediaToggleScreenShare without the mediaShareScreen permission', async () => {
			hasPermission.and.returnValue(false);

			await service.mediaToggleScreenShare(true);

			expect(hasPermission).toHaveBeenCalledWith('mediaShareScreen');
			expect(mediaControlService.setScreenShareEnabled).not.toHaveBeenCalled();
		});

		it('meetingLeave requires no permission: any participant may leave', async () => {
			hasPermission.and.returnValue(false);

			await service.meetingLeave();

			expect(hasPermission).not.toHaveBeenCalled();
			expect(liveKitService.disconnect).toHaveBeenCalledTimes(1);
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

		it('mediaToggleAudio passes an explicit enabled flag through', async () => {
			await service.mediaToggleAudio(false);

			expect(mediaControlService.setMicrophoneEnabled).toHaveBeenCalledOnceWith(false);
		});

		it('mediaToggleAudio without a flag inverts the current microphone state', async () => {
			microphoneEnabled.set(false);

			await service.mediaToggleAudio();

			expect(mediaControlService.setMicrophoneEnabled).toHaveBeenCalledOnceWith(true);
		});

		it('mediaToggleVideo without a flag inverts the current camera state', async () => {
			cameraEnabled.set(true);

			await service.mediaToggleVideo();

			expect(mediaControlService.setCameraEnabled).toHaveBeenCalledOnceWith(false);
		});

		it('mediaToggleScreenShare without a flag inverts the current screen share state', async () => {
			screenShareEnabled.set(false);

			await service.mediaToggleScreenShare();

			expect(mediaControlService.setScreenShareEnabled).toHaveBeenCalledOnceWith(true);
		});
	});

	describe('error boundary', () => {
		it('a failing action is logged, not propagated to the host', async () => {
			moderationService.endMeeting.and.rejectWith(new Error('boom'));

			await expectAsync(service.meetingEnd()).toBeResolved();
		});

		it('a failing media toggle is logged, not propagated to the host', async () => {
			mediaControlService.setMicrophoneEnabled.and.rejectWith(new Error('boom'));

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
