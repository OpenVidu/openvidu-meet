import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	EmbeddedEventName,
	LeftEventReason,
	MeetEventOrigin,
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
import { MeetingContextService } from './meeting-context.service';
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
	let soundService: jasmine.SpyObj<SoundService>;
	let microphoneEnabled: WritableSignal<boolean>;
	let cameraEnabled: WritableSignal<boolean>;
	let screenShareEnabled: WritableSignal<boolean>;
	let endedBySelf: WritableSignal<boolean>;
	let meetingEndsAt: WritableSignal<number | undefined>;
	let serverTimeSkewMs: WritableSignal<number>;
	let meetingContextStub: {
		endedBySelf: () => boolean;
		markMeetingEndedBySelf: jasmine.Spy;
		meetingEndsAt: () => number | undefined;
		setMeetingEndsAt: jasmine.Spy;
		roomId: () => string;
		clearMeetingContext: jasmine.Spy;
	};
	let navigationServiceStub: { goToDisconnected: jasmine.Spy };

	beforeEach(() => {
		microphoneEnabled = signal(true);
		cameraEnabled = signal(true);
		screenShareEnabled = signal(false);
		endedBySelf = signal(false);
		meetingEndsAt = signal<number | undefined>(undefined);
		serverTimeSkewMs = signal(0);
		meetingContextStub = {
			endedBySelf: () => endedBySelf(),
			markMeetingEndedBySelf: jasmine.createSpy('markMeetingEndedBySelf').and.callFake(() => {
				endedBySelf.set(true);
			}),
			meetingEndsAt: () => meetingEndsAt(),
			setMeetingEndsAt: jasmine.createSpy('setMeetingEndsAt').and.callFake((endsAt?: number) => {
				meetingEndsAt.set(endsAt);
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
		meetingEndingSoon = jasmine.createSpyObj<MeetingEndingSoonService>('MeetingEndingSoonService', [
			'trackMeetingEnd'
		]);
		soundService = jasmine.createSpyObj<SoundService>('SoundService', [
			'playParticipantJoinedSound',
			'playParticipantRoleUpgradedSound',
			'playParticipantRoleDowngradedSound',
			'playMeetingEndingSoonSound'
		]);

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
				{ provide: RoomMemberContextService, useValue: { serverTimeSkewMs } },
				{ provide: NavigationService, useValue: navigationServiceStub },
				{ provide: NotificationService, useValue: notificationService },
				{ provide: MeetingEndingSoonService, useValue: meetingEndingSoon },
				{ provide: SoundService, useValue: soundService },
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
	 * The meeting's deadline is shared state, written into the LiveKit room metadata, so it reaches
	 * late joiners and reconnectors too. It is stamped in server time, which is why it is shifted by
	 * the skew measured from the room member token before anything counts down to it.
	 */
	describe('meeting deadline', () => {
		const endDate = Date.UTC(2026, 8, 3, 12, 0, 0);
		const meetMetadata = (deadline?: number) =>
			JSON.stringify({ createdBy: 'openvidu-meet', endDate: deadline, roomOptions: {} });

		/** Simulates joining a room whose metadata is `metadata`, and returns its change listener. */
		function joinRoom(metadata?: string): (metadata: string) => void {
			let onMetadataChanged: ((metadata: string) => void) | undefined;
			const room = {
				metadata,
				on: (event: string, handler: (...args: unknown[]) => void) => {
					if (event === 'roomMetadataChanged') onMetadataChanged = handler as (metadata: string) => void;
				}
			};

			service.setupRoomListeners(room as never);
			return onMetadataChanged!;
		}

		it('tracks the end the room metadata carries', () => {
			joinRoom(meetMetadata(endDate));

			expect(meetingEndingSoon.trackMeetingEnd).toHaveBeenCalledOnceWith(endDate);
		});

		it('publishes the end to the meeting context, which is what attributes the force-end', () => {
			joinRoom(meetMetadata(endDate));

			expect(meetingContextStub.setMeetingEndsAt).toHaveBeenCalledOnceWith(endDate);
		});

		it("shifts the deadline by this device's distance from the server clock", () => {
			// The server's clock reads 2 seconds ahead of this device's
			serverTimeSkewMs.set(2_000);

			joinRoom(meetMetadata(endDate));

			expect(meetingEndingSoon.trackMeetingEnd).toHaveBeenCalledOnceWith(endDate - 2_000);
		});

		it('tracks nothing when the meeting declares no end', () => {
			joinRoom(meetMetadata(undefined));

			expect(meetingEndingSoon.trackMeetingEnd).toHaveBeenCalledOnceWith(undefined);
		});

		it("tracks nothing for a room whose metadata is not Meet's", () => {
			// A room LiveKit auto-created, which carries no metadata at all
			joinRoom(undefined);

			expect(meetingEndingSoon.trackMeetingEnd).toHaveBeenCalledOnceWith(undefined);
		});

		it('tracks the end a later metadata change brings', () => {
			const onMetadataChanged = joinRoom(meetMetadata(undefined));

			onMetadataChanged(meetMetadata(endDate));

			expect(meetingEndingSoon.trackMeetingEnd).toHaveBeenCalledWith(endDate);
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

		it('attributes it to the duration limit when the meeting had reached its end', async () => {
			meetingEndsAt.set(Date.now() - 1_000);

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

		it("attributes it to 'self' for the participant who ended it, even at the meeting's own end", async () => {
			meetingContextStub.markMeetingEndedBySelf();
			meetingEndsAt.set(Date.now() - 1_000);

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
			meetingEndsAt.set(Date.now() - 1_000);

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

		it("does not upgrade a kicked participant, even at the meeting's own end", async () => {
			meetingEndsAt.set(Date.now() - 1_000);

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

		// The scenario two signals used to exist for: a moderator ends the meeting before it reaches
		// its own end. Every other participant must see the plain MEETING_ENDED, and the end date
		// alone is what tells them so.
		it('reports the generic MEETING_ENDED when a moderator ends the meeting before its end', async () => {
			meetingEndsAt.set(Date.now() + 300_000);

			await participantLeft(ParticipantLeftReason.ROOM_DELETED);

			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.MEETING_LEFT,
					payload: { roomId: 'room1', participantIdentity: 'alice', reason: LeftEventReason.MEETING_ENDED }
				}
			]);
		});

		// The backend ends the meeting within its own tolerance of the deadline, so a disconnect
		// landing a hair before it is still the duration limit and not a moderator.
		it('attributes it to the duration limit inside the tolerance before the end', async () => {
			meetingEndsAt.set(Date.now() + 1_000);

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
