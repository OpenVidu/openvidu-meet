import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AssetsService } from '../../../../../shared/services/assets.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { MeetingUiConfigService } from '../config/meeting-ui-config.service';
import { DeviceService } from '../device/device.service';
import { ConnectionState, Room, RoomEvent } from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { MediaStorageService } from '../storage/storage.service';
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

	/**
	 * What `MeetingViewComponent.ngOnDestroy` used to do from outside the service, taking its
	 * connection-state subscription down with everyone else's.
	 */
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

	beforeEach(() => {
		room = new FakeRoom();
		livekitSdkService = jasmine.createSpyObj<LivekitSdkService>('LivekitSdkService', [
			'createRoom',
			'connectRoom',
			'disconnectRoom'
		]);
		livekitSdkService.createRoom.and.returnValue(room as unknown as Room);
		livekitSdkService.disconnectRoom.and.resolveTo();

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingLiveKitService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: LivekitSdkService, useValue: livekitSdkService },
				{
					provide: DeviceService,
					useValue: {
						cameraSelected: () => undefined,
						microphoneSelected: () => undefined
					} as unknown as DeviceService
				},
				{
					provide: MediaStorageService,
					useValue: { getParticipantName: () => null } as unknown as MediaStorageService
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

		// Defence in depth for the bug teardown() fixes: even if some other code strips the room's
		// listeners, reusing that room must not leave the state frozen for the rest of the meeting.
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

	// The Room's lifecycle belongs to this service alone. Before teardown() existed, the meeting view
	// released the outgoing Room with `getRoom().removeAllListeners()` and left `this.room` in place:
	// the next meeting reused a Room nobody was listening to any more and ran with the connection
	// state frozen at 'disconnected', which silently disabled every media command and toolbar click.
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

			// The outgoing room can no longer write the state...
			expect(service.connectionState()).toBe(ConnectionState.Disconnected);
			// ...but whoever else was listening to it still hears it.
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
});
