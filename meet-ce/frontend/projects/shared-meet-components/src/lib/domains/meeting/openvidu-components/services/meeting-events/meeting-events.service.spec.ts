import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { ParticipantModel } from '../../models/participant.model';
import { RemoteParticipant, Room, RoomEvent } from '../../services/livekit';
import { ActionService } from '../action/action.service';
import { ChatService } from '../chat/chat.service';
import { MeetingUiConfigService } from '../config/meeting-ui-config.service';
import { StreamLayoutStateService } from '../layout/stream-layout-state.service';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { ParticipantService } from '../participant/participant.service';
import { RecordingService } from '../recording/recording.service';
import { MeetingTranslateService } from '../translate/meeting-translate.service';
import { MeetingEventCallbacks, MeetingEventsService } from './meeting-events.service';

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
		emit: (event: RoomEvent, ...args: unknown[]) => handlers.get(event)?.(...args)
	};
};

const remoteParticipant = (sid: string): RemoteParticipant => ({ sid }) as unknown as RemoteParticipant;

/** The dock/float decisions are deferred with queueMicrotask; awaiting once runs them all. */
const flushMicrotasks = () => Promise.resolve();

describe('MeetingEventsService (reconnection view state)', () => {
	let service: MeetingEventsService;
	let streamLayoutService: jasmine.SpyObj<StreamLayoutStateService>;
	let emit: (event: RoomEvent, ...args: unknown[]) => void;
	let remotes: ParticipantModel[];
	let callbacks: MeetingEventCallbacks;

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
				{
					provide: ActionService,
					useValue: { openConnectionDialog: () => {}, closeConnectionDialog: () => {} }
				},
				{ provide: LoggerService, useValue: loggerStub as unknown as LoggerService },
				{
					provide: MeetingLiveKitService,
					useValue: { getRoomName: () => 'room', shouldHandleClientInitiatedDisconnectEvent: true }
				},
				{ provide: MeetingTranslateService, useValue: { translate: (key: string) => key } },
				{ provide: ChatService, useValue: {} },
				{ provide: MeetingUiConfigService, useValue: {} },
				{ provide: RecordingService, useValue: {} }
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
});
