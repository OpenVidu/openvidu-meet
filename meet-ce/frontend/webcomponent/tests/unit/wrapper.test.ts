import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetParticipantMuteOptions } from '@openvidu-meet/typings';
import { createOpenViduMeetElementClass } from '../../src/app/custom-element/wrapper';

// Minimal stand-in for the Angular Elements base class produced by `createCustomElement()`.
// The wrapper only relies on two things from its superclass:
//   1. `super.connectedCallback()` / `super.disconnectedCallback()` lifecycle hooks, and
//   2. the `ngElementStrategy.componentRef.instance` path used to reach the Angular
//      component when the imperative methods are called.
// Both are stubbed here so the wrapper can be exercised in jsdom without Angular.
class FakeNgElementBase extends HTMLElement {
	// Assigned per test to the component instance the imperative methods should delegate to.
	ngElementStrategy: { componentRef: { instance: unknown } } | undefined;
	// Angular Elements creates and renders the component in its own connectedCallback.
	baseConnections = 0;

	connectedCallback(): void {
		this.baseConnections++;
	}

	disconnectedCallback(): void {}
}

// `disconnectedCallback` is optional on the base class, so the wrapper must not assume it.
class BaseWithoutDisconnect extends HTMLElement {
	connectedCallback(): void {}
}

const TAG = 'openvidu-meet-wrapper-test';
customElements.define(TAG, createOpenViduMeetElementClass(FakeNgElementBase as unknown as CustomElementConstructor));

const TAG_WITHOUT_DISCONNECT = 'openvidu-meet-wrapper-test-partial-base';
customElements.define(
	TAG_WITHOUT_DISCONNECT,
	createOpenViduMeetElementClass(BaseWithoutDisconnect as unknown as CustomElementConstructor)
);

// The component only implements the canonical names; the deprecated element methods are expected
// to route through their canonical twin, so a missing `endMeeting` here is deliberate.
interface ComponentInstance {
	meetingEnd: jest.Mock;
	meetingLeave: jest.Mock;
	participantKick: jest.Mock;
	participantMute: jest.Mock;
	participantMuteAll: jest.Mock;
	mediaToggleAudio: jest.Mock;
	mediaToggleVideo: jest.Mock;
	mediaToggleScreenShare: jest.Mock;
}

interface TestableElement extends FakeNgElementBase {
	on(eventName: string, callback: (detail: unknown) => void): TestableElement;
	once(eventName: string, callback: (detail: unknown) => void): TestableElement;
	off(eventName: string, callback?: (detail: unknown) => void): TestableElement;
	_handlerMap: Map<string, Map<unknown, EventListener>>;
	meetingEnd(): void;
	meetingLeave(): void;
	participantKick(participantIdentity: string): void;
	participantMute(participantIdentity: string, media: MeetParticipantMuteOptions): void;
	participantMuteAll(media: MeetParticipantMuteOptions): void;
	mediaToggleAudio(active?: boolean): void;
	mediaToggleVideo(active?: boolean): void;
	mediaToggleScreenShare(active?: boolean): void;
	endMeeting(): void;
	leaveRoom(): void;
	kickParticipant(participantIdentity: string): void;
}

const createElement = (): TestableElement => document.createElement(TAG) as TestableElement;

const componentInstance = (): ComponentInstance => ({
	meetingEnd: jest.fn(),
	meetingLeave: jest.fn(),
	participantKick: jest.fn(),
	participantMute: jest.fn(),
	participantMuteAll: jest.fn(),
	mediaToggleAudio: jest.fn(),
	mediaToggleVideo: jest.fn(),
	mediaToggleScreenShare: jest.fn()
});

const withComponent = (): [TestableElement, ComponentInstance] => {
	const el = createElement();
	const instance = componentInstance();
	el.ngElementStrategy = { componentRef: { instance } };

	return [el, instance];
};

describe('openvidu-meet custom element', () => {
	afterEach(() => {
		document.body.innerHTML = '';
		jest.restoreAllMocks();
	});

	describe('event subscription', () => {
		let el: TestableElement;

		beforeEach(() => {
			el = createElement();
			document.body.appendChild(el);
		});

		describe('on()', () => {
			it('invokes the callback with the event detail', () => {
				const callback = jest.fn();
				el.on('joined', callback);

				el.dispatchEvent(new CustomEvent('joined', { detail: { roomId: 'r1' } }));

				expect(callback).toHaveBeenCalledWith({ roomId: 'r1' });
			});

			it('returns the element so calls can be chained', () => {
				expect(el.on('joined', () => {})).toBe(el);
			});
		});

		describe('once()', () => {
			it('invokes the callback only for the first matching event', () => {
				const callback = jest.fn();
				el.once('left', callback);

				el.dispatchEvent(new CustomEvent('left', { detail: 1 }));
				el.dispatchEvent(new CustomEvent('left', { detail: 2 }));

				expect(callback).toHaveBeenCalledTimes(1);
				expect(callback).toHaveBeenCalledWith(1);
			});
		});

		describe('off()', () => {
			it('removes only the given callback, and keeps removing them one at a time', () => {
				const callback = jest.fn();
				const other = jest.fn();
				el.on('joined', callback);
				el.on('joined', other);

				el.off('joined', callback);
				el.dispatchEvent(new CustomEvent('joined', { detail: {} }));

				expect(callback).not.toHaveBeenCalled();
				expect(other).toHaveBeenCalledTimes(1);

				el.off('joined', other);
				el.dispatchEvent(new CustomEvent('joined', { detail: {} }));

				expect(other).toHaveBeenCalledTimes(1);
			});

			// A host that subscribes per meeting would otherwise keep every callback of every past
			// meeting alive for as long as the element is on the page.
			it('keeps no bookkeeping for the callbacks it removed', () => {
				const callback = jest.fn();
				el.on('joined', callback);
				el.on('left', callback);

				el.off('joined', callback);
				el.off('left');

				expect(el._handlerMap.size).toBe(0);
			});

			it('removes every callback for the event when none is provided', () => {
				const first = jest.fn();
				const second = jest.fn();
				el.on('joined', first);
				el.on('joined', second);
				el.off('joined');

				el.dispatchEvent(new CustomEvent('joined', { detail: {} }));

				expect(first).not.toHaveBeenCalled();
				expect(second).not.toHaveBeenCalled();
			});

			it('does nothing when the event has no registered callbacks', () => {
				expect(() => el.off('joined')).not.toThrow();
				expect(el.off('joined', jest.fn())).toBe(el);
			});
		});
	});

	describe('lifecycle', () => {
		it('lets the Angular Elements base connect, so the component is created and rendered', () => {
			const el = createElement();

			document.body.appendChild(el);

			expect(el.baseConnections).toBe(1);
		});

		it('disconnects from a base class that does not implement disconnectedCallback', () => {
			const el = document.createElement(TAG_WITHOUT_DISCONNECT) as TestableElement;
			const callback = jest.fn();
			el.on('joined', callback);
			document.body.appendChild(el);

			expect(() => el.remove()).not.toThrow();

			el.dispatchEvent(new CustomEvent('joined', { detail: {} }));

			expect(callback).not.toHaveBeenCalled();
		});

		it('dispatches a composed, non-bubbling "ready" event once connected', async () => {
			const el = createElement();
			const ready = new Promise<CustomEvent>((resolve) => {
				el.addEventListener('ready', (e) => resolve(e as CustomEvent), { once: true });
			});

			document.body.appendChild(el);
			const event = await ready;

			expect(event.bubbles).toBe(false);
			expect(event.composed).toBe(true);
			expect(event.detail).toEqual({});
		});

		it('removes all registered callbacks when disconnected from the DOM', () => {
			const el = createElement();
			const callback = jest.fn();
			el.on('joined', callback);

			document.body.appendChild(el);
			document.body.removeChild(el); // triggers disconnectedCallback

			el.dispatchEvent(new CustomEvent('joined', { detail: {} }));

			expect(callback).not.toHaveBeenCalled();
			expect(el._handlerMap.size).toBe(0);
		});
	});

	describe('imperative commands', () => {
		const mute: MeetParticipantMuteOptions = { audioActive: false };

		// Every command the element publishes, with the arguments the component must receive
		// untouched: the element is a transport, it decides nothing.
		const commands: [keyof ComponentInstance, (el: TestableElement) => void, unknown[]][] = [
			['meetingEnd', (el) => el.meetingEnd(), []],
			['meetingLeave', (el) => el.meetingLeave(), []],
			['participantKick', (el) => el.participantKick('participant-1'), ['participant-1']],
			['participantMute', (el) => el.participantMute('participant-1', mute), ['participant-1', mute]],
			['participantMuteAll', (el) => el.participantMuteAll(mute), [mute]],
			['mediaToggleAudio', (el) => el.mediaToggleAudio(false), [false]],
			['mediaToggleVideo', (el) => el.mediaToggleVideo(true), [true]],
			['mediaToggleScreenShare', (el) => el.mediaToggleScreenShare(false), [false]]
		];

		it.each(commands)('%s() reaches the Angular component instance as it was called', (name, call, args) => {
			const [el, instance] = withComponent();

			call(el);

			expect(instance[name]).toHaveBeenCalledWith(...args);
		});

		it.each(commands)('%s() is a no-op while the Angular component instance is missing', (_name, call) => {
			const el = createElement();
			el.ngElementStrategy = undefined;

			expect(() => call(el)).not.toThrow();
		});
	});

	// A host written against 3.8.0 calls these names on the element and must reach the same
	// component method, so the deprecation window is behaviour-preserving rather than a promise.
	describe('deprecated command aliases', () => {
		it('endMeeting() reaches the component through meetingEnd()', () => {
			const [el, instance] = withComponent();

			el.endMeeting();

			expect(instance.meetingEnd).toHaveBeenCalledTimes(1);
		});

		it('leaveRoom() reaches the component through meetingLeave()', () => {
			const [el, instance] = withComponent();

			el.leaveRoom();

			expect(instance.meetingLeave).toHaveBeenCalledTimes(1);
		});

		it('kickParticipant() reaches the component through participantKick(), identity intact', () => {
			const [el, instance] = withComponent();

			el.kickParticipant('participant-1');

			expect(instance.participantKick).toHaveBeenCalledWith('participant-1');
		});

		it('are no-ops when the Angular component instance is not yet available', () => {
			const el = createElement();
			el.ngElementStrategy = undefined;

			expect(() => {
				el.endMeeting();
				el.leaveRoom();
				el.kickParticipant('participant-1');
			}).not.toThrow();
		});
	});
});
