import type { OpenViduMeetElementEventName } from '../../webcomponents-types/openvidu-meet';
import type { App } from '../app';

/**
 * Wraps the Angular Elements base class to add: imperative methods
 * (endMeeting, leaveRoom, kickParticipant), convenience event API (on/once/off),
 * and a `ready` CustomEvent dispatched after first render.
 */
export function createOpenViduMeetElementClass(
	NgElementConstructor: CustomElementConstructor
): CustomElementConstructor {
	return class extends (NgElementConstructor as any) {
		private readonly _handlerMap = new Map<string, Map<Function, EventListener>>();

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

		endMeeting(): void {
			this._getComponentInstance()?.endMeeting();
		}

		leaveRoom(): void {
			this._getComponentInstance()?.leaveRoom();
		}

		kickParticipant(participantIdentity: string): void {
			this._getComponentInstance()?.kickParticipant(participantIdentity);
		}

		private _getComponentInstance(): App | null {
			// Accesses Angular Elements internal strategy to reach the component instance.
			const strategy = (this as any).ngElementStrategy;
			const instance = strategy?.componentRef?.instance as App | undefined;
			return instance ?? null;
		}
	} as unknown as CustomElementConstructor;
}
