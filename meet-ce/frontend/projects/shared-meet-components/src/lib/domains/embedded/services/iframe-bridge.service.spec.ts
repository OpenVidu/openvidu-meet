import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EmbeddedCommandName, EmbeddedEventName, LeftEventReason } from '@openvidu-meet/typings';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { EmbeddedCommandService } from './embedded-command.service';
import { EmbeddedEventBusService } from './embedded-event-bus.service';
import { IframeBridgeService } from './iframe-bridge.service';
import { LoggerService } from '../../../shared/services/logger.service';

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

describe('IframeBridgeService', () => {
	let service: IframeBridgeService;
	let eventBus: EmbeddedEventBusService;
	let commandService: jasmine.SpyObj<EmbeddedCommandService>;
	let isIframeMode: WritableSignal<boolean>;
	let postMessageSpy: jasmine.Spy;

	beforeEach(() => {
		isIframeMode = signal(true);
		// Only the canonical methods are stubbed: the bridge resolves the alias itself, so a
		// deprecated command arriving over postMessage must still land on the canonical method.
		commandService = jasmine.createSpyObj<EmbeddedCommandService>('EmbeddedCommandService', [
			'meetingEnd',
			'meetingLeave',
			'participantKick',
			'mediaToggleAudio',
			'mediaToggleVideo',
			'mediaToggleScreenShare'
		]);
		commandService.meetingEnd.and.resolveTo();
		commandService.meetingLeave.and.resolveTo();
		commandService.participantKick.and.resolveTo();
		commandService.mediaToggleAudio.and.resolveTo();
		commandService.mediaToggleVideo.and.resolveTo();
		commandService.mediaToggleScreenShare.and.resolveTo();

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				IframeBridgeService,
				EmbeddedEventBusService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: EmbeddedCommandService, useValue: commandService },
				{ provide: RuntimeConfigService, useValue: { isIframeMode } as unknown as RuntimeConfigService }
			]
		});

		// Spy before the service can post anything; default spy does NOT call through.
		postMessageSpy = spyOn(window.parent, 'postMessage');
		eventBus = TestBed.inject(EmbeddedEventBusService);
		service = TestBed.inject(IframeBridgeService);
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
			postFromHost({ command: EmbeddedCommandName.MEETING_LEAVE });
			expect(commandService.meetingLeave).not.toHaveBeenCalled();
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

			postFromHost({ command: EmbeddedCommandName.MEETING_END }, 'https://evil.example.com');

			expect(commandService.meetingEnd).not.toHaveBeenCalled();
		});

		it('forwards MEETING_LEAVE to the manager', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommandName.MEETING_LEAVE });

			expect(commandService.meetingLeave).toHaveBeenCalledTimes(1);
		});

		it('forwards MEETING_END to the manager', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommandName.MEETING_END });

			expect(commandService.meetingEnd).toHaveBeenCalledTimes(1);
		});

		it('forwards PARTICIPANT_KICK with the participant identity', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommandName.PARTICIPANT_KICK, payload: { participantIdentity: IDENTITY } });

			expect(commandService.participantKick).toHaveBeenCalledOnceWith(IDENTITY);
		});

		it('ignores PARTICIPANT_KICK without a participant identity', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommandName.PARTICIPANT_KICK });

			expect(commandService.participantKick).not.toHaveBeenCalled();
		});

		it('ignores malformed messages (no command)', () => {
			startBridge();

			expect(() => postFromHost({ foo: 'bar' })).not.toThrow();
			expect(commandService.meetingLeave).not.toHaveBeenCalled();
			expect(commandService.meetingEnd).not.toHaveBeenCalled();
		});

		it('ignores non-object / non-string-command messages without throwing', () => {
			startBridge();

			// Foreign postMessage traffic (extensions, HMR, libraries) and junk payloads
			// must never reach the manager or crash the handler.
			expect(() => postFromHost(null)).not.toThrow();
			expect(() => postFromHost(undefined)).not.toThrow();
			expect(() => postFromHost('meetingLeave')).not.toThrow();
			expect(() => postFromHost(42)).not.toThrow();
			expect(() => postFromHost({ command: 123 })).not.toThrow();

			expect(commandService.meetingLeave).not.toHaveBeenCalled();
			expect(commandService.meetingEnd).not.toHaveBeenCalled();
			expect(commandService.participantKick).not.toHaveBeenCalled();
		});

		it('ignores an unknown command name', () => {
			startBridge();

			postFromHost({ command: 'meetingSelfDestruct' });

			expect(commandService.meetingLeave).not.toHaveBeenCalled();
			expect(commandService.meetingEnd).not.toHaveBeenCalled();
			expect(commandService.participantKick).not.toHaveBeenCalled();
		});

		it('ignores PARTICIPANT_KICK with an empty participant identity', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommandName.PARTICIPANT_KICK, payload: { participantIdentity: '' } });

			expect(commandService.participantKick).not.toHaveBeenCalled();
		});

		// The bridge forwards without gating; phase and permission are enforced by EmbeddedCommandService.
		describe('media toggle commands', () => {
			it('forwards MEDIA_TOGGLE_AUDIO with its explicit enabled flag', () => {
				startBridge();

				postFromHost({ command: EmbeddedCommandName.MEDIA_TOGGLE_AUDIO, payload: { enabled: false } });

				expect(commandService.mediaToggleAudio).toHaveBeenCalledOnceWith(false);
			});

			it('forwards MEDIA_TOGGLE_AUDIO without payload as a toggle (undefined enabled)', () => {
				startBridge();

				postFromHost({ command: EmbeddedCommandName.MEDIA_TOGGLE_AUDIO });

				expect(commandService.mediaToggleAudio).toHaveBeenCalledOnceWith(undefined);
			});

			it('forwards MEDIA_TOGGLE_VIDEO with its explicit enabled flag', () => {
				startBridge();

				postFromHost({ command: EmbeddedCommandName.MEDIA_TOGGLE_VIDEO, payload: { enabled: true } });

				expect(commandService.mediaToggleVideo).toHaveBeenCalledOnceWith(true);
			});

			it('forwards MEDIA_TOGGLE_VIDEO without payload as a toggle (undefined enabled)', () => {
				startBridge();

				postFromHost({ command: EmbeddedCommandName.MEDIA_TOGGLE_VIDEO });

				expect(commandService.mediaToggleVideo).toHaveBeenCalledOnceWith(undefined);
			});

			it('forwards MEDIA_TOGGLE_SCREEN_SHARE with its explicit enabled flag', () => {
				startBridge();

				postFromHost({ command: EmbeddedCommandName.MEDIA_TOGGLE_SCREEN_SHARE, payload: { enabled: true } });

				expect(commandService.mediaToggleScreenShare).toHaveBeenCalledOnceWith(true);
			});

			it('forwards MEDIA_TOGGLE_SCREEN_SHARE without payload as a toggle (undefined enabled)', () => {
				startBridge();

				postFromHost({ command: EmbeddedCommandName.MEDIA_TOGGLE_SCREEN_SHARE });

				expect(commandService.mediaToggleScreenShare).toHaveBeenCalledOnceWith(undefined);
			});
		});
	});

	// A host page written against 3.8.0 keeps posting the old strings. They must reach the same
	// canonical handler, unchanged, for the whole deprecation window.
	describe('deprecated command names (host → app)', () => {
		it('resolves LEAVE_ROOM to meetingLeave()', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommandName.LEAVE_ROOM });

			expect(commandService.meetingLeave).toHaveBeenCalledTimes(1);
		});

		it('resolves END_MEETING to meetingEnd()', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommandName.END_MEETING });

			expect(commandService.meetingEnd).toHaveBeenCalledTimes(1);
		});

		it('resolves KICK_PARTICIPANT to participantKick(), identity intact', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommandName.KICK_PARTICIPANT, payload: { participantIdentity: IDENTITY } });

			expect(commandService.participantKick).toHaveBeenCalledOnceWith(IDENTITY);
		});

		it('ignores KICK_PARTICIPANT without a participant identity', () => {
			startBridge();

			postFromHost({ command: EmbeddedCommandName.KICK_PARTICIPANT });

			expect(commandService.participantKick).not.toHaveBeenCalled();
		});
	});

	describe('event relaying (app → host)', () => {
		// The bus only ever queues canonical events (see EmbeddedEventBusService); the bridge is
		// responsible for also posting the deprecated 3.8.0 name, since a host still on that wire
		// format would see nothing without it. A host listening for both receives each event twice.
		it('relays MEETING_JOINED, then its deprecated JOINED alias, to the parent at the trusted origin', () => {
			startBridge();

			eventBus.emit({
				event: EmbeddedEventName.MEETING_JOINED,
				payload: { roomId: ROOM_ID, participantIdentity: IDENTITY }
			});
			TestBed.tick();

			expect(postMessageSpy.calls.allArgs()).toEqual([
				[
					{
						event: EmbeddedEventName.MEETING_JOINED,
						payload: { roomId: ROOM_ID, participantIdentity: IDENTITY }
					},
					PARENT_ORIGIN
				],
				[
					{ event: EmbeddedEventName.JOINED, payload: { roomId: ROOM_ID, participantIdentity: IDENTITY } },
					PARENT_ORIGIN
				]
			]);
		});

		it('relays MEETING_LEFT and its deprecated LEFT alias, including the leave reason', () => {
			startBridge();

			eventBus.emit({
				event: EmbeddedEventName.MEETING_LEFT,
				payload: { roomId: ROOM_ID, participantIdentity: IDENTITY, reason: LeftEventReason.VOLUNTARY_LEAVE }
			});
			TestBed.tick();

			const payload = { roomId: ROOM_ID, participantIdentity: IDENTITY, reason: LeftEventReason.VOLUNTARY_LEAVE };
			expect(postMessageSpy.calls.allArgs()).toEqual([
				[{ event: EmbeddedEventName.MEETING_LEFT, payload }, PARENT_ORIGIN],
				[{ event: EmbeddedEventName.LEFT, payload }, PARENT_ORIGIN]
			]);
		});

		it('relays MEETING_CLOSED and its deprecated CLOSED alias', () => {
			startBridge();

			eventBus.emit({ event: EmbeddedEventName.MEETING_CLOSED });
			TestBed.tick();

			const relayed = postMessageSpy.calls.allArgs().map(([msg]) => msg.event);
			expect(relayed).toEqual([EmbeddedEventName.MEETING_CLOSED, EmbeddedEventName.CLOSED]);
		});

		it('buffers events emitted before the bridge starts, then flushes canonical and legacy once it does', () => {
			// Emitted before the parent origin is known: must stay queued.
			eventBus.emit({
				event: EmbeddedEventName.MEETING_JOINED,
				payload: { roomId: ROOM_ID, participantIdentity: IDENTITY }
			});
			TestBed.tick();
			expect(postMessageSpy).not.toHaveBeenCalled();

			// Starting the bridge resolves the parent origin and flushes the queue.
			startBridge();
			TestBed.tick();

			const relayed = postMessageSpy.calls.allArgs().map(([msg]) => msg.event);
			expect(relayed).toEqual([EmbeddedEventName.MEETING_JOINED, EmbeddedEventName.JOINED]);
		});

		it('relays every queued event within a single tick, in order, each with its legacy pair (no signal coalescing)', () => {
			// The whole reason the bridge uses a FIFO queue instead of a single signal
			// slot: two emits in the same tick would otherwise collapse to the latest
			// value when the effect flushes, silently dropping the first event.
			startBridge();

			eventBus.emit({
				event: EmbeddedEventName.MEETING_JOINED,
				payload: { roomId: ROOM_ID, participantIdentity: IDENTITY }
			});
			eventBus.emit({ event: EmbeddedEventName.MEETING_CLOSED });
			TestBed.tick();

			const relayed = postMessageSpy.calls.allArgs().map(([msg]) => msg.event);
			expect(relayed).toEqual([
				EmbeddedEventName.MEETING_JOINED,
				EmbeddedEventName.JOINED,
				EmbeddedEventName.MEETING_CLOSED,
				EmbeddedEventName.CLOSED
			]);
		});

		it('flushes multiple buffered events in FIFO order once the bridge starts, each with its legacy pair', () => {
			// Queued before the parent origin is known.
			eventBus.emit({
				event: EmbeddedEventName.MEETING_JOINED,
				payload: { roomId: ROOM_ID, participantIdentity: IDENTITY }
			});
			eventBus.emit({
				event: EmbeddedEventName.MEETING_LEFT,
				payload: { roomId: ROOM_ID, participantIdentity: IDENTITY, reason: LeftEventReason.VOLUNTARY_LEAVE }
			});
			TestBed.tick();
			expect(postMessageSpy).not.toHaveBeenCalled();

			startBridge();
			TestBed.tick();

			const relayed = postMessageSpy.calls.allArgs().map(([msg]) => msg.event);
			expect(relayed).toEqual([
				EmbeddedEventName.MEETING_JOINED,
				EmbeddedEventName.JOINED,
				EmbeddedEventName.MEETING_LEFT,
				EmbeddedEventName.LEFT
			]);
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
