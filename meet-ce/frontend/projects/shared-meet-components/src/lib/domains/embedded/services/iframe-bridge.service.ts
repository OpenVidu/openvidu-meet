import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { EmbeddedCommand, EmbeddedCommandName, EmbeddedEvent } from '@openvidu-meet/typings';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
import { LoggerService, OpenViduService } from '../../meeting/openvidu-components';
import { EmbeddedCommandService } from './embedded-command.service';
import { EmbeddedEventBusService } from './embedded-event-bus.service';

/**
 * `postMessage` transport for the embedded **iframe** integration.
 *
 * When Meet is loaded inside a cross-document `<iframe>`, the
 * host page drives it over `window.postMessage` instead of element methods/DOM
 * events. This service is the only iframe-specific piece: it is a thin adapter that
 * delegates to the already-centralized API so the iframe exposes the *same* public
 * surface as the webcomponent:
 *
 * - **Commands** (host → app) are forwarded to {@link EmbeddedCommandService}
 *   (the shared, permission-checked command bridge).
 * - **Events** (app → host) are drained from {@link EmbeddedEventBusService.events}
 *   (the shared lifecycle-event queue) and relayed as `postMessage` events.
 */
@Injectable({
	providedIn: 'root'
})
export class IframeBridgeService {
	private readonly commandService = inject(EmbeddedCommandService);
	private readonly eventBus = inject(EmbeddedEventBusService);
	private readonly openviduService = inject(OpenViduService);
	private readonly runtimeConfig = inject(RuntimeConfigService);
	private readonly log = inject(LoggerService).get('IframeBridgeService');

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
		const queued = this.eventBus.events();
		const target = this.parentDomain();

		if (!this.initialized || !target || queued.length === 0) {
			return;
		}

		for (const event of this.eventBus.drain()) {
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
		const message = event.data as EmbeddedCommand | undefined;
		if (!message || typeof message.command !== 'string') {
			return;
		}

		// Reject anything not coming from the trusted parent origin (resolved at start).
		if (event.origin !== this.parentDomain()) {
			this.log.w(`Ignoring message from untrusted origin: ${event.origin}`);
			return;
		}

		// Commands only make sense once connected to the room.
		if (!this.openviduService.isRoomConnected()) {
			this.log.w('Received command but participant is not connected to the room');
			return;
		}

		switch (message.command) {
			case EmbeddedCommandName.END_MEETING:
				await this.commandService.endMeeting();
				break;
			case EmbeddedCommandName.LEAVE_ROOM:
				await this.commandService.leaveRoom();
				break;
			case EmbeddedCommandName.KICK_PARTICIPANT:
				const participantIdentity = message.payload?.participantIdentity;
				if (!participantIdentity) {
					this.log.e('kickParticipant command received without a participantIdentity');
					return;
				}

				await this.commandService.kickParticipant(participantIdentity);
				break;
			default:
				break;
		}
	}

	/**
	 * Posts a lifecycle event verbatim to the trusted parent origin.
	 */
	private relayEventToParent(event: EmbeddedEvent): void {
		const targetOrigin = this.parentDomain();
		if (!this.initialized || !targetOrigin) {
			return;
		}
		this.log.d('Relaying event to parent:', event);
		window.parent.postMessage(event, targetOrigin);
	}
}
