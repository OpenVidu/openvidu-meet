import { ApplicationRef, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LeftEventReason, WebComponentCommand, WebComponentEvent } from '@openvidu-meet/typings';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { WebComponentEventType } from '../../../shared/models/webcomponent-bridge.model';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { WebComponentBridgeService } from '../../../shared/services/webcomponent-bridge.service';
import { LoggerService, OpenViduService } from '../openvidu-components';
import { MeetingIframeBridgeService } from './meeting-iframe-bridge.service';
import { MeetingWebComponentManagerService } from './meeting-webcomponent-manager.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

const PARENT_ORIGIN = 'https://host.example.com';
const ROOM_ID = 'room1';
const IDENTITY = 'participant-1';

/** Simulate a message arriving from the host (the iframe's parent). */
function postFromHost(data: unknown, origin = PARENT_ORIGIN): void {
	window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

describe('MeetingIframeBridgeService', () => {
	let service: MeetingIframeBridgeService;
	let wcBridge: WebComponentBridgeService;
	let wcManager: jasmine.SpyObj<MeetingWebComponentManagerService>;
	let openviduService: { isRoomConnected: jasmine.Spy };
	let isIframeMode: WritableSignal<boolean>;
	let postMessageSpy: jasmine.Spy;

	beforeEach(() => {
		isIframeMode = signal(true);
		wcManager = jasmine.createSpyObj<MeetingWebComponentManagerService>('MeetingWebComponentManagerService', [
			'endMeeting',
			'leaveRoom',
			'kickParticipant'
		]);
		wcManager.endMeeting.and.resolveTo();
		wcManager.leaveRoom.and.resolveTo();
		wcManager.kickParticipant.and.resolveTo();
		openviduService = { isRoomConnected: jasmine.createSpy('isRoomConnected').and.returnValue(true) };

		TestBed.configureTestingModule({
			providers: [
				MeetingIframeBridgeService,
				WebComponentBridgeService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: MeetingWebComponentManagerService, useValue: wcManager },
				{ provide: OpenViduService, useValue: openviduService as unknown as OpenViduService },
				{ provide: RuntimeConfigService, useValue: { isIframeMode } as unknown as RuntimeConfigService }
			]
		});

		// Spy before the service can post anything; default spy does NOT call through.
		postMessageSpy = spyOn(window.parent, 'postMessage');
		wcBridge = TestBed.inject(WebComponentBridgeService);
		service = TestBed.inject(MeetingIframeBridgeService);
	});

	/** Start the bridge and complete the READY → INITIALIZE handshake. */
	function initializeAndHandshake(): void {
		service.initialize();
		postFromHost({ command: WebComponentCommand.INITIALIZE, payload: { domain: PARENT_ORIGIN } });
	}

	describe('initialize()', () => {
		it('is a no-op when not running inside an iframe', () => {
			isIframeMode.set(false);
			const addSpy = spyOn(window, 'addEventListener').and.callThrough();

			service.initialize();

			expect(postMessageSpy).not.toHaveBeenCalled();
			expect(addSpy).not.toHaveBeenCalledWith('message', jasmine.any(Function));
		});

		it('announces READY to the parent with a wildcard target origin', () => {
			service.initialize();

			expect(postMessageSpy).toHaveBeenCalledOnceWith({ event: WebComponentEvent.READY, payload: {} }, '*');
		});

		it('is idempotent (announces READY only once)', () => {
			service.initialize();
			service.initialize();

			const readyCalls = postMessageSpy.calls.allArgs().filter(([msg]) => msg.event === WebComponentEvent.READY);
			expect(readyCalls.length).toBe(1);
		});
	});

	describe('command handling (host → app)', () => {
		it('ignores commands received before the INITIALIZE handshake', () => {
			service.initialize();

			postFromHost({ command: WebComponentCommand.LEAVE_ROOM });

			expect(wcManager.leaveRoom).not.toHaveBeenCalled();
		});

		it('ignores INITIALIZE without a domain, so later commands stay rejected', () => {
			service.initialize();

			postFromHost({ command: WebComponentCommand.INITIALIZE, payload: {} });
			postFromHost({ command: WebComponentCommand.LEAVE_ROOM });

			expect(wcManager.leaveRoom).not.toHaveBeenCalled();
		});

		it('ignores messages from an untrusted origin once the parent is known', () => {
			initializeAndHandshake();

			postFromHost({ command: WebComponentCommand.END_MEETING }, 'https://evil.example.com');

			expect(wcManager.endMeeting).not.toHaveBeenCalled();
		});

		it('ignores commands while not connected to the room', () => {
			openviduService.isRoomConnected.and.returnValue(false);
			initializeAndHandshake();

			postFromHost({ command: WebComponentCommand.END_MEETING });

			expect(wcManager.endMeeting).not.toHaveBeenCalled();
		});

		it('forwards LEAVE_ROOM to the manager', () => {
			initializeAndHandshake();

			postFromHost({ command: WebComponentCommand.LEAVE_ROOM });

			expect(wcManager.leaveRoom).toHaveBeenCalledTimes(1);
		});

		it('forwards END_MEETING to the manager', () => {
			initializeAndHandshake();

			postFromHost({ command: WebComponentCommand.END_MEETING });

			expect(wcManager.endMeeting).toHaveBeenCalledTimes(1);
		});

		it('forwards KICK_PARTICIPANT with the participant identity', () => {
			initializeAndHandshake();

			postFromHost({
				command: WebComponentCommand.KICK_PARTICIPANT,
				payload: { participantIdentity: IDENTITY }
			});

			expect(wcManager.kickParticipant).toHaveBeenCalledOnceWith(IDENTITY);
		});

		it('ignores KICK_PARTICIPANT without a participant identity', () => {
			initializeAndHandshake();

			postFromHost({ command: WebComponentCommand.KICK_PARTICIPANT, payload: {} });

			expect(wcManager.kickParticipant).not.toHaveBeenCalled();
		});

		it('ignores malformed messages (no command)', () => {
			initializeAndHandshake();

			expect(() => postFromHost({ foo: 'bar' })).not.toThrow();
			expect(wcManager.leaveRoom).not.toHaveBeenCalled();
			expect(wcManager.endMeeting).not.toHaveBeenCalled();
		});

		it('ignores non-object / non-string-command messages without throwing', () => {
			initializeAndHandshake();

			// Foreign postMessage traffic (extensions, HMR, libraries) and junk payloads
			// must never reach the manager or crash the handler.
			expect(() => postFromHost(null)).not.toThrow();
			expect(() => postFromHost(undefined)).not.toThrow();
			expect(() => postFromHost('leaveRoom')).not.toThrow();
			expect(() => postFromHost(42)).not.toThrow();
			expect(() => postFromHost({ command: 123 })).not.toThrow();

			expect(wcManager.leaveRoom).not.toHaveBeenCalled();
			expect(wcManager.endMeeting).not.toHaveBeenCalled();
			expect(wcManager.kickParticipant).not.toHaveBeenCalled();
		});

		it('ignores KICK_PARTICIPANT with an empty participant identity', () => {
			initializeAndHandshake();

			postFromHost({ command: WebComponentCommand.KICK_PARTICIPANT, payload: { participantIdentity: '' } });

			expect(wcManager.kickParticipant).not.toHaveBeenCalled();
		});

		it('re-evaluates room connection on every command, not just the first', () => {
			initializeAndHandshake();

			postFromHost({ command: WebComponentCommand.LEAVE_ROOM });
			expect(wcManager.leaveRoom).toHaveBeenCalledTimes(1);

			// Connection dropped after the first command: the next one must be rejected.
			openviduService.isRoomConnected.and.returnValue(false);
			postFromHost({ command: WebComponentCommand.END_MEETING });
			expect(wcManager.endMeeting).not.toHaveBeenCalled();
		});
	});

	describe('handshake origin security', () => {
		it('rejects an INITIALIZE whose claimed domain does not match the sender origin', () => {
			service.initialize();

			// A rogue frame posts from evil.example.com but claims to be the real host.
			postFromHost(
				{ command: WebComponentCommand.INITIALIZE, payload: { domain: PARENT_ORIGIN } },
				'https://evil.example.com'
			);

			// The handshake must NOT have completed: a command — even one purporting to
			// arrive from the claimed (trusted-looking) origin — is still rejected.
			postFromHost({ command: WebComponentCommand.LEAVE_ROOM }, PARENT_ORIGIN);
			expect(wcManager.leaveRoom).not.toHaveBeenCalled();

			// A genuine handshake (sender origin === claimed domain) still works afterwards,
			// proving the bridge wasn't left permanently wedged by the spoof attempt.
			postFromHost(
				{ command: WebComponentCommand.INITIALIZE, payload: { domain: PARENT_ORIGIN } },
				PARENT_ORIGIN
			);
			postFromHost({ command: WebComponentCommand.LEAVE_ROOM }, PARENT_ORIGIN);
			expect(wcManager.leaveRoom).toHaveBeenCalledTimes(1);
		});

		it('locks the trusted origin on first handshake; a later INITIALIZE cannot move it', () => {
			initializeAndHandshake(); // trusts PARENT_ORIGIN

			// A second INITIALIZE, even delivered from the already-trusted origin, must not
			// re-point trust to a different domain.
			postFromHost(
				{ command: WebComponentCommand.INITIALIZE, payload: { domain: 'https://evil.example.com' } },
				PARENT_ORIGIN
			);

			// Commands from the original trusted origin still work...
			postFromHost({ command: WebComponentCommand.LEAVE_ROOM }, PARENT_ORIGIN);
			expect(wcManager.leaveRoom).toHaveBeenCalledTimes(1);

			// ...and commands from the newly-claimed origin remain rejected.
			postFromHost({ command: WebComponentCommand.END_MEETING }, 'https://evil.example.com');
			expect(wcManager.endMeeting).not.toHaveBeenCalled();
		});
	});

	describe('event relaying (app → host)', () => {
		it('relays JOINED to the parent at the trusted origin', () => {
			initializeAndHandshake();
			postMessageSpy.calls.reset();

			wcBridge.emitWebComponentEvent({
				type: WebComponentEventType.JOINED,
				roomId: ROOM_ID,
				participantIdentity: IDENTITY
			});
			TestBed.tick();

			expect(postMessageSpy).toHaveBeenCalledOnceWith(
				{ event: WebComponentEvent.JOINED, payload: { roomId: ROOM_ID, participantIdentity: IDENTITY } },
				PARENT_ORIGIN
			);
		});

		it('relays LEFT including the leave reason', () => {
			initializeAndHandshake();
			postMessageSpy.calls.reset();

			wcBridge.emitWebComponentEvent({
				type: WebComponentEventType.LEFT,
				roomId: ROOM_ID,
				participantIdentity: IDENTITY,
				reason: LeftEventReason.VOLUNTARY_LEAVE
			});
			TestBed.tick();

			expect(postMessageSpy).toHaveBeenCalledOnceWith(
				{
					event: WebComponentEvent.LEFT,
					payload: { roomId: ROOM_ID, participantIdentity: IDENTITY, reason: LeftEventReason.VOLUNTARY_LEAVE }
				},
				PARENT_ORIGIN
			);
		});

		it('relays CLOSED', () => {
			initializeAndHandshake();
			postMessageSpy.calls.reset();

			wcBridge.emitWebComponentEvent({ type: WebComponentEventType.CLOSED });
			TestBed.tick();

			expect(postMessageSpy).toHaveBeenCalledOnceWith(
				jasmine.objectContaining({ event: WebComponentEvent.CLOSED }),
				PARENT_ORIGIN
			);
		});

		it('does not relay internal ERROR events (no public iframe event)', () => {
			initializeAndHandshake();
			postMessageSpy.calls.reset();

			wcBridge.emitWebComponentEvent({
				type: WebComponentEventType.ERROR,
				reason: NavigationErrorReason.ROOM_ACCESS_REVOKED
			});
			TestBed.tick();

			expect(postMessageSpy).not.toHaveBeenCalled();
		});

		it('buffers events until the handshake completes, then flushes them', () => {
			service.initialize();
			postMessageSpy.calls.reset();

			// Emitted before the parent origin is known: must stay queued.
			wcBridge.emitWebComponentEvent({
				type: WebComponentEventType.JOINED,
				roomId: ROOM_ID,
				participantIdentity: IDENTITY
			});
			TestBed.tick();
			expect(postMessageSpy).not.toHaveBeenCalled();

			// Completing the handshake flushes the queued event.
			postFromHost({ command: WebComponentCommand.INITIALIZE, payload: { domain: PARENT_ORIGIN } });
			TestBed.tick();

			expect(postMessageSpy).toHaveBeenCalledOnceWith(
				{ event: WebComponentEvent.JOINED, payload: { roomId: ROOM_ID, participantIdentity: IDENTITY } },
				PARENT_ORIGIN
			);
		});

		it('relays every event emitted within a single tick, in order (no signal coalescing)', () => {
			// The whole reason the bridge uses a FIFO queue instead of a single signal
			// slot: two emits in the same tick would otherwise collapse to the latest
			// value when the effect flushes, silently dropping the first event.
			initializeAndHandshake();
			postMessageSpy.calls.reset();

			wcBridge.emitWebComponentEvent({
				type: WebComponentEventType.JOINED,
				roomId: ROOM_ID,
				participantIdentity: IDENTITY
			});
			wcBridge.emitWebComponentEvent({ type: WebComponentEventType.CLOSED });
			TestBed.tick();

			const relayed = postMessageSpy.calls.allArgs().map(([msg]) => msg.event);
			expect(relayed).toEqual([WebComponentEvent.JOINED, WebComponentEvent.CLOSED]);
		});

		it('flushes multiple buffered events in FIFO order once the handshake completes', () => {
			service.initialize();
			postMessageSpy.calls.reset();

			// Queued before the parent origin is known.
			wcBridge.emitWebComponentEvent({
				type: WebComponentEventType.JOINED,
				roomId: ROOM_ID,
				participantIdentity: IDENTITY
			});
			wcBridge.emitWebComponentEvent({
				type: WebComponentEventType.LEFT,
				roomId: ROOM_ID,
				participantIdentity: IDENTITY,
				reason: LeftEventReason.VOLUNTARY_LEAVE
			});
			TestBed.tick();
			expect(postMessageSpy).not.toHaveBeenCalled();

			postFromHost({ command: WebComponentCommand.INITIALIZE, payload: { domain: PARENT_ORIGIN } });
			TestBed.tick();

			const relayed = postMessageSpy.calls.allArgs().map(([msg]) => msg.event);
			expect(relayed).toEqual([WebComponentEvent.JOINED, WebComponentEvent.LEFT]);
		});
	});

	describe('teardown', () => {
		it('detaches the global message listener when the root injector is destroyed', () => {
			initializeAndHandshake();
			const removeSpy = spyOn(window, 'removeEventListener').and.callThrough();

			// Destroying the testing module tears down the root injector, which fires the
			// service's DestroyRef.onDestroy cleanup.
			TestBed.resetTestingModule();

			expect(removeSpy).toHaveBeenCalledWith('message', jasmine.any(Function));
		});
	});
});
