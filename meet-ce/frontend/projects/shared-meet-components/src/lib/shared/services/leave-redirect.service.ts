import { inject, Service } from '@angular/core';
import { getAutoRedirectUrl, getReferrerOrigin, isValidUrl } from '../utils/url.utils';
import { RuntimeConfigService } from './runtime-config.service';
import { SessionStorageService } from './session-storage.service';

/**
 * Owns the "leave-redirect URL" — where the user is sent after leaving/closing a meeting. It
 * resolves the URL of each meeting entry per embedding mode (SPA / iframe / webcomponent) and
 * persists it in session storage with its room so it survives reloads. Performing the actual
 * redirect is {@link NavigationService}'s job; this service only owns the resolved destination.
 */
@Service()
export class LeaveRedirectService {
	private readonly sessionStorageService = inject(SessionStorageService);
	private readonly runtimeConfigService = inject(RuntimeConfigService);

	private redirect?: { roomId: string; url: string };

	/**
	 * Retrieves the leave-redirect URL of the current entry, or the stored one after a reload.
	 *
	 * @returns The leave-redirect URL if set, otherwise `undefined`.
	 */
	getLeaveRedirectURL(): string | undefined {
		return (this.redirect ?? this.sessionStorageService.getRedirect())?.url;
	}

	/**
	 * Sets the leave-redirect URL of a meeting entry, replacing whatever an earlier entry set.
	 *
	 * @param roomId - The room being entered.
	 * @param leaveRedirectUrl - The leave-redirect URL the entry was given, if any.
	 */
	handleLeaveRedirectUrl(roomId: string, leaveRedirectUrl: string | undefined): void {
		const url = this.resolveLeaveRedirectUrl(leaveRedirectUrl) ?? this.findStandaloneLeaveRedirectUrl(roomId);

		if (url) {
			this.redirect = { roomId, url };
			this.sessionStorageService.setRedirect(roomId, url);
		} else {
			this.forget();
		}
	}

	/**
	 * Drops the leave-redirect URL unless it was set for this room, for an entry that carries none of
	 * its own, such as a recording.
	 *
	 * @param roomId - The room being entered.
	 */
	keepOnlyForRoom(roomId: string): void {
		if ((this.redirect ?? this.sessionStorageService.getRedirect())?.roomId !== roomId) {
			this.forget();
		}
	}

	private forget(): void {
		this.redirect = undefined;
		this.sessionStorageService.removeRedirectUrl();
	}

	private resolveLeaveRedirectUrl(leaveRedirectUrl: string | undefined): string | undefined {
		if (leaveRedirectUrl && isValidUrl(leaveRedirectUrl)) {
			return leaveRedirectUrl;
		}

		if (!leaveRedirectUrl?.startsWith('/')) {
			return undefined;
		}

		// Webcomponent: the Angular Elements element runs in the host's window,
		// so `window.location.origin` IS the host origin.
		if (this.runtimeConfigService.isWebcomponentMode()) {
			return window.location.origin + leaveRedirectUrl;
		}

		// Iframe: the app runs on the Meet server origin, so the host origin is
		// reconstructed from the referrer (the parent page that loaded the iframe).
		if (this.runtimeConfigService.isIframeMode()) {
			const hostOrigin = getReferrerOrigin();
			return hostOrigin ? hostOrigin + leaveRedirectUrl : undefined;
		}

		return undefined;
	}

	/**
	 * A standalone entry without a redirect of its own keeps the one stored for the same room, since
	 * a reload loses the query parameter, or else takes the referrer.
	 */
	private findStandaloneLeaveRedirectUrl(roomId: string): string | undefined {
		if (this.runtimeConfigService.isEmbeddedMode()) {
			return undefined;
		}

		const stored = this.sessionStorageService.getRedirect();
		return stored?.roomId === roomId ? stored.url : (getAutoRedirectUrl() ?? undefined);
	}
}
