import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	EmbeddedEventName,
	LeftEventReason,
	MeetEventOrigin,
	MeetParticipantMediaMutedPayload,
	MeetParticipantMuteOptions,
	MeetParticipantRoleUpdatedPayload,
	MeetRecordingInfo,
	MeetRecordingStatus,
	MeetRecordingUpdatedPayload,
	MeetRoomMemberRole,
	MeetRoomMemberUIBadge,
	MeetSignalPayload,
	MeetSignalType
} from '@openvidu-meet/typings';
import { Subject } from 'rxjs';
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
	LocalMediaService,
	ScreenShareService,
	MeetingEndingSoonService,
	ParticipantLeftReason,
	ParticipantModel
} from '../openvidu-components';
import {
	MeetingEventsService,
	MeetSignal
} from '../openvidu-components/services/meeting-events/meeting-events.service';
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

/** Reaches the handler every server signal goes through, to wait for what it does. */
interface MeetSignalHandler {
	handleMeetSignal(signal: MeetSignal): Promise<void>;
}

describe('MeetingEventHandlerService', () => {
	let service: MeetingEventHandlerService;
	let eventBus: EmbeddedEventBusService;
	let localMedia: {
		setMicrophoneEnabled: jasmine.Spy;
		setCameraEnabled: jasmine.Spy;
		microphone: { enabled: WritableSignal<boolean>; wanted: WritableSignal<boolean> };
		camera: { enabled: WritableSignal<boolean>; wanted: WritableSignal<boolean> };
	};
	let screenShare: { setEnabled: jasmine.Spy; enabled: WritableSignal<boolean> };
	let notificationService: jasmine.SpyObj<NotificationService>;
	let meetingEndingSoon: jasmine.SpyObj<MeetingEndingSoonService>;
	let soundService: jasmine.SpyObj<SoundService>;
	let microphoneEnabled: WritableSignal<boolean>;
	let cameraEnabled: WritableSignal<boolean>;
	let screenShareEnabled: WritableSignal<boolean>;
	let endedBySelf: WritableSignal<boolean>;
	let meetingEndsAt: WritableSignal<number | undefined>;
	let serverTimeSkewMs: WritableSignal<number>;
	let isEmbeddedMode: boolean;
	let meetSignals: Subject<MeetSignal>;
	let meetingContextStub: {
		endedBySelf: () => boolean;
		markMeetingEndedBySelf: jasmine.Spy;
		meetingEndsAt: () => number | undefined;
		setMeetingStartedAt: jasmine.Spy;
		setMeetingEndsAt: jasmine.Spy;
		setHasRecordings: jasmine.Spy;
		roomId: () => string;
		clearMeetingContext: jasmine.Spy;
	};
	let navigationServiceStub: { goToDisconnected: jasmine.Spy; redirectToErrorPage: jasmine.Spy };
	let refreshToken: jasmine.Spy;

	beforeEach(() => {
		microphoneEnabled = signal(true);
		cameraEnabled = signal(true);
		screenShareEnabled = signal(false);
		endedBySelf = signal(false);
		meetingEndsAt = signal<number | undefined>(undefined);
		serverTimeSkewMs = signal(0);
		isEmbeddedMode = true;
		meetSignals = new Subject<MeetSignal>();
		meetingContextStub = {
			endedBySelf: () => endedBySelf(),
			markMeetingEndedBySelf: jasmine.createSpy('markMeetingEndedBySelf').and.callFake(() => {
				endedBySelf.set(true);
			}),
			meetingEndsAt: () => meetingEndsAt(),
			setMeetingStartedAt: jasmine.createSpy('setMeetingStartedAt'),
			setMeetingEndsAt: jasmine.createSpy('setMeetingEndsAt').and.callFake((endsAt?: number) => {
				meetingEndsAt.set(endsAt);
			}),
			setHasRecordings: jasmine.createSpy('setHasRecordings'),
			roomId: () => 'room1',
			clearMeetingContext: jasmine.createSpy('clearMeetingContext')
		};
		navigationServiceStub = {
			goToDisconnected: jasmine.createSpy('goToDisconnected').and.resolveTo(undefined),
			redirectToErrorPage: jasmine.createSpy('redirectToErrorPage').and.resolveTo(undefined)
		};
		refreshToken = jasmine.createSpy('refreshToken').and.resolveTo(undefined);
		localMedia = {
			setMicrophoneEnabled: jasmine.createSpy('setMicrophoneEnabled').and.callFake(async (enabled: boolean) => {
				localMedia.microphone.wanted.set(enabled);
				microphoneEnabled.set(enabled);
				TestBed.tick();
			}),
			setCameraEnabled: jasmine.createSpy('setCameraEnabled').and.callFake(async (enabled: boolean) => {
				localMedia.camera.wanted.set(enabled);
				cameraEnabled.set(enabled);
				TestBed.tick();
			}),
			microphone: { enabled: microphoneEnabled, wanted: signal(true) },
			camera: { enabled: cameraEnabled, wanted: signal(true) }
		};

		// Unpublishing is what turns the state off, and the status effect flushes while the handler
		// is still awaiting it — that is what would re-attribute the stop if it were notified late.
		screenShare = {
			setEnabled: jasmine.createSpy('setEnabled').and.callFake(async (enabled: boolean) => {
				screenShareEnabled.set(enabled);
				TestBed.tick();
			}),
			enabled: screenShareEnabled
		};

		notificationService = jasmine.createSpyObj<NotificationService>('NotificationService', ['showMessage']);
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
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LocalMediaService, useValue: localMedia },
				{ provide: ScreenShareService, useValue: screenShare },
				{ provide: RuntimeConfigService, useValue: { isEmbeddedMode: () => isEmbeddedMode } },
				{ provide: MeetingEventsService, useValue: { meetSignals$: meetSignals.asObservable() } },
				{ provide: MeetingContextService, useValue: meetingContextStub },
				{
					provide: MeetingStateService,
					useValue: { clear: () => {}, localParticipant: () => ({ identity: 'alice' }) }
				},
				{ provide: RoomFeatureService, useValue: {} },
				{ provide: RecordingService, useValue: {} },
				{ provide: RoomMemberContextService, useValue: { serverTimeSkewMs, refreshToken } },
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

	/** Delivers a server signal the way the bound room relays it. */
	function receiveSignal(topic: MeetSignalType, payload: MeetSignalPayload): void {
		meetSignals.next({ topic, payload });
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

		// The media owner is the single writer of the intent, so a forced mute has to go through it
		// for the device to stay closed when its next track is created.
		it('turns the microphone off through the media owner', async () => {
			seedMediaStatus();

			await muteFromModerator({ audioActive: false });

			expect(localMedia.setMicrophoneEnabled).toHaveBeenCalledOnceWith(false);
			expect(localMedia.setCameraEnabled).not.toHaveBeenCalled();
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
			expect(localMedia.setCameraEnabled).toHaveBeenCalledOnceWith(false);
		});

		// A LiveKit track mute leaves the publication in place, so everyone would keep seeing the
		// share: only unpublishing actually stops it.
		it('unpublishes the screen share, and reports the stop before it lands', async () => {
			screenShareEnabled.set(true);
			seedMediaStatus();

			await muteFromModerator({ screenShareActive: false });
			TestBed.tick();

			expect(screenShare.setEnabled).toHaveBeenCalledOnceWith(false);
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
			expect(localMedia.setMicrophoneEnabled).toHaveBeenCalledOnceWith(false);
			expect(screenShare.setEnabled).toHaveBeenCalledOnceWith(false);
			expect(localMedia.setCameraEnabled).not.toHaveBeenCalled();
		});

		// LiveKit already muted every requested track server-side, so a failing device control must
		// not keep the other devices from latching their intent off.
		it('still turns off the camera and the screen share when the microphone control fails', async () => {
			screenShareEnabled.set(true);
			seedMediaStatus();
			spyOn(console, 'warn');
			localMedia.setMicrophoneEnabled.and.rejectWith(new Error('device busy'));

			await muteFromModerator({ audioActive: false, videoActive: false, screenShareActive: false });
			TestBed.tick();

			expect(localMedia.setCameraEnabled).toHaveBeenCalledOnceWith(false);
			expect(screenShare.setEnabled).toHaveBeenCalledOnceWith(false);
			expect(console.warn).toHaveBeenCalledTimes(1);
		});

		it('does nothing when the moderator turned nothing off', async () => {
			seedMediaStatus();

			await muteFromModerator({});
			TestBed.tick();

			expect(eventBus.events()).toEqual([]);
			expect(localMedia.setMicrophoneEnabled).not.toHaveBeenCalled();
			expect(localMedia.setCameraEnabled).not.toHaveBeenCalled();
			expect(screenShare.setEnabled).not.toHaveBeenCalled();
			expect(notificationService.showMessage).not.toHaveBeenCalled();
		});

		it('notifies the local participant with a snackbar', async () => {
			seedMediaStatus();

			await muteFromModerator({ audioActive: false });

			expect(notificationService.showMessage).toHaveBeenCalledOnceWith('MODERATION.MUTED_BY_MODERATOR');
		});

		it('shows exactly one snackbar even when several devices are muted at once', async () => {
			screenShareEnabled.set(true);
			seedMediaStatus();

			await muteFromModerator({ audioActive: false, videoActive: false, screenShareActive: false });

			expect(notificationService.showMessage).toHaveBeenCalledTimes(1);
		});
	});

	// The bound room only relays what the server itself sent (MeetingEventsService discards a
	// packet relayed from a participant), so a signal arriving here carries the server's authority.
	describe('server signals', () => {
		it('mutes on the moderator mute signal', async () => {
			seedMediaStatus();

			const payload: MeetParticipantMediaMutedPayload = {
				roomId: 'room1',
				media: { audioActive: false },
				timestamp: 0
			};
			receiveSignal(MeetSignalType.MEET_PARTICIPANT_MEDIA_MUTED, payload);
			await Promise.resolve();

			expect(localMedia.setMicrophoneEnabled).toHaveBeenCalledWith(false);
		});
	});

	describe('role changed', () => {
		function receiveRoleUpdate(participantIdentity: string, newBadge: MeetRoomMemberUIBadge): Promise<void> {
			const payload: MeetParticipantRoleUpdatedPayload = {
				roomId: 'room1',
				participantIdentity,
				newBadge,
				timestamp: 0
			};
			return (service as unknown as MeetSignalHandler).handleMeetSignal({
				topic: MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED,
				payload
			});
		}

		it('tells the host the local participant was promoted to moderator', async () => {
			await receiveRoleUpdate('alice', MeetRoomMemberUIBadge.MODERATOR);

			expect(refreshToken).toHaveBeenCalledOnceWith('room1');
			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.PARTICIPANT_ROLE_CHANGED,
					payload: { roomId: 'room1', participantIdentity: 'alice', role: MeetRoomMemberRole.MODERATOR }
				}
			]);
		});

		it('tells the host the local participant was returned to the speaker role', async () => {
			await receiveRoleUpdate('alice', MeetRoomMemberUIBadge.OTHER);

			expect(notificationService.showMessage).toHaveBeenCalledOnceWith('MODERATION.MODERATOR_ROLE_REMOVED');

			expect(eventBus.events()).toEqual([
				{
					event: EmbeddedEventName.PARTICIPANT_ROLE_CHANGED,
					payload: { roomId: 'room1', participantIdentity: 'alice', role: MeetRoomMemberRole.SPEAKER }
				}
			]);
		});

		// A host reacting to the event (e.g. by sending a moderator command) must find the new
		// permissions already in place.
		it('waits for the refreshed token before telling the host', async () => {
			let completeRefresh!: () => void;
			refreshToken.and.returnValue(new Promise<void>((resolve) => (completeRefresh = resolve)));

			const handled = receiveRoleUpdate('alice', MeetRoomMemberUIBadge.MODERATOR);
			await Promise.resolve();
			expect(eventBus.events()).toEqual([]);

			completeRefresh();
			await handled;
			expect(eventBus.events().length).toBe(1);
		});

		it('tells the host nothing when the token cannot be refreshed', async () => {
			spyOn(console, 'error');
			refreshToken.and.rejectWith(new Error('access revoked'));

			await receiveRoleUpdate('alice', MeetRoomMemberUIBadge.MODERATOR);

			expect(eventBus.events()).toEqual([]);
			expect(navigationServiceStub.redirectToErrorPage).toHaveBeenCalled();
		});

		it('ignores a role change addressed to another participant', async () => {
			await receiveRoleUpdate('bob', MeetRoomMemberUIBadge.MODERATOR);

			expect(refreshToken).not.toHaveBeenCalled();
			expect(eventBus.events()).toEqual([]);
		});

		it('only notifies the participant, not a host, outside the embedded modes', async () => {
			isEmbeddedMode = false;

			await receiveRoleUpdate('alice', MeetRoomMemberUIBadge.MODERATOR);

			expect(notificationService.showMessage).toHaveBeenCalledOnceWith('MODERATION.PROMOTED_TO_MODERATOR');
			expect(eventBus.events()).toEqual([]);
		});
	});

	/**
	 * The recording's status reaches every participant as a server signal carrying the whole
	 * recording; the host is told of each status the signal brings, once, and none before it knows the
	 * participant joined.
	 */
	describe('recording status', () => {
		function receiveRecordingStatus(status: MeetRecordingStatus, recordingId = 'rec-1', roomId = 'room1'): void {
			const payload: MeetRecordingUpdatedPayload = {
				roomId,
				recording: { recordingId, roomId, roomName: roomId, status } as MeetRecordingInfo,
				timestamp: 0
			};
			receiveSignal(MeetSignalType.MEET_RECORDING_UPDATED, payload);
		}

		function notifiedStatuses(): { recordingId: string; status: MeetRecordingStatus }[] {
			return eventBus
				.events()
				.filter((event) => event.event === EmbeddedEventName.RECORDING_STATUS_CHANGED)
				.map(
					(event) =>
						('payload' in event ? event.payload : undefined) as {
							recordingId: string;
							status: MeetRecordingStatus;
						}
				);
		}

		function joinMeeting(): void {
			service.onParticipantConnected({ roomName: 'room1', identity: 'alice' } as ParticipantModel);
		}

		function leaveMeeting(): Promise<void> {
			return service.onParticipantLeft({
				roomName: 'room1',
				participantName: 'Alice',
				identity: 'alice',
				reason: ParticipantLeftReason.LEAVE
			});
		}

		describe('in the meeting', () => {
			beforeEach(() => {
				joinMeeting();
				eventBus.drain();
			});

			for (const status of Object.values(MeetRecordingStatus)) {
				it(`notifies the host of a recording that is '${status}'`, () => {
					receiveRecordingStatus(status);

					expect(notifiedStatuses()).toEqual([{ recordingId: 'rec-1', status }]);
				});
			}

			it('notifies every status transition, in order', () => {
				receiveRecordingStatus(MeetRecordingStatus.STARTING);
				receiveRecordingStatus(MeetRecordingStatus.ACTIVE);
				receiveRecordingStatus(MeetRecordingStatus.ENDING);
				receiveRecordingStatus(MeetRecordingStatus.COMPLETE);

				expect(notifiedStatuses().map(({ status }) => status)).toEqual([
					MeetRecordingStatus.STARTING,
					MeetRecordingStatus.ACTIVE,
					MeetRecordingStatus.ENDING,
					MeetRecordingStatus.COMPLETE
				]);
			});

			// The server repeats the current status to a participant who joins mid-recording or reconnects.
			it('does not repeat a status the host already knows', () => {
				receiveRecordingStatus(MeetRecordingStatus.ACTIVE);
				receiveRecordingStatus(MeetRecordingStatus.ACTIVE);

				expect(notifiedStatuses().length).toBe(1);
			});

			// The server repeats the current status on join and relays egress webhooks that can arrive late.
			it('never walks a recording back to an earlier status', () => {
				receiveRecordingStatus(MeetRecordingStatus.ACTIVE);
				receiveRecordingStatus(MeetRecordingStatus.STARTING);
				receiveRecordingStatus(MeetRecordingStatus.ENDING);
				receiveRecordingStatus(MeetRecordingStatus.ACTIVE);
				receiveRecordingStatus(MeetRecordingStatus.COMPLETE);
				receiveRecordingStatus(MeetRecordingStatus.ENDING);
				receiveRecordingStatus(MeetRecordingStatus.FAILED);

				expect(notifiedStatuses().map(({ status }) => status)).toEqual([
					MeetRecordingStatus.ACTIVE,
					MeetRecordingStatus.ENDING,
					MeetRecordingStatus.COMPLETE
				]);
			});

			it('tells a new recording apart from the previous one in the same status', () => {
				receiveRecordingStatus(MeetRecordingStatus.ACTIVE, 'rec-1');
				receiveRecordingStatus(MeetRecordingStatus.ACTIVE, 'rec-2');

				expect(notifiedStatuses().map(({ recordingId }) => recordingId)).toEqual(['rec-1', 'rec-2']);
			});

			it('starts over on the next entry, once the host knows it joined again', async () => {
				receiveRecordingStatus(MeetRecordingStatus.ACTIVE);
				await leaveMeeting();
				eventBus.drain();

				receiveRecordingStatus(MeetRecordingStatus.ACTIVE);
				expect(notifiedStatuses()).toEqual([]);

				joinMeeting();
				expect(notifiedStatuses().length).toBe(1);
			});

			it("ignores another room's recording", () => {
				receiveRecordingStatus(MeetRecordingStatus.ACTIVE, 'rec-1', 'room2');

				expect(notifiedStatuses()).toEqual([]);
			});

			it('marks the meeting as having recordings once one completes', () => {
				receiveRecordingStatus(MeetRecordingStatus.ACTIVE);
				expect(meetingContextStub.setHasRecordings).not.toHaveBeenCalled();

				receiveRecordingStatus(MeetRecordingStatus.COMPLETE);
				expect(meetingContextStub.setHasRecordings).toHaveBeenCalledOnceWith(true);
			});

			it('tells the host nothing outside the embedded modes, but still tracks the recordings', () => {
				isEmbeddedMode = false;

				receiveRecordingStatus(MeetRecordingStatus.COMPLETE);

				expect(eventBus.events()).toEqual([]);
				expect(meetingContextStub.setHasRecordings).toHaveBeenCalledOnceWith(true);
			});
		});

		// The server repeats the current status from the participant_joined webhook, while the
		// participant is still connecting.
		describe('on joining', () => {
			it('reports a recording already underway right after meetingJoined', () => {
				receiveRecordingStatus(MeetRecordingStatus.ACTIVE);
				expect(eventBus.events()).toEqual([]);

				joinMeeting();

				expect(eventBus.events().map(({ event }) => event)).toEqual([
					EmbeddedEventName.MEETING_JOINED,
					EmbeddedEventName.RECORDING_STATUS_CHANGED
				]);
				expect(notifiedStatuses()).toEqual([{ recordingId: 'rec-1', status: MeetRecordingStatus.ACTIVE }]);
			});

			it('reports only the furthest status each recording reached while joining', () => {
				receiveRecordingStatus(MeetRecordingStatus.STARTING, 'rec-1');
				receiveRecordingStatus(MeetRecordingStatus.ACTIVE, 'rec-1');
				receiveRecordingStatus(MeetRecordingStatus.STARTING, 'rec-2');

				joinMeeting();

				expect(notifiedStatuses()).toEqual([
					{ recordingId: 'rec-1', status: MeetRecordingStatus.ACTIVE },
					{ recordingId: 'rec-2', status: MeetRecordingStatus.STARTING }
				]);
			});
		});
	});

	/**
	 * The meeting's start and deadline are shared state, written into the LiveKit room metadata, so
	 * they reach late joiners and reconnectors too. They are stamped in server time, which is why they
	 * are shifted by the skew measured from the room member token before anything counts from them.
	 */
	describe('meeting start and deadline', () => {
		const startDate = Date.UTC(2026, 8, 3, 11, 0, 0);
		const endDate = Date.UTC(2026, 8, 3, 12, 0, 0);
		const meetMetadata = (deadline?: number, start = startDate) =>
			JSON.stringify({ createdBy: 'openvidu-meet', startDate: start, endDate: deadline, roomOptions: {} });

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

		it('publishes the start, shifted the same way, to the meeting context, with or without a deadline', () => {
			serverTimeSkewMs.set(2_000);

			joinRoom(meetMetadata(undefined));

			expect(meetingContextStub.setMeetingStartedAt).toHaveBeenCalledOnceWith(startDate - 2_000);
		});

		it("publishes no start for a room whose metadata is not Meet's", () => {
			joinRoom(undefined);

			expect(meetingContextStub.setMeetingStartedAt).toHaveBeenCalledOnceWith(undefined);
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
