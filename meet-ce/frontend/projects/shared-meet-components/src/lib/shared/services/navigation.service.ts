import { inject, Service } from '@angular/core';
import { NavigationStart, Params, Router, UrlTree } from '@angular/router';
import { EmbeddedEventName, LeftEventReason } from '@openvidu-meet/typings';
import { WcRouteName } from '../../domains/embedded/models/wc-route.model';
import { wcRouteFromPath } from '../../domains/embedded/utils/wc-route.utils';
import { EmbeddedEventBusService } from '../../domains/embedded/services/embedded-event-bus.service';
import { WcRouterGateway } from '../../domains/embedded/services/wc-router-gateway.service';
import { ACCESS_TOKEN_QUERY_PARAM, REFRESH_TOKEN_QUERY_PARAM } from '../guards/store-tokens-from-query-params.guard';
import { NavigationErrorReason } from '../models/navigation.model';
import { LeaveRedirectService } from './leave-redirect.service';
import { ListStateCacheService } from './list-state-cache.service';
import { RuntimeConfigService } from './runtime-config.service';
import { TokenStorageService } from './token-storage.service';

@Service()
export class NavigationService {
	private readonly eventBus = inject(EmbeddedEventBusService);
	private readonly router = inject(Router);
	private readonly runtimeConfigService = inject(RuntimeConfigService);
	private readonly listStateCacheService = inject(ListStateCacheService);
	private readonly tokenStorageService = inject(TokenStorageService);
	private readonly leaveRedirect = inject(LeaveRedirectService);
	// Drives the WC mini-router through a leaf gateway rather than injecting WcRouterService directly:
	// the router's guards pull in entry services that (transitively) inject NavigationService, so a
	// direct dependency would close a DI cycle. WcRouterService registers itself on the gateway.
	private readonly wcRouterGateway = inject(WcRouterGateway);

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
	 * Redirects the user to the leave redirect URL if set and valid.
	 */
	async redirectToLeaveUrl() {
		const url = this.leaveRedirect.getLeaveRedirectURL();
		if (!url) {
			console.warn('No leave redirect URL set');
			return;
		}

		const isExternalURL = /^https?:\/\//.test(url);
		if (!isExternalURL) {
			console.error('Leave redirect URL is not a valid external URL:', url);
			return;
		}

		this.redirectWindow(url);
	}

	/**
	 * Navigate to `url`. `window.top` is the host window when embedded in an iframe — so the
	 * whole page redirects, not just the iframe — and is `window` itself in the SPA and
	 * webcomponent, so a single assignment covers every mode (no iframe check needed). Falls
	 * back to the current window if a sandboxed iframe blocks top-level navigation.
	 */
	private redirectWindow(url: string): void {
		try {
			(window.top ?? window).location.href = url;
		} catch (error) {
			console.warn('Could not navigate the top window; redirecting within the iframe instead:', error);
			window.location.href = url;
		}
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
	 * Opens an internal app path in a new browser tab.
	 *
	 * In webcomponent mode the new tab is served by the Meet server on a different
	 * origin than the embedding page, so it shares no storage/context with the
	 * current view. To let the opened page authenticate the user, the access and
	 * refresh tokens (and an optional `secret`, e.g. a room secret) are forwarded as
	 * query params and the path is resolved against the Meet server origin. In SPA
	 * and iframe mode the path is same-origin, so only the configured base path is
	 * applied.
	 *
	 * @param path - The internal app path to open (e.g. `/recording/<id>`)
	 * @param secret - Optional secret to forward as a query param in webcomponent mode
	 * @param features - Optional `window.open` features string (e.g. `noopener,noreferrer`)
	 */
	openInNewTab(path: string, secret?: string, features?: string): void {
		if (this.runtimeConfigService.isWebcomponentMode()) {
			const queryParams = new URLSearchParams();

			if (secret) {
				queryParams.set('secret', secret);
			}

			const accessToken = this.tokenStorageService.getAccessToken();
			if (accessToken) {
				queryParams.set(ACCESS_TOKEN_QUERY_PARAM, accessToken);
			}

			const refreshToken = this.tokenStorageService.getRefreshToken();
			if (refreshToken) {
				queryParams.set(REFRESH_TOKEN_QUERY_PARAM, refreshToken);
			}

			const queryString = queryParams.toString();
			if (queryString) {
				path += `?${queryString}`;
			}
		}

		// resolveUrl applies the deployment base path in SPA mode and the remote Meet
		// server origin (which already carries the base path) in webcomponent mode.
		const url = this.runtimeConfigService.resolveUrl(path);
		window.open(url, '_blank', features);
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
		// In the WC, `redirectTo` completes an interrupt flow (login / change-password).
		// Resolve the destination path back to a route and drive the mini-router there
		// (re-running its guard now that the user is authenticated). An empty/unparseable
		// destination falls back to the attribute-derived home view.
		if (this.runtimeConfigService.isWebcomponentMode()) {
			const route = url ? wcRouteFromPath(url) : null;
			if (route) {
				await this.wcRouterGateway.navigate(route);
			} else {
				await this.wcRouterGateway.navigateToInitial();
			}
			return;
		}

		try {
			// Strip basePath prefix if present, since Angular router operates relative to <base href>
			url = this.runtimeConfigService.stripBasePath(url);

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

		// The WC has no `/error` route: drive the mini-router to the error view. The shell
		// emits the host `error` event when it renders the error route.
		if (this.runtimeConfigService.isWebcomponentMode()) {
			await this.wcRouterGateway.navigate({ name: WcRouteName.ERROR, params: { reason } });
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
		return this.redirectToAuthPage('/login', WcRouteName.LOGIN, redirectTo, navigate);
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
		return this.redirectToAuthPage('/change-password-required', WcRouteName.CHANGE_PASSWORD, redirectTo, navigate);
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
		if (this.runtimeConfigService.isWebcomponentMode()) {
			await this.wcRouterGateway.navigate({ name: WcRouteName.ROOM_RECORDINGS, params: { roomId } });
			return;
		}

		await this.navigateTo(`/room/${roomId}/recordings`);
	}

	/**
	 * Return from the room-recordings view to the room. WC: re-enter the
	 * attribute-derived home view (the meeting/lobby). SPA: navigate to `/room/<roomId>`.
	 */
	async goBackToRoom(roomId: string): Promise<void> {
		if (this.runtimeConfigService.isWebcomponentMode()) {
			await this.wcRouterGateway.navigate({ name: WcRouteName.MEETING, params: { roomId } });
			return;
		}

		await this.navigateTo(`/room/${roomId}`);
	}

	/**
	 * Back-navigation from the meeting lobby / disconnected / error screens.
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
	 * Transition to the post-leave view: the WC drives its mini-router to the disconnected route
	 * (it has no Angular Router), while the SPA and iframe navigate to the in-app `/disconnected`
	 * screen.
	 */
	async goToDisconnected(reason: LeftEventReason): Promise<void> {
		// The WC has no router: drive the mini-router to the disconnected view.
		if (this.runtimeConfigService.isWebcomponentMode()) {
			await this.wcRouterGateway.navigate({ name: WcRouteName.DISCONNECTED, params: { reason } });
			return;
		}

		await this.navigateTo('/disconnected', { reason }, true);
	}

	// ── High-level navigation intents ─────────────────────────────────────
	//
	// Each centralizes the WC-vs-SPA branch once (SPA: Angular Router; WC: the
	// WcRouterService, or `closed` to end a flow), so callers never branch on mode.

	/**
	 * End the current flow. Embedded modes always emit `closed` first so the host
	 * can tear down the integration, then redirect if a leave-redirect URL is
	 * configured. Otherwise, the SPA navigates to `fallbackRoute` if given.
	 */
	private async closeOrLeave(fallbackRoute?: string, replaceUrl = false): Promise<void> {
		const isEmbeddedMode = this.runtimeConfigService.isEmbeddedMode();
		if (isEmbeddedMode) {
			this.eventBus.emit({ event: EmbeddedEventName.CLOSED });
		}

		const leaveRedirectUrl = this.leaveRedirect.getLeaveRedirectURL();
		if (leaveRedirectUrl) {
			await this.redirectToLeaveUrl();
			return;
		}

		// No redirect configured: only the SPA falls back to an internal route.
		if (fallbackRoute && !isEmbeddedMode) {
			await this.navigateTo(fallbackRoute, undefined, replaceUrl);
		}
	}

	/**
	 * Shared implementation for the auth pages (`/login`, `/change-password-required`).
	 *
	 * In SPA mode these are router routes carrying an optional `redirectTo` query param.
	 * In webcomponent mode no such route exists, so the mini-router is driven to the auth
	 * view, carrying `redirectTo` so a successful login/change-password can resume the
	 * originating route; the SPA router navigation is skipped and the returned UrlTree is
	 * unused by callers (route guards never run inside the webcomponent).
	 *
	 * @param route - The SPA route for the page
	 * @param wcRouteName - The WC route to navigate to in webcomponent mode
	 * @param redirectTo - The URL to redirect to after the auth step completes
	 * @param navigate - If true, navigates to the generated UrlTree (SPA mode only)
	 * @returns The UrlTree for the page (consumed by SPA route guards; unused in webcomponent mode)
	 */
	private async redirectToAuthPage(
		route: string,
		wcRouteName: WcRouteName.LOGIN | WcRouteName.CHANGE_PASSWORD,
		redirectTo?: string,
		navigate = false
	): Promise<UrlTree> {
		const queryParams = redirectTo ? { redirectTo } : undefined;
		const urlTree = this.createRedirectionTo(route, queryParams);

		if (this.runtimeConfigService.isWebcomponentMode()) {
			const authRoute =
				wcRouteName === WcRouteName.LOGIN
					? { name: WcRouteName.LOGIN as const, params: { redirectTo } }
					: { name: WcRouteName.CHANGE_PASSWORD as const, params: { redirectTo } };
			await this.wcRouterGateway.navigate(authRoute);
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
