import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LeftEventReason, EmbeddedCommand, EmbeddedEvent } from '@openvidu-meet/typings';
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

	/**
	 * Start the bridge with a stubbed parent-origin resolution (the real one reads
	 * `ancestorOrigins`/`referrer`, which the Karma top window does not provide).
	 */
	function startBridge(parentOrigin = PARENT_ORIGIN): void {
		spyOn(service as unknown as { resolveParentOrigin: () => string }, 'resolveParentOrigin').and.returnValue(
			parentOrigin
		);
		service.initialize();
	}

	describe('initialize()', () => {
		it('is a no-op when not running inside an iframe', () => {
			isIframeMode.set(false);
			const addSpy = spyOn(window, 'addEventListener').and.callThrough();

			service.initialize();

			expect(addSpy).not.toHaveBeenCalledWith('message', jasmine.any(Function));
		});

		it('registers the message listener once the parent origin resolves', () => {
			const addSpy = spyOn(window, 'addEventListener').and.callThrough();

			startBridge();

			const messageListenerCalls = addSpy.calls.allArgs().filter(([type]) => type === 'message');
			expect(messageListenerCalls.length).toBe(1);
		});

		it('does not start the bridge when the parent origin cannot be resolved', () => {
			const addSpy = spyOn(window, 'addEventListener').and.callThrough();

			startBridge('');

			const messageListenerCalls = addSpy.calls.allArgs().filter(([type]) => type === 'message');
			expect(messageListenerCalls.length).toBe(0);

			// With the bridge closed, inbound commands are ignored.
			postFromHost({ command: EmbeddedCommand.LEAVE_ROOM });
			expect(wcManager.leaveRoom).not.toHaveBeenCalled();
		});

		it('is idempotent: starting twice attaches the listener only once', () => {
			const addSpy = spyOn(window, 'addEventListener').and.callThrough();

			startBridge();
			service.initialize();

			const messageListenerCalls = addSpy.calls.allArgs().filter(([type]) => type === 'message');
			expect(messageListenerCalls.length).toBe(1);
		});
	});

	describe('command handling (host → app)', () => {
		it('ignores messages from an untrusted origin', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommand.END_MEETING }, 'https://evil.example.com');

			expect(wcManager.endMeeting).not.toHaveBeenCalled();
		});

		it('ignores commands while not connected to the room', () => {
			openviduService.isRoomConnected.and.returnValue(false);
			startBridge();

			postFromHost({ command: EmbeddedCommand.END_MEETING });

			expect(wcManager.endMeeting).not.toHaveBeenCalled();
		});

		it('forwards LEAVE_ROOM to the manager', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommand.LEAVE_ROOM });

			expect(wcManager.leaveRoom).toHaveBeenCalledTimes(1);
		});

		it('forwards END_MEETING to the manager', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommand.END_MEETING });

			expect(wcManager.endMeeting).toHaveBeenCalledTimes(1);
		});

		it('forwards KICK_PARTICIPANT with the participant identity', () => {
			startBridge();

			postFromHost({
				command: EmbeddedCommand.KICK_PARTICIPANT,
				payload: { participantIdentity: IDENTITY }
			});

			expect(wcManager.kickParticipant).toHaveBeenCalledOnceWith(IDENTITY);
		});

		it('ignores KICK_PARTICIPANT without a participant identity', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommand.KICK_PARTICIPANT, payload: {} });

			expect(wcManager.kickParticipant).not.toHaveBeenCalled();
		});

		it('ignores malformed messages (no command)', () => {
			startBridge();

			expect(() => postFromHost({ foo: 'bar' })).not.toThrow();
			expect(wcManager.leaveRoom).not.toHaveBeenCalled();
			expect(wcManager.endMeeting).not.toHaveBeenCalled();
		});

		it('ignores non-object / non-string-command messages without throwing', () => {
			startBridge();

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
			startBridge();

			postFromHost({ command: EmbeddedCommand.KICK_PARTICIPANT, payload: { participantIdentity: '' } });

			expect(wcManager.kickParticipant).not.toHaveBeenCalled();
		});

		it('re-evaluates room connection on every command, not just the first', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommand.LEAVE_ROOM });
			expect(wcManager.leaveRoom).toHaveBeenCalledTimes(1);

			// Connection dropped after the first command: the next one must be rejected.
			openviduService.isRoomConnected.and.returnValue(false);
			postFromHost({ command: EmbeddedCommand.END_MEETING });
			expect(wcManager.endMeeting).not.toHaveBeenCalled();
		});
	});

	describe('event relaying (app → host)', () => {
		it('relays JOINED to the parent at the trusted origin', () => {
			startBridge();

			wcBridge.emitWebComponentEvent({
				type: WebComponentEventType.JOINED,
				roomId: ROOM_ID,
				participantIdentity: IDENTITY
			});
			TestBed.tick();

			expect(postMessageSpy).toHaveBeenCalledOnceWith(
				{ event: EmbeddedEvent.JOINED, payload: { roomId: ROOM_ID, participantIdentity: IDENTITY } },
				PARENT_ORIGIN
			);
		});

		it('relays LEFT including the leave reason', () => {
			startBridge();

			wcBridge.emitWebComponentEvent({
				type: WebComponentEventType.LEFT,
				roomId: ROOM_ID,
				participantIdentity: IDENTITY,
				reason: LeftEventReason.VOLUNTARY_LEAVE
			});
			TestBed.tick();

			expect(postMessageSpy).toHaveBeenCalledOnceWith(
				{
					event: EmbeddedEvent.LEFT,
					payload: { roomId: ROOM_ID, participantIdentity: IDENTITY, reason: LeftEventReason.VOLUNTARY_LEAVE }
				},
				PARENT_ORIGIN
			);
		});

		it('relays CLOSED', () => {
			startBridge();

			wcBridge.emitWebComponentEvent({ type: WebComponentEventType.CLOSED });
			TestBed.tick();

			expect(postMessageSpy).toHaveBeenCalledOnceWith(
				jasmine.objectContaining({ event: EmbeddedEvent.CLOSED }),
				PARENT_ORIGIN
			);
		});

		it('does not relay internal ERROR events (no public iframe event)', () => {
			startBridge();

			wcBridge.emitWebComponentEvent({
				type: WebComponentEventType.ERROR,
				reason: NavigationErrorReason.ROOM_ACCESS_REVOKED
			});
			TestBed.tick();

			expect(postMessageSpy).not.toHaveBeenCalled();
		});

		it('buffers events emitted before the bridge starts, then flushes them', () => {
			// Emitted before the parent origin is known: must stay queued.
			wcBridge.emitWebComponentEvent({
				type: WebComponentEventType.JOINED,
				roomId: ROOM_ID,
				participantIdentity: IDENTITY
			});
			TestBed.tick();
			expect(postMessageSpy).not.toHaveBeenCalled();

			// Starting the bridge resolves the parent origin and flushes the queue.
			startBridge();
			TestBed.tick();

			expect(postMessageSpy).toHaveBeenCalledOnceWith(
				{ event: EmbeddedEvent.JOINED, payload: { roomId: ROOM_ID, participantIdentity: IDENTITY } },
				PARENT_ORIGIN
			);
		});

		it('relays every event emitted within a single tick, in order (no signal coalescing)', () => {
			// The whole reason the bridge uses a FIFO queue instead of a single signal
			// slot: two emits in the same tick would otherwise collapse to the latest
			// value when the effect flushes, silently dropping the first event.
			startBridge();

			wcBridge.emitWebComponentEvent({
				type: WebComponentEventType.JOINED,
				roomId: ROOM_ID,
				participantIdentity: IDENTITY
			});
			wcBridge.emitWebComponentEvent({ type: WebComponentEventType.CLOSED });
			TestBed.tick();

			const relayed = postMessageSpy.calls.allArgs().map(([msg]) => msg.event);
			expect(relayed).toEqual([EmbeddedEvent.JOINED, EmbeddedEvent.CLOSED]);
		});

		it('flushes multiple buffered events in FIFO order once the bridge starts', () => {
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

			startBridge();
			TestBed.tick();

			const relayed = postMessageSpy.calls.allArgs().map(([msg]) => msg.event);
			expect(relayed).toEqual([EmbeddedEvent.JOINED, EmbeddedEvent.LEFT]);
		});
	});

	describe('teardown', () => {
		it('detaches the global message listener when the root injector is destroyed', () => {
			startBridge();
			const removeSpy = spyOn(window, 'removeEventListener').and.callThrough();

			// Destroying the testing module tears down the root injector, which fires the
			// service's DestroyRef.onDestroy cleanup.
			TestBed.resetTestingModule();

			expect(removeSpy).toHaveBeenCalledWith('message', jasmine.any(Function));
		});
	});
});
