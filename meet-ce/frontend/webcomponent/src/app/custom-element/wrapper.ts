import { EmbeddedEventName, EmbeddedEventPayloadFor } from '@openvidu-meet/typings';
import type { App } from '../app';

/**
 * Wraps the Angular Elements base class to add: imperative methods
 * (meetingEnd, meetingLeave, participantKick — plus their deprecated 3.8.0 spellings),
 * convenience event API (on/once/off), and a `ready` CustomEvent dispatched after first render.
 */
export function createOpenViduMeetElementClass(
	NgElementConstructor: CustomElementConstructor
): CustomElementConstructor {
	return class extends (NgElementConstructor as any) {
		// Keyed by the caller's handler, so `off()` can find the wrapper it was registered with.
		private readonly _handlerMap = new Map<string, Map<(...args: never[]) => unknown, EventListener>>();

		connectedCallback(): void {
			super.connectedCallback();
			const el = this as unknown as HTMLElement;
			// Two microtask ticks let Angular Elements initialize and complete first render.
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

		on(
			eventName: EmbeddedEventName,
			callback: (eventPayload: EmbeddedEventPayloadFor<EmbeddedEventName>) => void
		): this {
			const listener: EventListener = (e: Event) => callback((e as CustomEvent).detail);

			if (!this._handlerMap.has(eventName)) {
				this._handlerMap.set(eventName, new Map());
			}

			this._handlerMap.get(eventName)!.set(callback, listener);
			(this as unknown as HTMLElement).addEventListener(eventName, listener);
			return this;
		}

		once(
			eventName: EmbeddedEventName,
			callback: (eventPayload: EmbeddedEventPayloadFor<EmbeddedEventName>) => void
		): this {
			const wrapper = (eventPayload: EmbeddedEventPayloadFor<EmbeddedEventName>): void => {
				this.off(eventName, wrapper);
				callback(eventPayload);
			};

			return this.on(eventName, wrapper);
		}

		off(
			eventName: EmbeddedEventName,
			callback?: (eventPayload: EmbeddedEventPayloadFor<EmbeddedEventName>) => void
		): this {
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

		meetingEnd(): void {
			this._getComponentInstance()?.meetingEnd();
		}

		meetingLeave(): void {
			this._getComponentInstance()?.meetingLeave();
		}

		participantKick(participantIdentity: string): void {
			this._getComponentInstance()?.participantKick(participantIdentity);
		}

		mediaToggleAudio(enabled?: boolean): void {
			this._getComponentInstance()?.mediaToggleAudio(enabled);
		}

		mediaToggleVideo(enabled?: boolean): void {
			this._getComponentInstance()?.mediaToggleVideo(enabled);
		}

		mediaToggleScreenShare(enabled?: boolean): void {
			this._getComponentInstance()?.mediaToggleScreenShare(enabled);
		}

		// ── Deprecated method aliases ────────────────────────────────────────
		// Kept on the element (the public surface) rather than on the component, and routed
		// through the canonical method so both spellings share exactly one path.

		/** @deprecated Renamed to `meetingEnd()`. Removed in 3.12.0. */
		endMeeting(): void {
			this.meetingEnd();
		}

		/** @deprecated Renamed to `meetingLeave()`. Removed in 3.12.0. */
		leaveRoom(): void {
			this.meetingLeave();
		}

		/** @deprecated Renamed to `participantKick()`. Removed in 3.12.0. */
		kickParticipant(participantIdentity: string): void {
			this.participantKick(participantIdentity);
		}

		private _getComponentInstance(): App | null {
			// Accesses Angular Elements internal strategy to reach the component instance.
			const strategy = (this as any).ngElementStrategy;
			const instance = strategy?.componentRef?.instance as App | undefined;
			return instance ?? null;
		}
	} as unknown as CustomElementConstructor;
}
