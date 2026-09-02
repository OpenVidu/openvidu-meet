import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MeetMeetingInfo } from '@openvidu-meet/typings';
import { AssetsService } from '../../../../../shared/services/assets.service';
import { HttpService } from '../../../../../shared/services/http.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { MeetingUiConfigService } from '../config/meeting-ui-config.service';
import { DeviceService } from '../device/device.service';
import { ConnectionError, ConnectionState, Room, RoomEvent } from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { MeetingLiveKitService } from './meeting-livekit.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

/**
 * Minimal stand-in for the LiveKit Room: the connection state plus the event registration the
 * service uses to follow it. `emitConnectionState` reproduces LiveKit's own order — mutate `state`,
 * then notify — so a handler reading `room.state` sees the new value, as it does in production.
 */
class FakeRoom {
	state: ConnectionState = ConnectionState.Disconnected;
	private readonly handlers = new Map<string, ((...args: unknown[]) => void)[]>();

	on(event: string, handler: (...args: unknown[]) => void): this {
		this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
		return this;
	}

	off(event: string, handler: (...args: unknown[]) => void): this {
		this.handlers.set(
			event,
			(this.handlers.get(event) ?? []).filter((registered) => registered !== handler)
		);
		return this;
	}

	/** What a third party doing `getRoom().removeAllListeners()` leaves behind. */
	removeAllListeners(): this {
		this.handlers.clear();
		return this;
	}

	listenerCount(event: string): number {
		return (this.handlers.get(event) ?? []).length;
	}

	emitConnectionState(state: ConnectionState): void {
		this.state = state;
		(this.handlers.get(RoomEvent.ConnectionStateChanged) ?? []).forEach((handler) => handler(state));
	}
}

describe('MeetingLiveKitService', () => {
	let service: MeetingLiveKitService;
	let room: FakeRoom;
	let livekitSdkService: jasmine.SpyObj<LivekitSdkService>;
	let httpService: jasmine.SpyObj<HttpService>;

	beforeEach(() => {
		room = new FakeRoom();
		livekitSdkService = jasmine.createSpyObj<LivekitSdkService>('LivekitSdkService', [
			'createRoom',
			'connectRoom',
			'disconnectRoom'
		]);
		livekitSdkService.createRoom.and.returnValue(room as unknown as Room);
		livekitSdkService.disconnectRoom.and.resolveTo();
		httpService = jasmine.createSpyObj<HttpService>('HttpService', ['getRequest']);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingLiveKitService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LivekitSdkService, useValue: livekitSdkService },
				{ provide: HttpService, useValue: httpService },
				{
					provide: DeviceService,
					useValue: {
						cameraSelected: () => undefined,
						microphoneSelected: () => undefined
					} as unknown as DeviceService
				},
				// No E2EE key: init() takes the plain path and never touches the worker.
				{
					provide: MeetingUiConfigService,
					useValue: { getE2EEKey: () => undefined } as unknown as MeetingUiConfigService
				},
				{ provide: AssetsService, useValue: {} as unknown as AssetsService }
			]
		});

		service = TestBed.inject(MeetingLiveKitService);
	});

	describe('connection state', () => {
		it('starts disconnected before any room exists', () => {
			expect(service.connectionState()).toBe(ConnectionState.Disconnected);
			expect(service.isConnected()).toBeFalse();
			expect(service.isReconnecting()).toBeFalse();
		});

		it('seeds the state from the room it just created rather than assuming it', () => {
			room.state = ConnectionState.Connecting;

			service.init();

			expect(service.connectionState()).toBe(ConnectionState.Connecting);
		});

		it('follows every connection transition of the room', () => {
			service.init();

			room.emitConnectionState(ConnectionState.Connecting);
			expect(service.isConnected()).toBeFalse();

			room.emitConnectionState(ConnectionState.Connected);
			expect(service.isConnected()).toBeTrue();

			room.emitConnectionState(ConnectionState.Reconnecting);
			expect(service.isConnected()).toBeFalse();

			room.emitConnectionState(ConnectionState.Connected);
			expect(service.isConnected()).toBeTrue();

			room.emitConnectionState(ConnectionState.Disconnected);
			expect(service.isConnected()).toBeFalse();
		});

		it('reports a full reconnect but not a signal-only one', () => {
			service.init();

			room.emitConnectionState(ConnectionState.Reconnecting);
			expect(service.isReconnecting()).toBeTrue();

			// SignalReconnecting keeps media flowing: the toolbar must not show a lost connection,
			// but the participant is not "connected" either — same as before this became a signal.
			room.emitConnectionState(ConnectionState.SignalReconnecting);
			expect(service.isReconnecting()).toBeFalse();
			expect(service.isConnected()).toBeFalse();
		});

		it('subscribes exactly once per room, so the state has a single writer', () => {
			service.init();
			service.init();
			service.init();

			expect(livekitSdkService.createRoom).toHaveBeenCalledTimes(1);
			expect(room.listenerCount(RoomEvent.ConnectionStateChanged)).toBe(1);
		});

		// Defence in depth: even if some other code strips the room's listeners, reusing that room must
		// not leave the state frozen for the rest of the meeting.
		it('re-arms its own subscription when it reuses a room whose listeners were stripped', () => {
			service.init();
			room.emitConnectionState(ConnectionState.Connected);
			room.removeAllListeners();

			service.init();

			expect(room.listenerCount(RoomEvent.ConnectionStateChanged)).toBe(1);
			room.emitConnectionState(ConnectionState.Disconnected);
			expect(service.isConnected()).toBeFalse();
			room.emitConnectionState(ConnectionState.Connected);
			expect(service.isConnected()).toBeTrue();
		});
	});

	describe('disconnect()', () => {
		// The embedded command bridge relies on this: `meetingLeave` is safe to call in any phase.
		it('is a no-op while not connected', async () => {
			service.init();

			await service.disconnect();

			expect(livekitSdkService.disconnectRoom).not.toHaveBeenCalled();
		});

		it('disconnects and runs the callback once connected', async () => {
			service.init();
			room.emitConnectionState(ConnectionState.Connected);
			const callback = jasmine.createSpy('callback');

			await service.disconnect(callback);

			expect(livekitSdkService.disconnectRoom).toHaveBeenCalledOnceWith(room as unknown as Room);
			expect(callback).toHaveBeenCalledTimes(1);
		});
	});

	// The Room's lifecycle belongs to this service alone: releasing it from outside with
	// `removeAllListeners()` while leaving `this.room` in place is what left the next meeting reusing a
	// Room nobody listened to, with its connection state frozen at 'disconnected'.
	describe('teardown()', () => {
		it('is a no-op when no room was ever created', async () => {
			await service.teardown();

			expect(livekitSdkService.disconnectRoom).not.toHaveBeenCalled();
			expect(service.isInitialized()).toBeFalse();
		});

		it('disconnects a connected room and releases it', async () => {
			service.init();
			room.emitConnectionState(ConnectionState.Connected);

			await service.teardown();

			expect(livekitSdkService.disconnectRoom).toHaveBeenCalledOnceWith(room as unknown as Room);
			expect(service.isInitialized()).toBeFalse();
			expect(service.connectionState()).toBe(ConnectionState.Disconnected);
		});

		// disconnect() guards on isConnected(), so it skips a room that never finished connecting.
		// Teardown must still close it instead of leaving it negotiating in the background.
		it('closes a room caught mid-connect', async () => {
			service.init();
			room.emitConnectionState(ConnectionState.Connecting);

			await service.teardown();

			expect(livekitSdkService.disconnectRoom).toHaveBeenCalledOnceWith(room as unknown as Room);
			expect(service.isInitialized()).toBeFalse();
		});

		it('does not disconnect a room that is already disconnected', async () => {
			service.init();

			await service.teardown();

			expect(livekitSdkService.disconnectRoom).not.toHaveBeenCalled();
			expect(service.isInitialized()).toBeFalse();
		});

		it('removes only its own subscription, leaving other subscribers of the room alone', async () => {
			const otherSubscriber = jasmine.createSpy('otherSubscriber');
			service.init();
			room.on(RoomEvent.ConnectionStateChanged, otherSubscriber);
			room.emitConnectionState(ConnectionState.Connected);

			await service.teardown();
			room.emitConnectionState(ConnectionState.Connected);

			expect(service.connectionState()).toBe(ConnectionState.Disconnected);
			// The other subscriber of that same Room keeps hearing it.
			expect(otherSubscriber).toHaveBeenCalledTimes(2);
		});

		it('lets the next init() build a fresh room that the state follows again', async () => {
			const nextRoom = new FakeRoom();
			livekitSdkService.createRoom.and.returnValues(room as unknown as Room, nextRoom as unknown as Room);
			service.init();
			room.emitConnectionState(ConnectionState.Connected);
			await service.teardown();

			service.init();
			nextRoom.emitConnectionState(ConnectionState.Connected);

			expect(livekitSdkService.createRoom).toHaveBeenCalledTimes(2);
			expect(service.isConnected()).toBeTrue();
		});

		it('restores the client-initiated disconnect handling for the next meeting', async () => {
			service.init();
			room.emitConnectionState(ConnectionState.Connected);
			await service.disconnect(undefined, false);
			room.emitConnectionState(ConnectionState.Disconnected);
			expect(service.shouldHandleClientInitiatedDisconnectEvent).toBeFalse();

			await service.teardown();

			expect(service.shouldHandleClientInitiatedDisconnectEvent).toBeTrue();
		});
	});

	/**
	 * A full meeting and a broken network both reach connect() as a rejection, and only the first one
	 * deserves the room-full message. LiveKit cannot tell them apart on its own: it reports its
	 * `maxParticipants` rejection as `InternalError`, the same bucket as any unexplained server
	 * failure, so occupancy is confirmed against Meet's own API before that message is shown.
	 */
	describe('connect()', () => {
		/** What livekit-client throws when the server refused the upgrade without explaining itself. */
		const unexplainedServerError = () => ConnectionError.internal('unknown websocket error', { status: 200 });

		beforeEach(() => {
			// A room member token as the backend mints them: Meet's own data, the room id included,
			// travels in the JWT's `metadata` claim.
			const metadata = JSON.stringify({ roomId: 'room-1' });
			service.initializeAndSetToken(`header.${btoa(JSON.stringify({ metadata }))}.signature`, 'wss://lk.test');
		});

		it('resolves when the connection succeeds', async () => {
			livekitSdkService.connectRoom.and.resolveTo();

			await expectAsync(service.connect()).toBeResolved();
		});

		it('reports MEETING_FULL when the meeting is at capacity', async () => {
			livekitSdkService.connectRoom.and.rejectWith(unexplainedServerError());
			httpService.getRequest.and.resolveTo({ participantCount: 3, maxParticipants: 3 } as MeetMeetingInfo);

			await expectAsync(service.connect()).toBeRejectedWith(jasmine.objectContaining({ code: 'MEETING_FULL' }));
			expect(httpService.getRequest).toHaveBeenCalledOnceWith(
				'api/v1/meetings/room-1',
				jasmine.objectContaining({ 'x-ov-skip-auth-recovery': 'true' })
			);
		});

		it('reports a connection error when the meeting is below capacity', async () => {
			livekitSdkService.connectRoom.and.rejectWith(unexplainedServerError());
			httpService.getRequest.and.resolveTo({ participantCount: 1, maxParticipants: 3 } as MeetMeetingInfo);

			await expectAsync(service.connect()).toBeRejectedWith(
				jasmine.objectContaining({ code: 'CONNECTION_ERROR' })
			);
		});

		it('reports a connection error when the meeting admits unlimited participants', async () => {
			livekitSdkService.connectRoom.and.rejectWith(unexplainedServerError());
			httpService.getRequest.and.resolveTo({ participantCount: 10 } as MeetMeetingInfo);

			await expectAsync(service.connect()).toBeRejectedWith(
				jasmine.objectContaining({ code: 'CONNECTION_ERROR' })
			);
		});

		it('reports a connection error when the occupancy cannot be read', async () => {
			livekitSdkService.connectRoom.and.rejectWith(unexplainedServerError());
			httpService.getRequest.and.rejectWith(new Error('meetingRead denied'));

			await expectAsync(service.connect()).toBeRejectedWith(
				jasmine.objectContaining({ code: 'CONNECTION_ERROR' })
			);
		});

		// Reasons LiveKit already explains: asking Meet about them would delay the error the
		// participant is waiting for, behind an unreachable server, on the very request that cannot
		// answer either.
		it('does not ask about occupancy when the server was unreachable', async () => {
			livekitSdkService.connectRoom.and.rejectWith(ConnectionError.serverUnreachable('down'));

			await expectAsync(service.connect()).toBeRejectedWith(
				jasmine.objectContaining({ code: 'CONNECTION_ERROR' })
			);
			expect(httpService.getRequest).not.toHaveBeenCalled();
		});

		it('does not ask about occupancy when the token was rejected', async () => {
			livekitSdkService.connectRoom.and.rejectWith(ConnectionError.notAllowed('invalid token', 401));

			await expectAsync(service.connect()).toBeRejectedWith(
				jasmine.objectContaining({ code: 'CONNECTION_ERROR' })
			);
			expect(httpService.getRequest).not.toHaveBeenCalled();
		});

		it('does not ask about occupancy when the token carries no room id', async () => {
			service.initializeAndSetToken(`header.${btoa('{}')}.signature`, 'wss://lk.test');
			livekitSdkService.connectRoom.and.rejectWith(unexplainedServerError());

			await expectAsync(service.connect()).toBeRejectedWith(
				jasmine.objectContaining({ code: 'CONNECTION_ERROR' })
			);
			expect(httpService.getRequest).not.toHaveBeenCalled();
		});

		it('keeps the LiveKit failure as the cause of the error it throws', async () => {
			const livekitFailure = unexplainedServerError();
			livekitSdkService.connectRoom.and.rejectWith(livekitFailure);
			httpService.getRequest.and.rejectWith(new Error('unreachable'));

			await expectAsync(service.connect()).toBeRejectedWith(
				jasmine.objectContaining({ cause: livekitFailure })
			);
		});
	});
});
