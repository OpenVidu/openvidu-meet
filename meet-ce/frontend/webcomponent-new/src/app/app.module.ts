import { Injector } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import type { OpenViduMeetElement, OpenViduMeetElementEventName } from '../webcomponents-types/openvidu-meet.d';
import { App } from './app';

export function setAppInjector(injector: Injector): void {
  registerCustomElement(injector);
}

function registerCustomElement(injector: Injector): void {
  const NgElementConstructor = createCustomElement<OpenViduMeetElement>(App, { injector });

  /**
   * Wrapper that:
   * 1. Forwards imperative methods (endMeeting, leaveRoom, kickParticipant) to the
   *    Angular component instance, since @angular/elements does not expose them on the
   *    custom element by default.
   * 2. Adds convenience event subscription methods (on / once / off) matching the
   *    same API as the legacy iframe-based WebComponent, with type-safe payloads.
   * 3. Emits a `ready` CustomEvent once the Angular component has been initialized,
   *    mirroring the lifecycle signal of the legacy WebComponent.
   */
  const OpenViduMeetWrapper = class extends (NgElementConstructor as any) {
    /**
     * Tracks event handlers registered via `on()` so they can be precisely
     * removed by `off()`.
     * Map<eventName, Map<originalCallback, wrappedListener>>
     */
    private readonly _handlerMap = new Map<string, Map<Function, EventListener>>();

    // ── Lifecycle ────────────────────────────────────────────────────────

    connectedCallback(): void {
      super.connectedCallback();
      // Dispatch `ready` after Angular finishes its first render cycle.
      // Using two microtask ticks to wait for Angular Elements to initialize
      // and render the component tree.
      const el = this as unknown as HTMLElement;
      Promise.resolve().then(() =>
        Promise.resolve().then(() => {
          el.dispatchEvent(
            new CustomEvent('ready', { bubbles: false, composed: true, detail: {} })
          );
        })
      );
    }

    disconnectedCallback(): void {
      super.disconnectedCallback?.();
      // Clean up all tracked handlers on removal to prevent memory leaks.
      const el = this as unknown as HTMLElement;
      this._handlerMap.forEach((handlers, eventName) => {
        handlers.forEach((listener) => el.removeEventListener(eventName, listener));
      });
      this._handlerMap.clear();
    }

    // ── Utility ──────────────────────────────────────────────────────────

    private _getComponentInstance(): App | null {
      const strategy = (this as any).ngElementStrategy;
      const instance = strategy?.componentRef?.instance as App | undefined;
      return instance ?? null;
    }

    // ── Convenience event API (parity with legacy WC + enriched types) ───

    /**
     * Subscribe to a meeting event.
     * The callback receives the typed `CustomEvent.detail` payload directly.
     * Returns the element for chaining.
     */
    on(eventName: OpenViduMeetElementEventName, callback: (detail: any) => void): this {
      const listener: EventListener = (e: Event) => {
        callback((e as CustomEvent).detail);
      };

      if (!this._handlerMap.has(eventName)) {
        this._handlerMap.set(eventName, new Map());
      }

      this._handlerMap.get(eventName)!.set(callback, listener);
      (this as unknown as HTMLElement).addEventListener(eventName, listener);
      return this;
    }

    /**
     * Subscribe to a meeting event once.
     * The handler is automatically removed after the first invocation.
     * Returns the element for chaining.
     */
    once(eventName: OpenViduMeetElementEventName, callback: (detail: any) => void): this {
      const wrapper = (detail: any): void => {
        this.off(eventName, wrapper);
        callback(detail);
      };

      return this.on(eventName, wrapper);
    }

    /**
     * Unsubscribe from a meeting event.
     * If no callback is provided, all handlers for that event are removed.
     * Returns the element for chaining.
     */
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

    // ── Imperative meeting commands ───────────────────────────────────────

    /**
     * Ends the current meeting for all participants.
     * Requires moderator privileges.
     */
    endMeeting(): void {
      this._getComponentInstance()?.endMeeting();
    }

    /**
     * Disconnects the local participant from the current room without ending
     * the meeting for others.
     */
    leaveRoom(): void {
      this._getComponentInstance()?.leaveRoom();
    }

    /**
     * Kicks a participant from the meeting.
     * @param participantIdentity Unique identity of the participant to kick.
     */
    kickParticipant(participantIdentity: string): void {
      this._getComponentInstance()?.kickParticipant(participantIdentity);
    }
  };

  if (!customElements.get('openvidu-meet')) {
    customElements.define('openvidu-meet', OpenViduMeetWrapper as unknown as CustomElementConstructor);
  }
}
