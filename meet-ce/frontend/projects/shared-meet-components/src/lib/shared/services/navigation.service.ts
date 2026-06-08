import { inject, Injectable } from '@angular/core';
import { NavigationStart, Params, Router, UrlTree } from '@angular/router';
import { NavigationErrorReason } from '../models/navigation.model';
import {
	WcNavigationRequest,
	WebComponentEventType,
	WebComponentLeftEvent,
	WebComponentNavigationType
} from '../models/webcomponent-bridge.model';
import { ListStateCacheService } from './list-state-cache.service';
import { RuntimeConfigService } from './runtime-config.service';
import { SessionStorageService } from './session-storage.service';
import { WebComponentBridgeService } from './webcomponent-bridge.service';

@Injectable({
	providedIn: 'root'
})
export class NavigationService {
	private readonly wcBridge = inject(WebComponentBridgeService);
	private readonly router = inject(Router);
	private readonly sessionStorageService = inject(SessionStorageService);
	private readonly runtimeConfigService = inject(RuntimeConfigService);
	private readonly listStateCacheService = inject(ListStateCacheService);
	protected leaveRedirectUrl?: string;

	/** Trigger of the most recently started navigation (tracked from NavigationStart). */
	private lastNavigationTrigger: 'imperative' | 'popstate' | 'hashchange' = 'imperative';

	constructor() {
		// getCurrentNavigation() is null by the time a lazy component's ngOnInit runs,
		// so capture the trigger when each navigation starts instead.
		this.router.events.subscribe((event) => {
			if (event instanceof NavigationStart) {
				this.lastNavigationTrigger = event.navigationTrigger ?? 'imperative';
			}
		});
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
		// The WC has no router: arbitrary route navigation isn't supported here (in-WC
		// view changes go through the high-level intents / navigation requests). Guard
		// against hitting the empty router, which would only log a NavigationError.
		if (this.runtimeConfigService.isWebcomponentMode()) {
			console.warn(`navigateTo('${route}') ignored in webcomponent mode`);
			return;
		}

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
	 * Invalidates a cached reusable route so it reloads fresh on next attach, then
	 * navigates to a route. Used after mutations (create/edit/delete) performed from
	 * a detail or wizard page so the affected list reflects the change on return.
	 *
	 * @param route - The route to navigate to
	 * @param pathToInvalidate - The cached route key to invalidate (e.g. 'rooms', 'rooms/<roomId>')
	 * @param queryParams - Optional query parameters to include in the navigation
	 * @param replaceUrl - If true, replaces the current URL in the browser history
	 */
	async navigateToAndInvalidate(
		route: string,
		pathToInvalidate: string,
		queryParams?: Params,
		replaceUrl: boolean = false
	): Promise<void> {
		this.listStateCacheService.invalidate(pathToInvalidate);
		await this.navigateTo(route, queryParams, replaceUrl);
	}

	/**
	 * Invalidates a cached reusable route (and any routes nested under it) so it
	 * reloads fresh on next attach. Use when a mutation succeeds but navigation does
	 * not go straight to the affected list (e.g. redirecting into a meeting).
	 *
	 * @param path - The cached route key to invalidate (e.g. 'rooms', 'rooms/<roomId>')
	 */
	invalidateCachedRoute(path: string): void {
		this.listStateCacheService.invalidate(path);
	}

	/**
	 * Clears all cached reusable route instances. Call on logout so a different user
	 * never sees the previous user's cached lists and detached components are destroyed.
	 */
	clearCachedRoutes(): void {
		this.listStateCacheService.clearAll();
	}

	/**
	 * Whether the in-progress navigation was triggered by the browser back/forward
	 * gesture (popstate) rather than an explicit in-app navigation (clicking a link,
	 * menu item or row). Used so list pages restore their cached state only when the
	 * user navigates *back* to them, and load fresh data when they navigate *to* them.
	 *
	 * Read it synchronously at the start of a component's `ngOnInit` (before any
	 * `await`), so a later navigation cannot overwrite the value first.
	 */
	isPopStateNavigation(): boolean {
		return this.lastNavigationTrigger === 'popstate';
	}

	/**
	 * Redirects to internal URL
	 *
	 * @param url - The URL to redirect to
	 * @param replaceUrl - If true, replaces the current URL in the browser history
	 */
	async redirectTo(url: string, replaceUrl: boolean = true): Promise<void> {
		// In the WC, `redirectTo` is only reached when an interrupt flow finishes
		// (login / change-password). There is no router and no destination route to
		// honor — the destination is always the shell's primary attribute-derived
		// view — so we just clear the navigation request, which makes the shell fall
		// back to that primary view and re-bootstrap it. The `url` is intentionally
		// ignored.
		if (this.runtimeConfigService.isWebcomponentMode()) {
			this.wcBridge.clearNavigationRequest();
			return;
		}

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

		// The WC has no `/error` route: surface the error through the bridge instead.
		// The shell re-emits it on the host `error` event and shows its own error view.
		if (this.runtimeConfigService.isWebcomponentMode()) {
			this.wcBridge.emitWebComponentEvent({ type: WebComponentEventType.ERROR, reason });
			return urlTree;
		}

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
		return this.redirectToAuthPage('/login', { type: WebComponentNavigationType.LOGIN }, redirectTo, navigate);
	}

	/**
	 * Creates a UrlTree for the mandatory password change page with a `redirectTo`
	 * query parameter and optionally navigates to it.
	 *
	 * @param redirectTo - The URL to redirect to after the password change
	 * @param navigate - If true, navigates to the generated UrlTree
	 * @returns The UrlTree for the change-password page
	 */
	async redirectToChangePasswordPage(redirectTo?: string, navigate = false): Promise<UrlTree> {
		return this.redirectToAuthPage(
			'/change-password-required',
			{ type: WebComponentNavigationType.CHANGE_PASSWORD },
			redirectTo,
			navigate
		);
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

	/**
	 * Open the room-recordings view for the given room. SPA route equivalent:
	 * `/room/<roomId>/recordings`.
	 */
	async goToRoomRecordings(roomId: string): Promise<void> {
		await this.navigateOrRequest(`/room/${roomId}/recordings`, {
			type: WebComponentNavigationType.VIEW_RECORDINGS,
			roomId
		});
	}

	/**
	 * Return from the room-recordings view to the room. WC: clear the recordings
	 * override so the shell falls back to its attribute-derived view (the
	 * meeting/lobby). SPA: navigate to `/room/<roomId>`.
	 */
	async goBackToRoom(roomId: string): Promise<void> {
		if (this.runtimeConfigService.isWebcomponentMode()) {
			this.wcBridge.clearNavigationRequest();
			return;
		}

		await this.navigateTo(`/room/${roomId}`);
	}

	/**
	 * Back-navigation from the meeting lobby / end-meeting / disconnected screens.
	 *
	 * @param fallbackRoute SPA route when no leave-redirect URL is set. Defaults to `/rooms`.
	 * @param replaceUrl Replace the current history entry when navigating to it.
	 */
	async goBackFromMeeting(fallbackRoute = '/rooms', replaceUrl = false): Promise<void> {
		await this.closeOrLeave(fallbackRoute, replaceUrl);
	}

	/**
	 * Back-navigation from a single-recording view: go to room-recordings when the
	 * user can list them and a roomId is known; otherwise end like
	 * {@link goBackFromMeeting} with no SPA fallback route.
	 */
	async goBackFromRecording(roomId: string | undefined, canRetrieveRecordings: boolean): Promise<void> {
		if (canRetrieveRecordings && roomId) {
			await this.goToRoomRecordings(roomId);
			return;
		}

		await this.closeOrLeave();
	}

	/**
	 * Transition to the post-leave state. SPA navigates to the `/disconnected`
	 * screen; WC emits the `left` host event, which drives the end-meeting view and
	 * notifies the host. The `left` event is WC-only — nothing consumes it in the SPA.
	 */
	async goToDisconnected(detail: Omit<WebComponentLeftEvent, 'type'>): Promise<void> {
		if (this.runtimeConfigService.isWebcomponentMode()) {
			this.wcBridge.emitWebComponentEvent({ type: WebComponentEventType.LEFT, ...detail });
			return;
		}

		await this.navigateTo('/disconnected', { reason: detail.reason }, true);
	}

	// PRIVATE HELPERS

	private getBasePathPrefix(): string {
		const basePath = this.runtimeConfigService.basePath;
		if (!basePath || basePath === '/') {
			return '';
		}

		return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
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
	 * Sets the leave redirect URL and stores it in session storage for persistence across page reloads.
	 *
	 * @param leaveRedirectUrl - The URL to set as the leave redirect destination
	 */
	protected setLeaveRedirectUrl(leaveRedirectUrl: string): void {
		this.leaveRedirectUrl = leaveRedirectUrl;
		this.sessionStorageService.setRedirectUrl(leaveRedirectUrl);
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

	// ── High-level navigation intents ─────────────────────────────────────
	//
	// Each centralizes the WC-vs-SPA branch once (SPA: Angular Router; WC: a
	// bridge navigation request, or `closed` to end a flow), so callers never
	// branch on mode or touch the bridge. Add an intent by delegating to one of
	// the two private helpers below.

	/** WC: emit the navigation request so the shell swaps view. SPA: navigate to `spaRoute`. */
	private async navigateOrRequest(spaRoute: string, wcRequest: WcNavigationRequest): Promise<void> {
		if (this.runtimeConfigService.isWebcomponentMode()) {
			this.wcBridge.emitNavigationRequest(wcRequest);
			return;
		}
		await this.navigateTo(spaRoute);
	}

	/**
	 * End the current flow: WC emits `closed`; SPA follows the leave-redirect URL,
	 * else navigates to `fallbackRoute` if given (no-op without).
	 */
	private async closeOrLeave(fallbackRoute?: string, replaceUrl = false): Promise<void> {
		if (this.runtimeConfigService.isWebcomponentMode()) {
			this.wcBridge.emitWebComponentEvent({ type: WebComponentEventType.CLOSED });
			return;
		}

		if (this.getLeaveRedirectURL()) {
			await this.redirectToLeaveUrl();
			return;
		}

		if (fallbackRoute) {
			await this.navigateTo(fallbackRoute, undefined, replaceUrl);
		}
	}

	/**
	 * Shared implementation for the auth pages (`/login`, `/change-password-required`).
	 *
	 * In SPA mode these are router routes carrying an optional `redirectTo` query
	 * param. In webcomponent mode no such route exists, so the page is shown by
	 * emitting `wcRequest` and letting the shell swap views; the router navigation
	 * is skipped to avoid a no-op, and the returned UrlTree is unused by callers
	 * (route guards never run inside the webcomponent).
	 *
	 * @param route - The SPA route for the page
	 * @param wcRequest - The navigation request to emit in webcomponent mode
	 * @param redirectTo - The URL to redirect to after the auth step completes
	 * @param navigate - If true, navigates to the generated UrlTree (SPA mode only)
	 * @returns The UrlTree for the page (consumed by SPA route guards; unused in webcomponent mode)
	 */
	private async redirectToAuthPage(
		route: string,
		wcRequest: WcNavigationRequest,
		redirectTo?: string,
		navigate = false
	): Promise<UrlTree> {
		const queryParams = redirectTo ? { redirectTo } : undefined;
		const urlTree = this.createRedirectionTo(route, queryParams);

		if (this.runtimeConfigService.isWebcomponentMode()) {
			this.wcBridge.emitNavigationRequest(wcRequest);
			return urlTree;
		}

		if (navigate) {
			try {
				await this.router.navigateByUrl(urlTree);
			} catch (error) {
				console.error(`Error redirecting to ${route}:`, error);
			}
		}

		return urlTree;
	}
}
