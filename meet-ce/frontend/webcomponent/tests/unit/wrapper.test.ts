import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
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
	connectedCallback(): void {}
	disconnectedCallback(): void {}
}

const TAG = 'openvidu-meet-wrapper-test';
customElements.define(TAG, createOpenViduMeetElementClass(FakeNgElementBase as unknown as CustomElementConstructor));

interface ComponentInstance {
	endMeeting: jest.Mock;
	leaveRoom: jest.Mock;
	kickParticipant: jest.Mock;
}

interface TestableElement extends FakeNgElementBase {
	on(eventName: string, callback: (detail: unknown) => void): TestableElement;
	once(eventName: string, callback: (detail: unknown) => void): TestableElement;
	off(eventName: string, callback?: (detail: unknown) => void): TestableElement;
	endMeeting(): void;
	leaveRoom(): void;
	kickParticipant(participantIdentity: string): void;
}

const createElement = (): TestableElement => document.createElement(TAG) as TestableElement;

const componentInstance = (): ComponentInstance => ({
	endMeeting: jest.fn(),
	leaveRoom: jest.fn(),
	kickParticipant: jest.fn()
});

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
			it('removes only the given callback when one is provided', () => {
				const callback = jest.fn();
				el.on('joined', callback);
				el.off('joined', callback);

				el.dispatchEvent(new CustomEvent('joined', { detail: {} }));

				expect(callback).not.toHaveBeenCalled();
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
			});
		});
	});

	describe('lifecycle', () => {
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
		});
	});

	describe('imperative commands', () => {
		it('endMeeting() delegates to the Angular component instance', () => {
			const el = createElement();
			const instance = componentInstance();
			el.ngElementStrategy = { componentRef: { instance } };

			el.endMeeting();

			expect(instance.endMeeting).toHaveBeenCalledTimes(1);
		});

		it('leaveRoom() delegates to the Angular component instance', () => {
			const el = createElement();
			const instance = componentInstance();
			el.ngElementStrategy = { componentRef: { instance } };

			el.leaveRoom();

			expect(instance.leaveRoom).toHaveBeenCalledTimes(1);
		});

		it('kickParticipant() passes the participant identity to the Angular component instance', () => {
			const el = createElement();
			const instance = componentInstance();
			el.ngElementStrategy = { componentRef: { instance } };

			el.kickParticipant('participant-1');

			expect(instance.kickParticipant).toHaveBeenCalledWith('participant-1');
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
