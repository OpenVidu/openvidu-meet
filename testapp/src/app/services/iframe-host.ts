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
	private targetOrigin = '*';
	private onEvent: IframeLifecycleHandler | null = null;
	private readonly boundMessage = (event: MessageEvent): void => this.handleMessage(event);

	/** Begin driving an iframe whose content is served from `targetOrigin`. */
	attach(iframe: HTMLIFrameElement, targetOrigin: string, onEvent: IframeLifecycleHandler): void {
		this.detach();
		this.iframe = iframe;
		this.targetOrigin = targetOrigin || '*';
		this.onEvent = onEvent;
		window.addEventListener('message', this.boundMessage);
	}

	detach(): void {
		window.removeEventListener('message', this.boundMessage);
		this.iframe = null;
		this.onEvent = null;
		this.targetOrigin = '*';
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
		// Only trust messages coming from the iframe's own origin.
		if (this.targetOrigin !== '*' && event.origin !== this.targetOrigin) {
			return;
		}

		const message = event.data as WebComponentOutboundEventMessage | undefined;
		if (!message?.event) {
			return;
		}

		// Handshake: the app announces READY, the host replies with its origin so the
		// app can validate subsequent commands.
		if (message.event === WebComponentEvent.READY) {
			this.post(
				createWebComponentCommandMessage(WebComponentCommand.INITIALIZE, { domain: window.location.origin })
			);
		}

		this.onEvent?.(message.event, message.payload);
	}

	private post(message: WebComponentInboundCommandMessage): void {
		this.iframe?.contentWindow?.postMessage(message, this.targetOrigin);
	}
}
