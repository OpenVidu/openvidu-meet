import { DestroyRef, effect, inject, Service, signal } from '@angular/core';
import {
	deprecatedEmbeddedEventAliasOf,
	EmbeddedCommand,
	EmbeddedCommandName,
	EmbeddedEvent,
	resolveEmbeddedCommandName
} from '@openvidu-meet/typings';
import { LoggerService } from '../../../shared/services/logger.service';
import { RuntimeConfigService } from '../../../shared/services/runtime-config.service';
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
 * - **Commands** (host → app) are forwarded to {@link EmbeddedCommandService}, which checks the
 *   permission and meeting phase each command declares. The bridge applies no gating of its own.
 * - **Events** (app → host) are drained from {@link EmbeddedEventBusService.events}
 *   (the shared lifecycle-event queue, canonical names only) and relayed as `postMessage` events —
 *   each canonical event is followed by a second post under its deprecated 3.8.0 name, if it has
 *   one, so a host on the old wire format keeps working during the deprecation window.
 */
@Service()
export class IframeBridgeService {
	private readonly commandService = inject(EmbeddedCommandService);
	private readonly eventBus = inject(EmbeddedEventBusService);
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

		// Hosts written against 3.8.0 post the deprecated names; resolving up front means the
		// switch only ever deals with canonical ones, and adding a future alias is a typings
		// change alone. This resolve call is itself removed in 3.12.0 along with the aliases —
		// see resolveEmbeddedCommandName's own @deprecated tag.
		switch (resolveEmbeddedCommandName(message.command)) {
			case EmbeddedCommandName.MEETING_END:
				await this.commandService.meetingEnd();
				break;
			case EmbeddedCommandName.MEETING_LEAVE:
				await this.commandService.meetingLeave();
				break;

			case EmbeddedCommandName.PARTICIPANT_KICK: {
				// Resolving the name discards the discriminant, so narrow on the payload's presence
				// instead — only the payload-carrying commands have one.
				const payload = 'payload' in message ? message.payload : undefined;
				const participantIdentity =
					payload && 'participantIdentity' in payload ? payload.participantIdentity : undefined;

				if (!participantIdentity) {
					this.log.e('participantKick command received without a participantIdentity');
					return;
				}

				await this.commandService.participantKick(participantIdentity);
				break;
			}

			case EmbeddedCommandName.MEDIA_TOGGLE_AUDIO:
				await this.commandService.mediaToggleAudio(this.extractEnabledPayload(message));
				break;

			case EmbeddedCommandName.MEDIA_TOGGLE_VIDEO:
				await this.commandService.mediaToggleVideo(this.extractEnabledPayload(message));
				break;

			case EmbeddedCommandName.MEDIA_TOGGLE_SCREEN_SHARE:
				await this.commandService.mediaToggleScreenShare(this.extractEnabledPayload(message));
				break;

			default:
				break;
		}
	}

	/**
	 * Reads the optional `enabled` flag of a media toggle command message: absent payload (or
	 * flag) means "toggle".
	 */
	private extractEnabledPayload(message: EmbeddedCommand): boolean | undefined {
		const payload = 'payload' in message ? message.payload : undefined;
		return payload && 'enabled' in payload ? payload.enabled : undefined;
	}

	/**
	 * Posts a lifecycle event to the trusted parent origin, then posts it again under its
	 * deprecated 3.8.0 name if it has one. The event bus only ever queues canonical events, so a
	 * host still on the old wire format would see nothing without this second post; a host
	 * listening for both names receives the event twice (documented in `webcomponent/CLAUDE.md`).
	 */
	private relayEventToParent(event: EmbeddedEvent): void {
		const targetOrigin = this.parentDomain();

		if (!this.initialized || !targetOrigin) {
			return;
		}

		this.log.d('Relaying event to parent:', event);
		window.parent.postMessage(event, targetOrigin);

		// Removed in 3.12.0 along with EMBEDDED_EVENT_ALIASES: deprecatedEmbeddedEventAliasOf will
		// always return undefined once the 3.8.0 event names leave the typings, so this whole
		// second post goes away with it.
		const legacyEventName = deprecatedEmbeddedEventAliasOf(event.event);

		if (legacyEventName) {
			window.parent.postMessage({ ...event, event: legacyEventName }, targetOrigin);
		}
	}
}
