import { inject, Injectable } from '@angular/core';
import { Params, Router, UrlTree } from '@angular/router';
import { NavigationErrorReason } from '../models/navigation.model';
import { RuntimeConfigService } from './runtime-config.service';
import { SessionStorageService } from './session-storage.service';
import { WebComponentBridgeService } from './webcomponent-bridge.service';

@Injectable({
	providedIn: 'root'
})
export class NavigationService {
	protected leaveRedirectUrl?: string;
	private readonly wcBridge = inject(WebComponentBridgeService);

	constructor(
		private router: Router,
		private sessionStorageService: SessionStorageService,
		private runtimeConfigService: RuntimeConfigService
	) {}

	private getBasePathPrefix(): string {
		const basePath = this.runtimeConfigService.basePath;
		if (!basePath || basePath === '/') {
			return '';
		}

		return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
	}

	/**
	 * Adds configured base path to an internal URL path.
	 *
	 * @param url - The internal URL path to add the base path to
	 * @return The URL with the base path prefixed, if a base path is configured; otherwise, returns the original URL
	 */
	addBasePath(url: string): string {
		if (!url) {
			return this.getBasePathPrefix() || '/';
		}

		const basePathPrefix = this.getBasePathPrefix();
		const normalizedUrl = url.startsWith('/') ? url : `/${url}`;

		if (!basePathPrefix || normalizedUrl.startsWith(`${basePathPrefix}/`)) {
			return normalizedUrl;
		}

		return `${basePathPrefix}${normalizedUrl}`;
	}

	/**
	 * Removes configured base path prefix from an internal URL path.
	 *
	 * @param url - The internal URL path to strip the base path from
	 * @return The URL with the base path stripped, if a base path is configured; otherwise, returns the original URL
	 */
	stripBasePath(url: string): string {
		const basePathPrefix = this.getBasePathPrefix();
		if (!basePathPrefix || !url.startsWith(basePathPrefix)) {
			return url;
		}

		return url.slice(basePathPrefix.length) || '/';
	}

	/**
	 * Sets the leave redirect URL and stores it in session storage for persistence across page reloads.
	 *
	 * @param leaveRedirectUrl - The URL to set as the leave redirect destination
	 */
	protected setLeaveRedirectUrl(leaveRedirectUrl: string): void {
		this.leaveRedirectUrl = leaveRedirectUrl;
		this.sessionStorageService.setRedirectUrl(leaveRedirectUrl);
	}

	/**
	 * Retrieves the leave redirect URL, checking both the service property and session storage.
	 *
	 * @returns The leave redirect URL if set, otherwise undefined
	 */
	getLeaveRedirectURL(): string | undefined {
		const storedRedirectUrl = this.sessionStorageService.getRedirectUrl();
		if (!this.leaveRedirectUrl && storedRedirectUrl) {
			this.leaveRedirectUrl = storedRedirectUrl;
		}

		return this.leaveRedirectUrl;
	}

	/**
	 * Handles the leave redirect URL logic with automatic referrer detection
	 *
	 * @param leaveRedirectUrl - The URL to set as the leave redirect destination
	 */
	handleLeaveRedirectUrl(leaveRedirectUrl: string | undefined) {
		const isWebcomponentMode = this.runtimeConfigService.isWebcomponentMode();

		// Explicit valid URL provided - use as is
		if (leaveRedirectUrl && this.isValidUrl(leaveRedirectUrl)) {
			this.setLeaveRedirectUrl(leaveRedirectUrl);
			return;
		}

		// Relative path provided while embedded as a webcomponent — resolve it
		// against the host page's origin. The Angular Elements element runs in
		// the host's window, so `window.location.origin` IS the host origin
		// (in the legacy iframe model this was reconstructed via document.referrer).
		if (isWebcomponentMode && leaveRedirectUrl?.startsWith('/')) {
			this.setLeaveRedirectUrl(window.location.origin + leaveRedirectUrl);
			return;
		}

		// Auto-detect from referrer (only when running standalone and no explicit URL provided)
		if (!leaveRedirectUrl && !isWebcomponentMode) {
			const autoRedirectUrl = this.getAutoRedirectUrl();
			if (autoRedirectUrl) {
				this.setLeaveRedirectUrl(autoRedirectUrl);
			}
		}
	}

	/**
	 * Automatically detects if user came from another domain and returns appropriate redirect URL
	 */
	protected getAutoRedirectUrl(): string | null {
		try {
			const referrer = document.referrer;

			// No referrer means user typed URL directly or came from bookmark
			if (!referrer) {
				return null;
			}

			const referrerUrl = new URL(referrer);
			const currentUrl = new URL(window.location.href);

			// Check if referrer is from a different domain
			if (referrerUrl.origin !== currentUrl.origin) {
				console.log(`Auto-configuring leave redirect to referrer: ${referrer}`);
				return referrer;
			}

			return null;
		} catch (error) {
			console.warn('Error detecting auto redirect URL:', error);
			return null;
		}
	}

	/**
	 * Validates if a given string is a well-formed URL
	 *
	 * @param url - The URL string to validate
	 * @returns True if the URL is valid, false otherwise
	 */
	protected isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Redirects the user to the leave redirect URL if set and valid.
	 */
	async redirectToLeaveUrl() {
		const url = this.getLeaveRedirectURL();
		if (!url) {
			console.warn('No leave redirect URL set');
			return;
		}

		const isExternalURL = /^https?:\/\//.test(url);
		if (!isExternalURL) {
			console.error('Leave redirect URL is not a valid external URL:', url);
			return;
		}

		// The Angular Elements webcomponent runs in the host's window, so
		// `window` already refers to the top-level document. No iframe-era
		// `window.top` indirection needed.
		window.location.href = url;
	}

	/**
	 * Navigates to a specific route
	 *
	 * @param route - The route to navigate to
	 * @param queryParams - Optional query parameters to include in the navigation
	 * @param replaceUrl - If true, replaces the current URL in the browser history
	 */
	async navigateTo(route: string, queryParams?: Params, replaceUrl: boolean = false): Promise<void> {
		try {
			await this.router.navigate([route], {
				queryParams,
				replaceUrl
			});
		} catch (error) {
			console.error('Error navigating to route:', error);
		}
	}

	/**
	 * Redirects to internal URL
	 *
	 * @param url - The URL to redirect to
	 * @param replaceUrl - If true, replaces the current URL in the browser history
	 */
	async redirectTo(url: string, replaceUrl: boolean = true): Promise<void> {
		try {
			// Strip basePath prefix if present, since Angular router operates relative to <base href>
			url = this.stripBasePath(url);

			let urlTree = this.router.parseUrl(url);
			await this.router.navigateByUrl(urlTree, { replaceUrl });
		} catch (error) {
			console.error('Error navigating to internal route:', error);
		}
	}

	/**
	 * Creates a URL tree for redirecting to a specific route
	 *
	 * @param route - The route to redirect to
	 * @param queryParams - Optional query parameters to include in the URL
	 * @returns A UrlTree representing the redirection
	 */
	createRedirectionTo(route: string, queryParams?: Params): UrlTree {
		return this.router.createUrlTree([route], { queryParams });
	}

	/**
	 * Creates a UrlTree for the error page with specific reason and optionally navigates to it.
	 *
	 * @param reason - The error reason to include as a query parameter
	 * @param navigate - If true, navigates to the generated UrlTree
	 * @returns The UrlTree for the error page
	 */
	async redirectToErrorPage(reason: NavigationErrorReason, navigate = false): Promise<UrlTree> {
		const urlTree = this.createRedirectionTo('/error', { reason });

		if (navigate) {
			try {
				await this.router.navigateByUrl(urlTree);
			} catch (error) {
				console.error('Error redirecting to error page:', error);
			}
		}

		return urlTree;
	}

	/**
	 * Creates a UrlTree for the login page with a `redirectTo` query parameter and optionally navigates to it.
	 *
	 * @param redirectTo - The URL to redirect to after login
	 * @param navigate - If true, navigates to the generated UrlTree
	 * @returns The UrlTree for the login page
	 */
	async redirectToLoginPage(redirectTo?: string, navigate = false): Promise<UrlTree> {
		const queryParams = redirectTo ? { redirectTo } : undefined;
		const urlTree = this.createRedirectionTo('/login', queryParams);

		if (navigate) {
			try {
				await this.router.navigateByUrl(urlTree);
			} catch (error) {
				console.error('Error redirecting to login page:', error);
			}
		}

		return urlTree;
	}

	/**
	 * Checks if the current URL contains a specific route
	 *
	 * @param route - The route to check against the current URL
	 * @returns True if the current URL contains the route, false otherwise
	 */
	containsRoute(route: string): boolean {
		const currentUrl = this.router.url.split('?')[0]; // Remove query params for comparison
		return currentUrl.includes(route);
	}

	/**
	 * Updates the query parameters in the URL by merging existing parameters with new ones.
	 *
	 * @param oldParams - The existing query parameters
	 * @param newParams - The new query parameters to merge with the existing ones
	 */
	async updateQueryParamsFromUrl(oldParams: Params, newParams: Params): Promise<void> {
		const queryParams = {
			...oldParams,
			...newParams
		};

		await this.router.navigate([], {
			queryParams,
			replaceUrl: true,
			queryParamsHandling: 'merge'
		});
	}

	/**
	 * Removes a specific query parameter from the URL
	 *
	 * @param queryParams - The current query parameters
	 * @param param - The parameter to remove
	 */
	async removeQueryParamFromUrl(queryParams: Params, param: string): Promise<void> {
		await this.removeQueryParamsFromUrl(queryParams, [param]);
	}

	/**
	 * Removes multiple query parameters from the URL in a single navigation operation.
	 * This is more efficient than removing params one by one, as it only triggers one navigation.
	 *
	 * @param queryParams - The current query parameters
	 * @param params - Array of parameter names to remove
	 */
	async removeQueryParamsFromUrl(queryParams: Params, params: string[]): Promise<void> {
		if (!params || params.length === 0) {
			return;
		}

		const updatedParams = { ...queryParams };
		params.forEach((param) => {
			delete updatedParams[param];
		});

		await this.router.navigate([], {
			queryParams: updatedParams,
			replaceUrl: true,
			queryParamsHandling: 'replace'
		});
	}

	// ── High-level intent methods ─────────────────────────────────────────
	//
	// These centralize the WC-vs-SPA branching for navigation flows that
	// exist in both modes. The SPA uses Angular Router; the WC has none and
	// asks the shell to swap views via WebComponentBridgeService signals.
	// Callers should use these methods instead of branching on
	// `runtimeConfigService.isWebcomponentMode()` themselves.

	/**
	 * Open the room-recordings view for the given room. SPA route equivalent:
	 * `/room/<roomId>/recordings`.
	 */
	async goToRoomRecordings(roomId: string): Promise<void> {
		if (this.runtimeConfigService.isWebcomponentMode()) {
			this.wcBridge.emitViewRecordingsRequest(roomId);
			return;
		}
		await this.navigateTo(`/room/${roomId}/recordings`);
	}

	/**
	 * Return to the room from the recordings view. SPA route equivalent:
	 * `/room/<roomId>` (which renders the lobby/meeting).
	 */
	async goBackToRoom(roomId: string): Promise<void> {
		if (this.runtimeConfigService.isWebcomponentMode()) {
			this.wcBridge.emitBackToRoomRequest(roomId);
			return;
		}
		await this.navigateTo(`/room/${roomId}`);
	}

	/**
	 * Back-navigation from the meeting lobby / end-meeting / disconnected
	 * screens. In the SPA, this redirects to a configured leave URL when
	 * present, otherwise navigates to `/rooms`. In WC mode, it emits the
	 * `closed` event so the host can unmount or follow `leave-redirect-url`.
	 *
	 * @param fallbackRoute Route to navigate to in the SPA when no
	 *   leave-redirect URL is configured. Defaults to `/rooms`.
	 * @param replaceUrl Whether to replace the current history entry when
	 *   navigating to the fallback route.
	 */
	async goBackFromMeeting(fallbackRoute = '/rooms', replaceUrl = false): Promise<void> {
		if (this.runtimeConfigService.isWebcomponentMode()) {
			this.wcBridge.emitClosedEvent();
			return;
		}

		if (this.getLeaveRedirectURL()) {
			await this.redirectToLeaveUrl();
			return;
		}

		await this.navigateTo(fallbackRoute, undefined, replaceUrl);
	}

	/**
	 * Back-navigation from a single-recording view. If the user has
	 * permission to list this room's recordings AND a roomId is known,
	 * go to the room-recordings view (SPA: navigate; WC: emit signal).
	 * Otherwise behave like {@link goBackFromMeeting} (SPA: leave-redirect
	 * URL or noop; WC: emit `closed`).
	 *
	 * @param roomId Optional roomId of the recording's room.
	 * @param canRetrieveRecordings Whether the user can list recordings for that room.
	 */
	async goBackFromRecording(roomId: string | undefined, canRetrieveRecordings: boolean): Promise<void> {
		if (canRetrieveRecordings && roomId) {
			await this.goToRoomRecordings(roomId);
			return;
		}

		if (this.runtimeConfigService.isWebcomponentMode()) {
			this.wcBridge.emitClosedEvent();
			return;
		}

		if (this.getLeaveRedirectURL()) {
			await this.redirectToLeaveUrl();
		}
	}
}
