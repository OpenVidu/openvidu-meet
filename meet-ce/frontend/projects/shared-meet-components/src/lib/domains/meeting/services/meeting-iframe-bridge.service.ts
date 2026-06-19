import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import {
	createWebComponentEventMessage,
	WebComponentCommand,
	WebComponentEvent,
	WebComponentInboundCommandMessage,
	WebComponentOutboundEventMessage
} from '@openvidu-meet/typings';
import { WcEvent, WebComponentEventType } from '../../../shared/models/webcomponent-bridge.model';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { WebComponentBridgeService } from '../../../shared/services/webcomponent-bridge.service';
import { LoggerService, OpenViduService } from '../openvidu-components';
import { MeetingWebComponentManagerService } from './meeting-webcomponent-manager.service';

/**
 * `postMessage` transport for the embedded **iframe** integration.
 *
 * When Meet is loaded inside a cross-document `<iframe>`, the
 * host page drives it over `window.postMessage` instead of element methods/DOM
 * events. This service is the only iframe-specific piece: it is a thin adapter that
 * delegates to the already-centralized API so the iframe exposes the *same* public
 * surface as the webcomponent:
 *
 * - **Commands** (host → app) are forwarded to {@link MeetingWebComponentManagerService}
 *   (the shared, permission-checked command bridge).
 * - **Events** (app → host) are drained from {@link WebComponentBridgeService.wcEvents}
 *   (the shared lifecycle-event queue) and relayed as `postMessage` events.
 */
@Injectable({
	providedIn: 'root'
})
export class MeetingIframeBridgeService {
	private readonly wcManager = inject(MeetingWebComponentManagerService);
	private readonly wcBridge = inject(WebComponentBridgeService);
	private readonly openviduService = inject(OpenViduService);
	private readonly runtimeConfig = inject(RuntimeConfigService);
	private readonly log = inject(LoggerService).get('MeetingIframeBridgeService');

	private initialized = false;
	private readonly boundHandleMessage = (event: MessageEvent): void => {
		void this.handleMessage(event);
	};

	/** Trusted parent origin, learnt from the `INITIALIZE` handshake; empty until then. */
	private readonly parentDomain = signal('');

	/**
	 * Relays queued lifecycle events to the host. Gated on the handshake: until the
	 * trusted parent origin is known, events stay queued (only READY is sent before
	 * it, separately). Setting `parentDomain` re-runs this effect and flushes them.
	 */
	private readonly eventRelayEffect = effect(() => {
		const queued = this.wcBridge.wcEvents();
		const target = this.parentDomain();

		if (!this.initialized || !target || queued.length === 0) {
			return;
		}

		for (const event of this.wcBridge.drainWebComponentEvents()) {
			this.relayEventToParent(event);
		}
	});

	constructor() {
		// Detach the global message listener when the root injector is torn down.
		inject(DestroyRef).onDestroy(() => window.removeEventListener('message', this.boundHandleMessage));
	}

	/**
	 * Starts the iframe bridge. No-op unless running inside an iframe, so the SPA's
	 * root component can call it unconditionally.
	 */
	initialize(): void {
		if (this.initialized || !this.runtimeConfig.isIframeMode()) {
			return;
		}

		this.log.d('Initializing iframe bridge...');
		this.initialized = true;
		window.addEventListener('message', this.boundHandleMessage);

		// Announce readiness so the host replies with INITIALIZE (its origin). The
		// trusted origin is not known yet, so '*' is required for this first message.
		this.postToParent(createWebComponentEventMessage(WebComponentEvent.READY, {}), '*');
	}

	private async handleMessage(event: MessageEvent): Promise<void> {
		const message = event.data as WebComponentInboundCommandMessage | undefined;
		if (!message || typeof message.command !== 'string') {
			return;
		}

		const { command, payload } = message;

		// Handshake: until the host identifies itself with INITIALIZE we accept nothing
		// else, and we learn which origin to trust from its payload.
		if (!this.parentDomain()) {
			if (command === WebComponentCommand.INITIALIZE) {
				const domain = (payload as { domain?: string } | undefined)?.domain;
				if (!domain) {
					this.log.e('INITIALIZE received without a domain in the payload');
					return;
				}
				// The host self-reports its origin in the payload, but an origin allowlist
				// must be anchored to a value the browser stamps — not one the sender can
				// forge. Require the claimed domain to match the message's real origin, so a
				// rogue frame can neither point trust at an origin it doesn't control nor lock
				// the bridge onto a bogus origin (a permanent, unrecoverable DoS otherwise,
				// since the trusted origin is set once and never revised).
				if (event.origin !== domain) {
					this.log.e(
						`INITIALIZE domain '${domain}' does not match sender origin '${event.origin}'; ignoring`
					);
					return;
				}
				this.log.d(`Trusted parent origin set: ${domain}`);
				this.parentDomain.set(domain);
			}
			return;
		}

		// Reject anything not coming from the trusted parent origin.
		if (event.origin !== this.parentDomain()) {
			this.log.w(`Ignoring message from untrusted origin: ${event.origin}`);
			return;
		}

		// Commands only make sense once connected to the room.
		if (!this.openviduService.isRoomConnected()) {
			this.log.w('Received command but participant is not connected to the room');
			return;
		}

		switch (command) {
			case WebComponentCommand.END_MEETING:
				await this.wcManager.endMeeting();
				break;
			case WebComponentCommand.LEAVE_ROOM:
				await this.wcManager.leaveRoom();
				break;
			case WebComponentCommand.KICK_PARTICIPANT: {
				const participantIdentity = (payload as { participantIdentity?: string } | undefined)
					?.participantIdentity;
				if (!participantIdentity) {
					this.log.e('kickParticipant command received without a participantIdentity');
					return;
				}
				await this.wcManager.kickParticipant(participantIdentity);
				break;
			}
			default:
				break;
		}
	}

	private relayEventToParent(event: WcEvent): void {
		const message = this.toOutboundMessage(event);
		if (message) {
			this.postToParent(message);
		}
	}

	/** Maps an internal lifecycle event to its public iframe message, or `null` if it has none. */
	private toOutboundMessage(event: WcEvent): WebComponentOutboundEventMessage | null {
		switch (event.type) {
			case WebComponentEventType.JOINED:
				return createWebComponentEventMessage(WebComponentEvent.JOINED, {
					roomId: event.roomId,
					participantIdentity: event.participantIdentity
				});
			case WebComponentEventType.LEFT:
				return createWebComponentEventMessage(WebComponentEvent.LEFT, {
					roomId: event.roomId,
					participantIdentity: event.participantIdentity,
					reason: event.reason
				});
			case WebComponentEventType.CLOSED:
				return createWebComponentEventMessage(WebComponentEvent.CLOSED);
			case WebComponentEventType.ERROR:
				// No public `error` event: the failure surfaces inside the iframe via the
				// in-app `/error` route, mirroring the v3.7.0 contract.
				return null;
		}
	}

	private postToParent(message: WebComponentOutboundEventMessage, targetOrigin: string = this.parentDomain()): void {
		if (!this.initialized || !targetOrigin) {
			return;
		}
		this.log.d('Relaying event to parent:', message);
		window.parent.postMessage(message, targetOrigin);
	}
}
