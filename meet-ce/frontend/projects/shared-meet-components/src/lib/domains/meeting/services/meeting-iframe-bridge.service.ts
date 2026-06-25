import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import {
	createEmbeddedEventMessage,
	EmbeddedCommand,
	EmbeddedEvent,
	EmbeddedInboundCommandMessage,
	EmbeddedOutboundEventMessage
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

	/** Trusted parent origin, resolved once when the bridge starts; empty until then. */
	private readonly parentDomain = signal('');

	/**
	 * Relays queued lifecycle events to the host. Gated on the trusted parent
	 * origin: until it is resolved (when the bridge starts) events stay queued.
	 * Setting `parentDomain` re-runs this effect and flushes them.
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
	 * root component can call it unconditionally. Resolves the trusted parent origin
	 * up front (no handshake); if it cannot be determined the bridge stays closed
	 * rather than falling back to a wildcard.
	 */
	initialize(): void {
		if (this.initialized || !this.runtimeConfig.isIframeMode()) {
			return;
		}

		const parentOrigin = this.resolveParentOrigin();
		if (!parentOrigin) {
			// Without a concrete parent origin we can neither validate inbound commands nor
			// safely target outbound events, so we refuse to open the bridge instead of
			// trusting/posting to '*'.
			this.log.e('Could not determine the parent origin; iframe bridge not started.');
			return;
		}

		this.log.d(`Initializing iframe bridge (trusted parent origin: ${parentOrigin})...`);
		this.initialized = true;
		this.parentDomain.set(parentOrigin);
		window.addEventListener('message', this.boundHandleMessage);
	}

	/**
	 * Resolves the trusted parent origin without a handshake. Prefers
	 * `location.ancestorOrigins` (browser-stamped and unforgeable, available in
	 * Chromium/WebKit); falls back to the `document.referrer` origin (e.g. Firefox).
	 * Returns `''` when neither yields a usable origin, leaving the bridge closed.
	 */
	private resolveParentOrigin(): string {
		const ancestors = window.location.ancestorOrigins;
		const fromAncestors = ancestors && ancestors.length > 0 ? ancestors[0] : '';

		if (fromAncestors && fromAncestors !== 'null') {
			return fromAncestors;
		}

		if (document.referrer) {
			try {
				const origin = new URL(document.referrer).origin;
				return origin && origin !== 'null' ? origin : '';
			} catch {
				return '';
			}
		}

		return '';
	}

	private async handleMessage(event: MessageEvent): Promise<void> {
		const message = event.data as EmbeddedInboundCommandMessage | undefined;
		if (!message || typeof message.command !== 'string') {
			return;
		}

		// Reject anything not coming from the trusted parent origin (resolved at start).
		if (event.origin !== this.parentDomain()) {
			this.log.w(`Ignoring message from untrusted origin: ${event.origin}`);
			return;
		}

		const { command, payload } = message;

		// Commands only make sense once connected to the room.
		if (!this.openviduService.isRoomConnected()) {
			this.log.w('Received command but participant is not connected to the room');
			return;
		}

		switch (command) {
			case EmbeddedCommand.END_MEETING:
				await this.wcManager.endMeeting();
				break;
			case EmbeddedCommand.LEAVE_ROOM:
				await this.wcManager.leaveRoom();
				break;
			case EmbeddedCommand.KICK_PARTICIPANT: {
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
	private toOutboundMessage(event: WcEvent): EmbeddedOutboundEventMessage | null {
		switch (event.type) {
			case WebComponentEventType.JOINED:
				return createEmbeddedEventMessage(EmbeddedEvent.JOINED, {
					roomId: event.roomId,
					participantIdentity: event.participantIdentity
				});
			case WebComponentEventType.LEFT:
				return createEmbeddedEventMessage(EmbeddedEvent.LEFT, {
					roomId: event.roomId,
					participantIdentity: event.participantIdentity,
					reason: event.reason
				});
			case WebComponentEventType.CLOSED:
				return createEmbeddedEventMessage(EmbeddedEvent.CLOSED);
			case WebComponentEventType.ERROR:
				// No public `error` event: the failure surfaces inside the iframe via the
				// in-app `/error` route, mirroring the v3.7.0 contract.
				return null;
		}
	}

	private postToParent(message: EmbeddedOutboundEventMessage): void {
		const targetOrigin = this.parentDomain();
		if (!this.initialized || !targetOrigin) {
			return;
		}
		this.log.d('Relaying event to parent:', message);
		window.parent.postMessage(message, targetOrigin);
	}
}
