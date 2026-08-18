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

			expect(livekitSdkService.createRoom).toHaveBeenCalledTimes(1);
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
});
