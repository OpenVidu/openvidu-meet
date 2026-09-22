import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetRecordingStatus, MeetSignalType } from '@openvidu-meet/typings';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { MeetStorageService } from '../../../../../shared/services/storage.service';
import { DataTopic } from '../../models/data-topic.model';
import { ParticipantModel } from '../../models/participant.model';
import { ConnectionQuality, RemoteParticipant, Room, RoomEvent, Track } from '../../services/livekit';
import { DialogService } from '../../../../../shared/services/dialog.service';
import { ChatService } from '../chat/chat.service';
import { MeetingUiConfigService } from '../config/meeting-ui-config.service';
import { StreamLayoutStateService } from '../layout/stream-layout-state.service';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { ParticipantService } from '../participant/participant.service';
import { RecordingService } from '../recording/recording.service';
import { MeetingTranslateService } from '../translate/meeting-translate.service';
import { MeetingEventCallbacks, MeetingEventsService } from './meeting-events.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

describe('MeetingEventsService', () => {
	let service: MeetingEventsService;
	let chatService: jasmine.SpyObj<ChatService>;
	let recordingService: jasmine.SpyObj<RecordingService>;
	let onData: (payload: Uint8Array, participant?: unknown, kind?: unknown, topic?: string) => Promise<void>;

	const storedParticipant = { sid: 'sid1', identity: 'speaker1', name: 'Speaker 1' };

	function receive(topic: string, payload: object, participant?: { sid: string }): Promise<void> {
		return onData(new TextEncoder().encode(JSON.stringify(payload)), participant, undefined, topic);
	}

	beforeEach(() => {
		chatService = jasmine.createSpyObj<ChatService>('ChatService', ['addRemoteMessage']);
		recordingService = jasmine.createSpyObj<RecordingService>('RecordingService', [
			'setRecordingStarting',
			'setRecordingStarted',
			'setRecordingStopping',
			'setRecordingStopped',
			'setRecordingFailed'
		]);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingEventsService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: ChatService, useValue: chatService },
				{ provide: RecordingService, useValue: recordingService },
				{
					provide: ParticipantService,
					useValue: {
						getRemoteParticipantBySid: (sid: string) =>
							sid === storedParticipant.sid ? storedParticipant : undefined
					}
				},
				{ provide: DialogService, useValue: {} },
				{ provide: MeetingUiConfigService, useValue: {} },
				{ provide: MeetingLiveKitService, useValue: {} },
				{ provide: StreamLayoutStateService, useValue: {} },
				{ provide: MeetingTranslateService, useValue: {} },
				{ provide: MeetStorageService, useValue: { getLocalTileFloating: () => null } }
			]
		});

		service = TestBed.inject(MeetingEventsService);
		const room = {
			on(event: string, handler: (...args: never[]) => void) {
				if (event === RoomEvent.DataReceived) onData = handler as typeof onData;

				return room;
			}
		};
		service.bindRoom(room as never, {
			onRoomReconnecting: () => {},
			onRoomReconnected: () => {},
			onParticipantLeft: () => {}
		});
	});

	describe('data message sender', () => {
		const recordingUpdate = {
			roomId: 'room1',
			recording: { recordingId: 'rec1', status: MeetRecordingStatus.COMPLETE },
			timestamp: 0
		};

		it('drives the recording indicator from a server-sent recording update', async () => {
			await receive(MeetSignalType.MEET_RECORDING_UPDATED, recordingUpdate);

			expect(recordingService.setRecordingStopped).toHaveBeenCalled();
		});

		// Meet's chat is the data channel, so a participant allowed to chat can publish on any
		// topic: the recording indicator must not be steerable by a forged packet.
		it('ignores a recording update relayed from a participant', async () => {
			await receive(MeetSignalType.MEET_RECORDING_UPDATED, recordingUpdate, storedParticipant);

			expect(recordingService.setRecordingStopped).not.toHaveBeenCalled();
		});

		it('still delivers chat messages relayed from a known participant', async () => {
			await receive(DataTopic.CHAT, { message: 'hello' }, storedParticipant);

			expect(chatService.addRemoteMessage).toHaveBeenCalledWith('hello', 'Speaker 1');
		});

		it('discards chat messages from a participant that is not in the roster', async () => {
			await receive(DataTopic.CHAT, { message: 'hello' }, { sid: 'unknown-sid' });

			expect(chatService.addRemoteMessage).not.toHaveBeenCalled();
		});
	});
});

type RoomHandler = (...args: unknown[]) => void;

/** Minimal Room double: bindRoom registers one handler per event, emit() invokes it. */
const fakeRoom = () => {
	const handlers = new Map<string, RoomHandler>();
	const room = {
		on(event: string, handler: RoomHandler) {
			handlers.set(event, handler);
			return room;
		}
	};

	return {
		room: room as unknown as Room,
		events: () => [...handlers.keys()] as RoomEvent[],
		emit: (event: RoomEvent, ...args: unknown[]) => handlers.get(event)?.(...args)
	};
};

const remoteParticipant = (sid: string): RemoteParticipant => ({ sid }) as unknown as RemoteParticipant;

/** The dock/float decisions are deferred with queueMicrotask; awaiting once runs them all. */
const flushMicrotasks = () => Promise.resolve();

describe('MeetingEventsService (reconnection view state)', () => {
	let service: MeetingEventsService;
	let streamLayoutService: jasmine.SpyObj<StreamLayoutStateService>;
	let meetStorageService: jasmine.SpyObj<MeetStorageService>;
	let emit: (event: RoomEvent, ...args: unknown[]) => void;
	let remotes: ParticipantModel[];
	let callbacks: MeetingEventCallbacks;
	let dialogService: jasmine.SpyObj<DialogService>;

	beforeEach(() => {
		remotes = [];
		streamLayoutService = jasmine.createSpyObj<StreamLayoutStateService>('StreamLayoutStateService', [
			'dockLocalCameraVideo',
			'floatLocalCameraVideo',
			'unpinAllStreams',
			'toggleStreamPinned',
			'recordScreenSharePublication',
			'clearScreenSharePublication',
			'setLastScreenPinned'
		]);
		meetStorageService = jasmine.createSpyObj<MeetStorageService>('MeetStorageService', ['getLocalTileFloating']);
		meetStorageService.getLocalTileFloating.and.returnValue(null);
		dialogService = jasmine.createSpyObj<DialogService>('DialogService', [
			'showBlockingDialog',
			'closeBlockingDialog'
		]);

		const participantServiceStub = {
			addRemoteParticipant: () => remotes.push({} as ParticipantModel),
			removeRemoteParticipant: () => remotes.pop(),
			remoteParticipants: () => remotes,
			localParticipant: () => undefined,
			updateLocalParticipant: () => {},
			setSpeaking: () => {},
			setEncryptionError: () => {},
			getRemoteParticipantBySid: () => undefined,
			getMyName: () => 'me',
			getMyIdentity: () => 'me',
			removeRemoteParticipantTrack: () => {},
			getConnectionQuality: () => undefined,
			setConnectionQuality: () => {}
		};

		const loggerStub = { get: () => ({ w: () => {}, d: () => {}, e: () => {} }) };

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: StreamLayoutStateService, useValue: streamLayoutService },
				{ provide: ParticipantService, useValue: participantServiceStub as unknown as ParticipantService },
				{ provide: DialogService, useValue: dialogService },
				{ provide: LoggerService, useValue: loggerStub as unknown as LoggerService },
				{
					provide: MeetingLiveKitService,
					useValue: { getRoomName: () => 'room', shouldHandleClientInitiatedDisconnectEvent: true }
				},
				{ provide: MeetingTranslateService, useValue: { translate: (key: string) => key } },
				{ provide: ChatService, useValue: {} },
				{ provide: MeetingUiConfigService, useValue: {} },
				{ provide: RecordingService, useValue: {} },
				{ provide: MeetStorageService, useValue: meetStorageService }
			]
		});

		service = TestBed.inject(MeetingEventsService);

		const doubles = fakeRoom();
		emit = doubles.emit;
		callbacks = {
			onRoomReconnecting: jasmine.createSpy('onRoomReconnecting'),
			onRoomReconnected: jasmine.createSpy('onRoomReconnected'),
			onParticipantLeft: jasmine.createSpy('onParticipantLeft')
		};
		service.bindRoom(doubles.room, callbacks);
	});

	it('docks the local floating video when the last remote participant genuinely leaves', async () => {
		remotes = [{} as ParticipantModel];

		emit(RoomEvent.ParticipantDisconnected, remoteParticipant('PA_bob'));
		await flushMicrotasks();

		expect(streamLayoutService.dockLocalCameraVideo).toHaveBeenCalledTimes(1);
	});

	it('does not dock during the full-reconnect unwind, where Reconnecting fires after the leaves', async () => {
		// Regression: LiveKit's full reconnect emits a real ParticipantDisconnected per remote
		// *before* RoomEvent.Reconnecting, which used to dock (and lose) the floating local video.
		remotes = [{} as ParticipantModel];

		emit(RoomEvent.ParticipantDisconnected, remoteParticipant('PA_bob'));
		emit(RoomEvent.Reconnecting);
		await flushMicrotasks();

		expect(streamLayoutService.dockLocalCameraVideo).not.toHaveBeenCalled();
	});

	it('does not dock when the unwind follows a resume attempt (SignalReconnecting)', async () => {
		remotes = [{} as ParticipantModel];

		emit(RoomEvent.SignalReconnecting);
		emit(RoomEvent.ParticipantDisconnected, remoteParticipant('PA_bob'));
		await flushMicrotasks();

		expect(streamLayoutService.dockLocalCameraVideo).not.toHaveBeenCalled();
	});

	it('keeps the local video floating across a reconnect where the remotes come back', async () => {
		remotes = [{} as ParticipantModel, {} as ParticipantModel];

		emit(RoomEvent.SignalReconnecting);
		emit(RoomEvent.ParticipantDisconnected, remoteParticipant('PA_bob'));
		emit(RoomEvent.ParticipantDisconnected, remoteParticipant('PA_carol'));
		emit(RoomEvent.Reconnecting);
		emit(RoomEvent.Reconnected);
		// LiveKit replays the buffered ParticipantConnected events synchronously after Reconnected.
		emit(RoomEvent.ParticipantConnected, remoteParticipant('PA_bob'));
		emit(RoomEvent.ParticipantConnected, remoteParticipant('PA_carol'));
		await flushMicrotasks();

		expect(streamLayoutService.dockLocalCameraVideo).not.toHaveBeenCalled();
	});

	it('docks after Reconnected when nobody came back from the reconnect', async () => {
		remotes = [{} as ParticipantModel];

		emit(RoomEvent.SignalReconnecting);
		emit(RoomEvent.ParticipantDisconnected, remoteParticipant('PA_bob'));
		emit(RoomEvent.Reconnecting);
		emit(RoomEvent.Reconnected);
		await flushMicrotasks();

		expect(streamLayoutService.dockLocalCameraVideo).toHaveBeenCalledTimes(1);
	});

	it('docks a genuine last leave once the reconnect has completed', async () => {
		remotes = [{} as ParticipantModel];

		emit(RoomEvent.ParticipantDisconnected, remoteParticipant('PA_bob'));
		emit(RoomEvent.Reconnecting);
		emit(RoomEvent.Reconnected);
		emit(RoomEvent.ParticipantConnected, remoteParticipant('PA_bob'));
		await flushMicrotasks();

		expect(streamLayoutService.dockLocalCameraVideo).not.toHaveBeenCalled();

		emit(RoomEvent.ParticipantDisconnected, remoteParticipant('PA_bob'));
		await flushMicrotasks();

		expect(streamLayoutService.dockLocalCameraVideo).toHaveBeenCalledTimes(1);
	});

	it('auto-floats the local video when the first remote participant joins', () => {
		emit(RoomEvent.ParticipantConnected, remoteParticipant('PA_bob'));

		expect(streamLayoutService.floatLocalCameraVideo).toHaveBeenCalledTimes(1);
	});

	it('does not auto-float when the user has explicitly docked their tile before', () => {
		meetStorageService.getLocalTileFloating.and.returnValue(false);

		emit(RoomEvent.ParticipantConnected, remoteParticipant('PA_bob'));

		expect(streamLayoutService.floatLocalCameraVideo).not.toHaveBeenCalled();
	});
	it('tells the participant the connection is lost, with nothing to answer', () => {
		emit(RoomEvent.Reconnecting);

		expect(dialogService.showBlockingDialog).toHaveBeenCalledWith({
			title: 'ERRORS.CONNECTION',
			message: 'ERRORS.RECONNECT'
		});
	});

	it('says nothing while the connection is only being resumed, which the participant never notices', () => {
		emit(RoomEvent.SignalReconnecting);

		expect(dialogService.showBlockingDialog).not.toHaveBeenCalled();
	});

	it('takes the notice away once the connection is back', () => {
		emit(RoomEvent.Reconnecting);

		emit(RoomEvent.Reconnected);

		expect(dialogService.closeBlockingDialog).toHaveBeenCalled();
	});
});

/**
 * `bindRoom` is the meeting's entire subscription surface: every reaction to what happens in the
 * room hangs off one `room.on` call made there. A registration that stops being made takes its
 * feature with it and nothing fails, because the handler is simply never invoked.
 */
describe('MeetingEventsService (the room events it binds to)', () => {
	let service: MeetingEventsService;
	let participantService: jasmine.SpyObj<ParticipantService>;
	let streamLayoutService: jasmine.SpyObj<StreamLayoutStateService>;
	let emit: (event: RoomEvent, ...args: unknown[]) => void;
	let registeredEvents: () => RoomEvent[];

	beforeEach(() => {
		participantService = jasmine.createSpyObj<ParticipantService>('ParticipantService', [
			'addRemoteParticipant',
			'removeRemoteParticipant',
			'remoteParticipants',
			'localParticipant',
			'updateLocalParticipant',
			'setSpeaking',
			'setEncryptionError',
			'getRemoteParticipantBySid',
			'getMyName',
			'getMyIdentity',
			'removeRemoteParticipantTrack',
			'getConnectionQuality',
			'setConnectionQuality'
		]);
		participantService.remoteParticipants.and.returnValue([]);
		participantService.getConnectionQuality.and.returnValue(undefined);
		streamLayoutService = jasmine.createSpyObj<StreamLayoutStateService>('StreamLayoutStateService', [
			'dockLocalCameraVideo',
			'floatLocalCameraVideo',
			'unpinAllStreams',
			'toggleStreamPinned',
			'recordScreenSharePublication',
			'clearScreenSharePublication',
			'setLastScreenPinned'
		]);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: ParticipantService, useValue: participantService },
				{ provide: StreamLayoutStateService, useValue: streamLayoutService },
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{
					provide: DialogService,
					useValue: jasmine.createSpyObj('DialogService', ['showBlockingDialog', 'closeBlockingDialog'])
				},
				{ provide: MeetingLiveKitService, useValue: { getRoomName: () => 'room' } },
				{ provide: MeetingTranslateService, useValue: { translate: (key: string) => key } },
				{ provide: ChatService, useValue: {} },
				{ provide: MeetingUiConfigService, useValue: {} },
				{ provide: RecordingService, useValue: {} },
				{ provide: MeetStorageService, useValue: { getLocalTileFloating: () => null } }
			]
		});

		service = TestBed.inject(MeetingEventsService);

		const doubles = fakeRoom();
		emit = doubles.emit;
		registeredEvents = doubles.events;
		service.bindRoom(doubles.room, {
			onRoomReconnecting: () => {},
			onRoomReconnected: () => {},
			onParticipantLeft: () => {}
		});
	});

	it('listens for every event the meeting reacts to', () => {
		expect(registeredEvents()).toEqual(
			jasmine.arrayWithExactContents([
				RoomEvent.EncryptionError,
				RoomEvent.ActiveSpeakersChanged,
				RoomEvent.ParticipantConnected,
				RoomEvent.ParticipantDisconnected,
				RoomEvent.ParticipantNameChanged,
				RoomEvent.TrackPublished,
				RoomEvent.TrackSubscribed,
				RoomEvent.TrackUnpublished,
				RoomEvent.TrackUnsubscribed,
				RoomEvent.TrackMuted,
				RoomEvent.TrackUnmuted,
				RoomEvent.LocalTrackPublished,
				RoomEvent.LocalTrackUnpublished,
				RoomEvent.DataReceived,
				RoomEvent.SignalReconnecting,
				RoomEvent.Reconnecting,
				RoomEvent.Reconnected,
				RoomEvent.Disconnected,
				RoomEvent.ConnectionQualityChanged
			])
		);
	});

	it('publishes the speakers it is told about', () => {
		const speakers = [{ sid: 'PA_ana' }];

		emit(RoomEvent.ActiveSpeakersChanged, speakers);

		expect(service.activeSpeakers()).toBe(speakers as never);
		expect(participantService.setSpeaking).toHaveBeenCalledWith(speakers as never);
	});

	it('marks the participant whose frames cannot be decrypted, and lets an ownerless error be', () => {
		emit(RoomEvent.EncryptionError, new Error('bad key'), { sid: 'PA_ana' });

		expect(participantService.setEncryptionError).toHaveBeenCalledWith('PA_ana', true);

		participantService.setEncryptionError.calls.reset();
		emit(RoomEvent.EncryptionError, new Error('bad key'));

		expect(participantService.setEncryptionError).not.toHaveBeenCalled();
	});

	it('pins a screen share the moment it is subscribed', () => {
		emit(
			RoomEvent.TrackSubscribed,
			{ sid: 'TR_screen', source: Track.Source.ScreenShare },
			{},
			remoteParticipant('PA_ana')
		);

		expect(streamLayoutService.unpinAllStreams).toHaveBeenCalled();
		expect(streamLayoutService.toggleStreamPinned).toHaveBeenCalledWith('TR_screen');
		expect(streamLayoutService.recordScreenSharePublication).toHaveBeenCalledWith('TR_screen', jasmine.any(Number));
	});

	it('leaves the layout alone for a camera track', () => {
		emit(
			RoomEvent.TrackSubscribed,
			{ sid: 'TR_camera', source: Track.Source.Camera },
			{},
			remoteParticipant('PA_ana')
		);

		expect(streamLayoutService.unpinAllStreams).not.toHaveBeenCalled();
		expect(participantService.addRemoteParticipant).toHaveBeenCalled();
	});

	it('takes note of a participant that published or unpublished a track', () => {
		emit(RoomEvent.TrackPublished, {}, remoteParticipant('PA_ana'));
		emit(RoomEvent.TrackUnpublished, {}, remoteParticipant('PA_ana'));

		expect(participantService.addRemoteParticipant).toHaveBeenCalledTimes(2);
	});

	it('re-reads a participant muted or renamed from elsewhere', () => {
		emit(RoomEvent.TrackMuted, {}, { sid: 'PA_ana', isLocal: false });
		emit(RoomEvent.ParticipantNameChanged, 'Ana', { sid: 'PA_ana', isLocal: false });

		expect(participantService.addRemoteParticipant).toHaveBeenCalledTimes(2);

		emit(RoomEvent.TrackUnmuted, {}, { sid: 'me', isLocal: true });

		expect(participantService.updateLocalParticipant).toHaveBeenCalledTimes(1);
	});

	it('re-reads the local participant when its own publications change', () => {
		emit(RoomEvent.LocalTrackPublished);
		emit(RoomEvent.LocalTrackUnpublished);

		expect(participantService.updateLocalParticipant).toHaveBeenCalledTimes(2);
	});

	// The indicator repaints on every change, so a quality that repeats itself is dropped here.
	it('records a connection quality only when it differs from the one it has', () => {
		participantService.getConnectionQuality.and.returnValue(ConnectionQuality.Excellent);

		emit(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Excellent, { sid: 'PA_ana' });

		expect(participantService.setConnectionQuality).not.toHaveBeenCalled();

		emit(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Poor, { sid: 'PA_ana' });

		expect(participantService.setConnectionQuality).toHaveBeenCalledWith('PA_ana', ConnectionQuality.Poor);
	});
});
