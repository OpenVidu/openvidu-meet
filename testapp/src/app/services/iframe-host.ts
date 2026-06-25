import { Injectable } from '@angular/core';
import {
	createEmbeddedCommandMessage,
	EmbeddedCommand,
	EmbeddedEvent,
	EmbeddedInboundCommandMessage,
	EmbeddedOutboundEventMessage
} from '@openvidu-meet/typings';

/** Receives a lifecycle event posted by the embedded iframe. */
export type IframeLifecycleHandler = (event: EmbeddedEvent, payload: unknown) => void;

/**
 * Host-side `postMessage` controller for the **iframe** integration — the piece a
 * real host page implements to embed Meet via a raw `<iframe>` (see the iframe
 * integration tutorial):
 *
 * - validates that inbound events come from the iframe's origin;
 * - relays `joined/left/closed` to the caller;
 * - sends `endMeeting/leaveRoom/kickParticipant` commands.
 *
 * The embedded app resolves the trusted host origin on its own (from
 * `ancestorOrigins`/`referrer`), so no `READY`/`INITIALIZE` handshake is needed.
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
	}

	detach(): void {
		window.removeEventListener('message', this.boundMessage);
		this.iframe = null;
		this.onEvent = null;
		this.targetOrigin = '';
	}

	endMeeting(): void {
		this.post(createEmbeddedCommandMessage(EmbeddedCommand.END_MEETING));
	}

	leaveRoom(): void {
		this.post(createEmbeddedCommandMessage(EmbeddedCommand.LEAVE_ROOM));
	}

	kickParticipant(participantIdentity: string): void {
		this.post(createEmbeddedCommandMessage(EmbeddedCommand.KICK_PARTICIPANT, { participantIdentity }));
	}

	private handleMessage(event: MessageEvent): void {
		// Only trust messages coming from the iframe's own origin. No wildcard bypass:
		// if the origin is unknown, `targetOrigin` is empty and nothing is accepted.
		if (!this.targetOrigin || event.origin !== this.targetOrigin) {
			return;
		}

		const message = event.data as EmbeddedOutboundEventMessage | undefined;
		if (!message?.event) {
			return;
		}

		this.onEvent?.(message.event, message.payload);
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

	private post(message: EmbeddedInboundCommandMessage): void {
		if (!this.targetOrigin) {
			return;
		}
		this.iframe?.contentWindow?.postMessage(message, this.targetOrigin);
	}
}
