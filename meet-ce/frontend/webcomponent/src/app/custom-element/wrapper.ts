import type { OpenViduMeetElementEventName } from '../../webcomponents-types/openvidu-meet';
import type { App } from '../app';

/**
 * Builds the custom-element class that backs `<openvidu-meet>`.
 *
 * The base class is the `NgElementConstructor` produced by
 * `@angular/elements`. This wrapper adds three things that Angular Elements
 * doesn't supply out of the box:
 *
 * 1. **Imperative methods** (`endMeeting`, `leaveRoom`, `kickParticipant`)
 *    forwarded to the underlying Angular component instance.
 * 2. **Convenience event subscription API** (`on` / `once` / `off`) matching
 *    the legacy iframe-based WebComponent, with typed event-name autocomplete.
 * 3. **`ready` CustomEvent** dispatched after Angular finishes its first render.
 *
 * Memory: handlers registered via `on()` are tracked and torn down in
 * `disconnectedCallback()` so the element doesn't leak listeners on removal.
 */
export function createOpenViduMeetElementClass(
	NgElementConstructor: CustomElementConstructor
): CustomElementConstructor {
	return class extends (NgElementConstructor as any) {
		/** Tracks `on()` handlers so `off()` can remove the exact wrapped listener. */
		private readonly _handlerMap = new Map<string, Map<Function, EventListener>>();

		// ── Lifecycle ────────────────────────────────────────────────────────

		connectedCallback(): void {
			super.connectedCallback();
			// Dispatch `ready` after Angular finishes its first render cycle.
			// Two microtask ticks wait for Angular Elements to initialize and
			// render the component tree.
			const el = this as unknown as HTMLElement;
			Promise.resolve().then(() =>
				Promise.resolve().then(() => {
					el.dispatchEvent(new CustomEvent('ready', { bubbles: false, composed: true, detail: {} }));
				})
			);
		}

		disconnectedCallback(): void {
			super.disconnectedCallback?.();
			const el = this as unknown as HTMLElement;
			this._handlerMap.forEach((handlers, eventName) => {
				handlers.forEach((listener) => el.removeEventListener(eventName, listener));
			});
			this._handlerMap.clear();
		}

		// ── Convenience event API ────────────────────────────────────────────

		on(eventName: OpenViduMeetElementEventName, callback: (detail: any) => void): this {
			const listener: EventListener = (e: Event) => callback((e as CustomEvent).detail);

			if (!this._handlerMap.has(eventName)) {
				this._handlerMap.set(eventName, new Map());
			}

			this._handlerMap.get(eventName)!.set(callback, listener);
			(this as unknown as HTMLElement).addEventListener(eventName, listener);
			return this;
		}

		once(eventName: OpenViduMeetElementEventName, callback: (detail: any) => void): this {
			const wrapper = (detail: any): void => {
				this.off(eventName, wrapper);
				callback(detail);
			};

			return this.on(eventName, wrapper);
		}

		off(eventName: OpenViduMeetElementEventName, callback?: (detail: any) => void): this {
			const handlers = this._handlerMap.get(eventName);

			if (!handlers) return this;

			const el = this as unknown as HTMLElement;

			if (!callback) {
				handlers.forEach((listener) => el.removeEventListener(eventName, listener));
				this._handlerMap.delete(eventName);
			} else {
				const listener = handlers.get(callback);

				if (listener) {
					el.removeEventListener(eventName, listener);
					handlers.delete(callback);

					if (handlers.size === 0) this._handlerMap.delete(eventName);
				}
			}

			return this;
		}

		// ── Imperative commands ──────────────────────────────────────────────

		endMeeting(): void {
			this._getComponentInstance()?.endMeeting();
		}

		leaveRoom(): void {
			this._getComponentInstance()?.leaveRoom();
		}

		kickParticipant(participantIdentity: string): void {
			this._getComponentInstance()?.kickParticipant(participantIdentity);
		}

		// ── Internal ─────────────────────────────────────────────────────────

		private _getComponentInstance(): App | null {
			const strategy = (this as any).ngElementStrategy;
			const instance = strategy?.componentRef?.instance as App | undefined;
			return instance ?? null;
		}
	} as unknown as CustomElementConstructor;
}
