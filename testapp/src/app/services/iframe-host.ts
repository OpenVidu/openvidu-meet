import { Injectable } from '@angular/core';
import {
	createWebComponentCommandMessage,
	WebComponentCommand,
	WebComponentEvent,
	WebComponentInboundCommandMessage,
	WebComponentOutboundEventMessage
} from '@openvidu-meet/typings';

/** Receives a lifecycle event posted by the embedded iframe. */
export type IframeLifecycleHandler = (event: WebComponentEvent, payload: unknown) => void;

/**
 * Host-side `postMessage` controller for the **iframe** integration — the piece a
 * real host page implements to embed Meet via a raw `<iframe>` (see the iframe
 * integration tutorial). It mirrors the v3.7.0 webcomponent host
 * (`CommandsManager` + `EventsManager`):
 *
 * - waits for the app's `READY` event and replies with `INITIALIZE` (handshake),
 *   handing the app the host origin it should trust;
 * - validates that inbound events come from the iframe's origin;
 * - relays `joined/left/closed` to the caller;
 * - sends `endMeeting/leaveRoom/kickParticipant` commands.
 *
 * It exposes the SAME public API as the `<openvidu-meet>` element, so the testapp
 * (and the e2e suite) drive both integrations identically — only the transport differs.
 */
@Injectable({ providedIn: 'root' })
export class IframeHostService {
	private iframe: HTMLIFrameElement | null = null;
	/** The iframe's resolved origin. Empty means "unknown" → the bridge stays closed (never `'*'`). */
	private targetOrigin = '';
	private onEvent: IframeLifecycleHandler | null = null;
	/** Pending fallback handshake timer (see {@link scheduleHandshakeFallback}); `null` when idle. */
	private handshakeFallback: ReturnType<typeof setTimeout> | null = null;
	private readonly boundMessage = (event: MessageEvent): void => this.handleMessage(event);

	/**
	 * Begin driving an iframe.
	 *
	 * @param targetOrigin The iframe's origin. When empty (or the legacy `'*'`), it is
	 *   derived from the iframe `src` rather than falling back to a wildcard — an
	 *   allowlist of one anchored to a real origin, never "any origin".
	 */
	attach(iframe: HTMLIFrameElement, targetOrigin: string, onEvent: IframeLifecycleHandler): void {
		this.detach();
		this.iframe = iframe;
		this.targetOrigin = this.resolveTargetOrigin(iframe, targetOrigin);
		this.onEvent = onEvent;

		if (!this.targetOrigin) {
			// Without a concrete origin we can neither post commands safely nor validate
			// inbound events, so we refuse to talk to the iframe rather than open up to '*'.
			console.warn('IframeHostService: could not determine the iframe origin; not attaching.');
			this.iframe = null;
			this.onEvent = null;
			return;
		}

		window.addEventListener('message', this.boundMessage);
		this.scheduleHandshakeFallback();
	}

	detach(): void {
		this.cancelHandshakeFallback();
		window.removeEventListener('message', this.boundMessage);
		this.iframe = null;
		this.onEvent = null;
		this.targetOrigin = '';
	}

	endMeeting(): void {
		this.post(createWebComponentCommandMessage(WebComponentCommand.END_MEETING));
	}

	leaveRoom(): void {
		this.post(createWebComponentCommandMessage(WebComponentCommand.LEAVE_ROOM));
	}

	kickParticipant(participantIdentity: string): void {
		this.post(createWebComponentCommandMessage(WebComponentCommand.KICK_PARTICIPANT, { participantIdentity }));
	}

	private handleMessage(event: MessageEvent): void {
		// Only trust messages coming from the iframe's own origin. No wildcard bypass:
		// if the origin is unknown, `targetOrigin` is empty and nothing is accepted.
		if (!this.targetOrigin || event.origin !== this.targetOrigin) {
			return;
		}

		const message = event.data as WebComponentOutboundEventMessage | undefined;
		if (!message?.event) {
			return;
		}

		// Handshake: the app announces READY once its listener is up, the host replies
		// with its origin so the app can validate subsequent commands. READY is the
		// positive "app is listening" signal, so it also cancels the fallback retry.
		if (message.event === WebComponentEvent.READY) {
			this.sendInitialize();
			this.cancelHandshakeFallback();
		}

		this.onEvent?.(message.event, message.payload);
	}

	/**
	 * Recover from a missed READY. The app emits READY exactly once and cannot be
	 * asked to repeat it, so a host that attached after that announcement would
	 * deadlock. Since the app accepts the first INITIALIZE it sees regardless of
	 * whether it triggered READY, we re-offer INITIALIZE on a bounded schedule as a
	 * fallback. It only kicks in after a grace period (READY normally arrives first
	 * and cancels it), so the happy path sends no extra messages; once the app
	 * processes one INITIALIZE it ignores the rest.
	 */
	private scheduleHandshakeFallback(): void {
		const GRACE_MS = 2000; // READY almost always lands before this in the normal path.
		const RETRY_MS = 500;
		const MAX_ATTEMPTS = 10;
		let attempts = 0;

		const retry = (): void => {
			if (attempts++ >= MAX_ATTEMPTS) {
				this.cancelHandshakeFallback();
				return;
			}
			this.sendInitialize();
			this.handshakeFallback = setTimeout(retry, RETRY_MS);
		};

		this.handshakeFallback = setTimeout(retry, GRACE_MS);
	}

	private cancelHandshakeFallback(): void {
		if (this.handshakeFallback !== null) {
			clearTimeout(this.handshakeFallback);
			this.handshakeFallback = null;
		}
	}

	private sendInitialize(): void {
		this.post(createWebComponentCommandMessage(WebComponentCommand.INITIALIZE, { domain: window.location.origin }));
	}

	/** Resolve the iframe's origin, deriving it from `src` when not given explicitly. */
	private resolveTargetOrigin(iframe: HTMLIFrameElement, explicit: string): string {
		if (explicit && explicit !== '*') {
			return explicit;
		}
		try {
			const origin = new URL(iframe.src, window.location.href).origin;
			return origin && origin !== 'null' ? origin : '';
		} catch {
			return '';
		}
	}

	private post(message: WebComponentInboundCommandMessage): void {
		if (!this.targetOrigin) {
			return;
		}
		this.iframe?.contentWindow?.postMessage(message, this.targetOrigin);
	}
}
