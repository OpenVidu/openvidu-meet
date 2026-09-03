import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	EmbeddedEventName,
	LeftEventReason,
	MeetEventOrigin,
	MeetMeetingEndedByModeratorPayload,
	MeetMeetingEndingSoonPayload,
	MeetParticipantMediaMutedPayload,
	MeetParticipantMuteOptions,
	MeetSignalType
} from '@openvidu-meet/typings';
import { TranslateService } from '../../../shared/services/i18n/translate.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { SoundService } from '../../../shared/services/sound.service';
import { EmbeddedEventBusService } from '../../embedded/services/embedded-event-bus.service';
import { RecordingService } from '../../recordings/services/recording.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RoomFeatureService } from '../../rooms/services/room-feature.service';
import {
	LocalMediaControlService,
	LocalMediaIntentService,
	LocalMediaStateService,
	MeetingEndingSoonService,
	ParticipantLeftReason
} from '../openvidu-components';
import { MeetingContextService, MeetingEndedBy } from './meeting-context.service';
import { MeetingEventHandlerService } from './meeting-event-handler.service';
import { MeetingStateService } from './meeting-state.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

/** Reaches the protected signal handler the moderator mute lands on. */
interface MediaMutedHandler {
	handleParticipantMediaMuted(payload: MeetParticipantMediaMutedPayload): Promise<void>;
}

describe('MeetingEventHandlerService', () => {
	let service: MeetingEventHandlerService;
	let eventBus: EmbeddedEventBusService;
	let mediaControl: jasmine.SpyObj<LocalMediaControlService>;
	let notificationService: jasmine.SpyObj<NotificationService>;
	let meetingEndingSoon: jasmine.SpyObj<MeetingEndingSoonService>;
	let microphoneEnabled: WritableSignal<boolean>;
	let cameraEnabled: WritableSignal<boolean>;
	let screenShareEnabled: WritableSignal<boolean>;
	let meetingEndedBy: WritableSignal<MeetingEndedBy>;
	let meetingContextStub: {
		meetingEndedBy: () => MeetingEndedBy;
		setMeetingEndedBy: jasmine.Spy;
		roomId: () => string;
		clearMeetingContext: jasmine.Spy;
	};
	let navigationServiceStub: { goToDisconnected: jasmine.Spy };

	beforeEach(() => {
		microphoneEnabled = signal(true);
		cameraEnabled = signal(true);
		screenShareEnabled = signal(false);
		meetingEndedBy = signal<MeetingEndedBy>(null);
		meetingContextStub = {
			meetingEndedBy: () => meetingEndedBy(),
			setMeetingEndedBy: jasmine.createSpy('setMeetingEndedBy').and.callFake((by: MeetingEndedBy) => {
				meetingEndedBy.set(by);
			}),
			roomId: () => 'room1',
			clearMeetingContext: jasmine.createSpy('clearMeetingContext')
		};
		navigationServiceStub = {
			goToDisconnected: jasmine.createSpy('goToDisconnected').and.resolveTo(undefined)
		};
		mediaControl = jasmine.createSpyObj<LocalMediaControlService>('LocalMediaControlService', [
			'setMicrophoneEnabled',
			'setCameraEnabled',
			'setScreenShareEnabled'
		]);
		mediaControl.setMicrophoneEnabled.and.callFake(async (enabled: boolean) => {
			microphoneEnabled.set(enabled);
			TestBed.tick();
		});
		mediaControl.setCameraEnabled.and.callFake(async (enabled: boolean) => {
			cameraEnabled.set(enabled);
			TestBed.tick();
		});

		// Unpublishing is what turns the state off, and the status effect flushes while the handler
		// is still awaiting it — that is what would re-attribute the stop if it were notified late.
		mediaControl.setScreenShareEnabled.and.callFake(async (enabled: boolean) => {
			screenShareEnabled.set(enabled);
			TestBed.tick();
		});

		notificationService = jasmine.createSpyObj<NotificationService>('NotificationService', [
			'showSnackbar',
			'showDialog'
		]);
		meetingEndingSoon = jasmine.createSpyObj<MeetingEndingSoonService>('MeetingEndingSoonService', ['start']);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingEventHandlerService,
				EmbeddedEventBusService,
				LocalMediaIntentService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LocalMediaControlService, useValue: mediaControl },
				{
					provide: LocalMediaStateService,
					useValue: { microphoneEnabled, cameraEnabled, screenShareEnabled }
				},
				{ provide: RuntimeConfigService, useValue: { isEmbeddedMode: () => true } },
				{ provide: MeetingContextService, useValue: meetingContextStub },
				{ provide: MeetingStateService, useValue: { clear: () => {} } },
				{ provide: RoomFeatureService, useValue: {} },
				{ provide: RecordingService, useValue: {} },
				{ provide: RoomMemberContextService, useValue: {} },
				{ provide: NavigationService, useValue: navigationServiceStub },
				{ provide: NotificationService, useValue: notificationService },
				{ provide: MeetingEndingSoonService, useValue: meetingEndingSoon },
				{ provide: SoundService, useValue: {} },
				{ provide: TranslateService, useValue: { translate: (key: string) => key } }
			]
		});

		eventBus = TestBed.inject(EmbeddedEventBusService);
		service = TestBed.inject(MeetingEventHandlerService);
	});

	/** First flush of the status effect: the host's view of every device starts here. */
	function seedMediaStatus(): void {
		TestBed.tick();
		eventBus.drain();
	}

	function muteFromModerator(media: MeetParticipantMuteOptions): Promise<void> {
		return (service as unknown as MediaMutedHandler).handleParticipantMediaMuted({
			roomId: 'room1',
			media,
			timestamp: Date.now()
		});
	}

	/** Simulates the server broadcasting `topic` with `payload` over the room's data channel. */
	function emitServerSignal(topic: MeetSignalType, payload: object): void {
		let onData: ((...args: unknown[]) => void) | undefined;
		const room = {
			on: (event: string, handler: (...args: unknown[]) => void) => {
				if (event === 'dataReceived') onData = handler;
			}
		};
		service.setupRoomListeners(room as never);
		onData!(new TextEncoder().encode(JSON.stringify(payload)), undefined, undefined, topic);
	}

	describe('moderator mute', () => {
		it('attributes the microphone mute to the moderator, exactly once', async () => {
			seedMediaStatus();

			// LiveKit's server-side mute reaches the client first: the device is off while the
			// participant still means it to be on, so the status effect reports nothing.
			microphoneEnabled.set(false);
			TestBed.tick();
			expect(eventBus.events()).toEqual([]);

			await muteFromModerator({ audioActive: false });
			TestBed.tick();

			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED,
					payload: { active: false, origin: MeetEventOrigin.MODERATOR }
				}
			]);
		});

		// The control service is the single writer of the media intent, so a forced mute has to go
		// through it for the device to stay closed when its next track is created.
		it('turns the microphone off through the media control service', async () => {
			seedMediaStatus();

			await muteFromModerator({ audioActive: false });

			expect(mediaControl.setMicrophoneEnabled).toHaveBeenCalledOnceWith(false);
			expect(mediaControl.setCameraEnabled).not.toHaveBeenCalled();
		});

		it('attributes the camera mute to the moderator and turns the camera off', async () => {
			seedMediaStatus();

			cameraEnabled.set(false);
			TestBed.tick();

			await muteFromModerator({ videoActive: false });
			TestBed.tick();

			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED,
					payload: { active: false, origin: MeetEventOrigin.MODERATOR }
				}
			]);
			expect(mediaControl.setCameraEnabled).toHaveBeenCalledOnceWith(false);
		});

		// A LiveKit track mute leaves the publication in place, so everyone would keep seeing the
		// share: only unpublishing actually stops it.
		it('unpublishes the screen share, and reports the stop before it lands', async () => {
			screenShareEnabled.set(true);
			seedMediaStatus();

			await muteFromModerator({ screenShareActive: false });
			TestBed.tick();

			expect(mediaControl.setScreenShareEnabled).toHaveBeenCalledOnceWith(false);
			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED,
					payload: { active: false, origin: MeetEventOrigin.MODERATOR }
				}
			]);
		});

		it('turns off every device the moderator asked for, and only those', async () => {
			screenShareEnabled.set(true);
			seedMediaStatus();

			await muteFromModerator({ audioActive: false, screenShareActive: false });
			TestBed.tick();

			expect(eventBus.events().map((queued) => queued.event)).toEqual([
				EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED,
				EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED
			]);
			expect(mediaControl.setMicrophoneEnabled).toHaveBeenCalledOnceWith(false);
			expect(mediaControl.setScreenShareEnabled).toHaveBeenCalledOnceWith(false);
			expect(mediaControl.setCameraEnabled).not.toHaveBeenCalled();
		});

		// LiveKit already muted every requested track server-side, so a failing device control must
		// not keep the other devices from latching their intent off.
		it('still turns off the camera and the screen share when the microphone control fails', async () => {
			screenShareEnabled.set(true);
			seedMediaStatus();
			spyOn(console, 'warn');
			mediaControl.setMicrophoneEnabled.and.rejectWith(new Error('device busy'));

			await muteFromModerator({ audioActive: false, videoActive: false, screenShareActive: false });
			TestBed.tick();

			expect(mediaControl.setCameraEnabled).toHaveBeenCalledOnceWith(false);
			expect(mediaControl.setScreenShareEnabled).toHaveBeenCalledOnceWith(false);
			expect(console.warn).toHaveBeenCalledTimes(1);
		});

		it('does nothing when the moderator turned nothing off', async () => {
			seedMediaStatus();

			await muteFromModerator({});
			TestBed.tick();

			expect(eventBus.events()).toEqual([]);
			expect(mediaControl.setMicrophoneEnabled).not.toHaveBeenCalled();
			expect(mediaControl.setCameraEnabled).not.toHaveBeenCalled();
			expect(mediaControl.setScreenShareEnabled).not.toHaveBeenCalled();
			expect(notificationService.showSnackbar).not.toHaveBeenCalled();
		});

		it('notifies the local participant with a snackbar', async () => {
			seedMediaStatus();

			await muteFromModerator({ audioActive: false });

			expect(notificationService.showSnackbar).toHaveBeenCalledOnceWith('MODERATION.MUTED_BY_MODERATOR');
		});

		it('shows exactly one snackbar even when several devices are muted at once', async () => {
			screenShareEnabled.set(true);
			seedMediaStatus();

			await muteFromModerator({ audioActive: false, videoActive: false, screenShareActive: false });

			expect(notificationService.showSnackbar).toHaveBeenCalledTimes(1);
		});
	});

	describe('signal sender', () => {
		function receiveMuteSignal(from?: { identity: string }): void {
			let onData: ((...args: unknown[]) => void) | undefined;
			const room = {
				on: (event: string, handler: (...args: unknown[]) => void) => {
					if (event === 'dataReceived') onData = handler;
				}
			};
			service.setupRoomListeners(room as never);
			const payload: MeetParticipantMediaMutedPayload = {
				roomId: 'room1',
				media: { audioActive: false },
				timestamp: 0
			};
			onData!(
				new TextEncoder().encode(JSON.stringify(payload)),
				from,
				undefined,
				MeetSignalType.MEET_PARTICIPANT_MEDIA_MUTED
			);
		}

		it('mutes when the server sent the signal', async () => {
			seedMediaStatus();

			receiveMuteSignal();
			await Promise.resolve();

			expect(mediaControl.setMicrophoneEnabled).toHaveBeenCalledWith(false);
		});

		// `participantMute` is the only thing standing between a speaker and everyone's microphone,
		// and `chatWrite` already lets them publish data on any topic.
		it('ignores a signal relayed from another participant', async () => {
			seedMediaStatus();

			receiveMuteSignal({ identity: 'speaker1' });
			await Promise.resolve();

			expect(mediaControl.setMicrophoneEnabled).not.toHaveBeenCalled();
			expect(eventBus.events()).toEqual([]);
		});
	});

	/**
	 * C7 (MEET-BRANCH-AUDIT-FINDINGS.md): the ending-soon warning is also this participant's only
	 * local signal that a force-end (not a moderator) is what's about to happen, so it's recorded
	 * here for onParticipantLeft to pick up later.
	 */
	describe('meeting ending soon', () => {
		function receiveEndingSoonSignal(): void {
			const payload: MeetMeetingEndingSoonPayload = { roomId: 'room1', remainingMs: 300_000, timestamp: 0 };
			emitServerSignal(MeetSignalType.MEET_MEETING_ENDING_SOON, payload);
		}

		it("records the meeting as ended by 'duration' for later attribution", () => {
			receiveEndingSoonSignal();

			expect(meetingContextStub.setMeetingEndedBy).toHaveBeenCalledOnceWith('duration');
		});

		it('interrupts nobody: no dialog and no snackbar', () => {
			receiveEndingSoonSignal();

			expect(notificationService.showDialog).not.toHaveBeenCalled();
			expect(notificationService.showSnackbar).not.toHaveBeenCalled();
		});

		it('starts the countdown with the exact remaining milliseconds', () => {
			receiveEndingSoonSignal();

			expect(meetingEndingSoon.start).toHaveBeenCalledOnceWith(300_000);
		});
	});

	/**
	 * C7 follow-up: a moderator ending the meeting manually, inside the ending-soon warning window,
	 * used to leave every OTHER participant's local 'duration' attribution stale — they'd get
	 * MEETING_ENDED_BY_DURATION_LIMIT for a meeting a moderator actually ended on purpose. The
	 * endMeeting endpoint now broadcasts this signal, once validated, just before the room closes.
	 */
	describe('meeting ended by moderator', () => {
		function receiveEndedByModeratorSignal(): void {
			const payload: MeetMeetingEndedByModeratorPayload = { roomId: 'room1', timestamp: 0 };
			emitServerSignal(MeetSignalType.MEET_MEETING_ENDED_BY_MODERATOR, payload);
		}

		it("corrects a stale 'duration' attribution to 'other'", () => {
			meetingContextStub.setMeetingEndedBy('duration');

			receiveEndedByModeratorSignal();

			expect(meetingEndedBy()).toBe('other');
		});

		it("sets 'other' even when nothing was recorded yet (no prior ending-soon warning)", () => {
			receiveEndedByModeratorSignal();

			expect(meetingEndedBy()).toBe('other');
		});

		it("never downgrades the moderator's own 'self' attribution", () => {
			meetingContextStub.setMeetingEndedBy('self');

			receiveEndedByModeratorSignal();

			expect(meetingEndedBy()).toBe('self');
		});

		it('ignores a signal for a different room', () => {
			meetingContextStub.setMeetingEndedBy('duration');

			emitServerSignal(MeetSignalType.MEET_MEETING_ENDED_BY_MODERATOR, { roomId: 'other-room', timestamp: 0 });

			expect(meetingEndedBy()).toBe('duration');
		});
	});

	describe('participant left', () => {
		function participantLeft(reason: ParticipantLeftReason) {
			return service.onParticipantLeft({
				roomName: 'room1',
				participantName: 'Alice',
				identity: 'alice',
				reason
			});
		}

		it('attributes a room deletion to a moderator by default', async () => {
			await participantLeft(ParticipantLeftReason.ROOM_DELETED);

			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.MEETING_LEFT,
					payload: { roomId: 'room1', participantIdentity: 'alice', reason: LeftEventReason.MEETING_ENDED }
				}
			]);
		});

		it('upgrades the reason to MEETING_ENDED_BY_DURATION_LIMIT after the ending-soon warning', async () => {
			meetingContextStub.setMeetingEndedBy('duration');

			await participantLeft(ParticipantLeftReason.ROOM_DELETED);

			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.MEETING_LEFT,
					payload: {
						roomId: 'room1',
						participantIdentity: 'alice',
						reason: LeftEventReason.MEETING_ENDED_BY_DURATION_LIMIT
					}
				}
			]);
		});

		it('does not upgrade a room deletion this participant ended themselves', async () => {
			meetingContextStub.setMeetingEndedBy('self');

			await participantLeft(ParticipantLeftReason.ROOM_DELETED);

			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.MEETING_LEFT,
					payload: {
						roomId: 'room1',
						participantIdentity: 'alice',
						reason: LeftEventReason.MEETING_ENDED_BY_SELF
					}
				}
			]);
		});

		it('never upgrades a reason other than the generic MEETING_ENDED', async () => {
			meetingContextStub.setMeetingEndedBy('duration');

			await participantLeft(ParticipantLeftReason.LEAVE);

			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.MEETING_LEFT,
					payload: {
						roomId: 'room1',
						participantIdentity: 'alice',
						reason: LeftEventReason.VOLUNTARY_LEAVE
					}
				}
			]);
		});

		it('does not upgrade a kicked participant even during the ending-soon warning window', async () => {
			meetingContextStub.setMeetingEndedBy('duration');

			await participantLeft(ParticipantLeftReason.PARTICIPANT_REMOVED);

			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.MEETING_LEFT,
					payload: {
						roomId: 'room1',
						participantIdentity: 'alice',
						reason: LeftEventReason.PARTICIPANT_KICKED
					}
				}
			]);
		});

		// The scenario that broke before the "meeting ended by moderator" signal existed: the
		// warning fires, then a moderator ends the meeting themselves before the GC ever would have.
		// Every OTHER participant must see the plain, correct MEETING_ENDED — not the duration one.
		it('reports the generic MEETING_ENDED — not MEETING_ENDED_BY_DURATION_LIMIT — when a moderator ends the meeting during the warning window', async () => {
			emitServerSignal(MeetSignalType.MEET_MEETING_ENDING_SOON, {
				roomId: 'room1',
				remainingMs: 300_000,
				timestamp: 0
			});
			emitServerSignal(MeetSignalType.MEET_MEETING_ENDED_BY_MODERATOR, { roomId: 'room1', timestamp: 1 });

			await participantLeft(ParticipantLeftReason.ROOM_DELETED);

			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.MEETING_LEFT,
					payload: { roomId: 'room1', participantIdentity: 'alice', reason: LeftEventReason.MEETING_ENDED }
				}
			]);
		});

		// The moderator's own client: 'self' is set synchronously by the button click, strictly
		// before their own endMeeting request can complete and echo the broadcast back to them.
		it("still attributes the end to 'self' for the moderator who ended it, even after their own broadcast echoes back", async () => {
			emitServerSignal(MeetSignalType.MEET_MEETING_ENDING_SOON, {
				roomId: 'room1',
				remainingMs: 300_000,
				timestamp: 0
			});
			meetingContextStub.setMeetingEndedBy('self'); // the button click, before the REST call
			emitServerSignal(MeetSignalType.MEET_MEETING_ENDED_BY_MODERATOR, { roomId: 'room1', timestamp: 1 }); // their own broadcast, echoed back

			await participantLeft(ParticipantLeftReason.ROOM_DELETED);

			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.MEETING_LEFT,
					payload: {
						roomId: 'room1',
						participantIdentity: 'alice',
						reason: LeftEventReason.MEETING_ENDED_BY_SELF
					}
				}
			]);
		});

		// If the GC's own force-end genuinely wins the race (no moderator end request arrives), the
		// 'duration' attribution from the warning must still upgrade correctly, unaffected by this signal.
		it('still upgrades to MEETING_ENDED_BY_DURATION_LIMIT when no moderator end ever arrives', async () => {
			emitServerSignal(MeetSignalType.MEET_MEETING_ENDING_SOON, {
				roomId: 'room1',
				remainingMs: 300_000,
				timestamp: 0
			});

			await participantLeft(ParticipantLeftReason.ROOM_DELETED);

			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.MEETING_LEFT,
					payload: {
						roomId: 'room1',
						participantIdentity: 'alice',
						reason: LeftEventReason.MEETING_ENDED_BY_DURATION_LIMIT
					}
				}
			]);
		});
	});
});
