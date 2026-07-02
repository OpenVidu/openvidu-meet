import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { WcRoute, WcRouteName, WcRouteStatus } from '../models/wc-route.model';
import { wcRouteToPath } from '../utils/wc-route.utils';
import {
	WcGuardResult,
	WcMeetingGuard,
	WcRoomRecordingsGuard,
	WcRouteGuard,
	WcSingleRecordingGuard
} from '../guards/wc-route-guards';
import { WcNavigator, WcRouterGateway } from './wc-router-gateway.service';

/** Upper bound on chained redirects, to fail fast on an accidental loop (e.g. login → origin → login). */
const MAX_REDIRECTS = 10;

/**
 * The webcomponent's mini-router. The WC has no Angular Router, so this service plays
 * the equivalent role: it holds the current {@link WcRoute}, runs that route's guard
 * (reusing the SAME entry services as the SPA route guards), follows redirect outcomes,
 * and exposes a `status` the shell uses to gate rendering of guarded views.
 *
 * Lives in `shared-meet-components` (not the webcomponent project) because
 * {@link NavigationService} — also shared — drives it; the shell only translates host
 * attributes into a {@link WcRoute} and renders `currentRoute`.
 */
@Injectable({ providedIn: 'root' })
export class WcRouterService implements WcNavigator {
	// Factory: route name → guard. Guarded routes delegate to their entry service via an
	// attribute-injected guard; every other route renders directly (a synchronous `ready`).
	private readonly guards: Partial<Record<WcRouteName, WcRouteGuard>> = {
		[WcRouteName.MEETING]: inject(WcMeetingGuard),
		[WcRouteName.SINGLE_RECORDING]: inject(WcSingleRecordingGuard),
		[WcRouteName.ROOM_RECORDINGS]: inject(WcRoomRecordingsGuard)
	};

	constructor() {
		// Register as the handler behind the gateway so NavigationService can drive WC navigation
		// without injecting this router directly (which would close a DI cycle back through the
		// route guards' entry services → NavigationService).
		inject(WcRouterGateway).register(this);
	}

	private readonly _currentRoute = signal<WcRoute | null>(null);
	private readonly _status = signal<WcRouteStatus>('running');

	/** The route the shell falls back to (the attribute-derived "home"); set via {@link setHomeRoute}. */
	private homeRoute: WcRoute | null = null;

	/** Monotonic id so a slow guard from a superseded navigation cannot overwrite a newer route. */
	private navSeq = 0;

	/** The view currently selected, or `null` before the first navigation. */
	readonly currentRoute = this._currentRoute.asReadonly();

	/** Lifecycle of the in-progress navigation; the shell renders guarded views only when `'ready'`. */
	readonly status = this._status.asReadonly();

	/**
	 * The SPA-equivalent path of the current route, or `null` before the first navigation. The HTTP
	 * interceptor reads this (in webcomponent mode) as the `pageUrl` for route-based header/error
	 * decisions — the WC analog of the Angular Router's URL. Because {@link navigate} sets
	 * {@link currentRoute} synchronously before a guard's first request, the interceptor observes the
	 * correct path when it pulls this value at request time.
	 */
	readonly currentPath = computed<string | null>(() => {
		const route = this._currentRoute();
		return route ? wcRouteToPath(route) : null;
	});

	/** Navigate to `route`: render it, run its guard, and follow any redirect it produces. */
	async navigate(route: WcRoute): Promise<void> {
		return this.runNavigation(route, 0);
	}

	/** Re-enter the home (attribute-derived) route, re-running its guard. No-op if none registered. */
	navigateToInitial(): Promise<void> {
		return this.homeRoute ? this.navigate(this.homeRoute) : Promise.resolve();
	}

	/** Register the current attribute-derived route as the fallback for {@link navigateToInitial}. */
	setHomeRoute(route: WcRoute): void {
		this.homeRoute = route;
	}

	private async runNavigation(route: WcRoute, depth: number): Promise<void> {
		if (depth > MAX_REDIRECTS) {
			console.error('WcRouter: too many redirects; aborting to the error view');
			this.setError(NavigationErrorReason.INTERNAL_ERROR);
			return;
		}

		const navId = ++this.navSeq;
		// Set the route before awaiting so interrupt/render views (login, error, …) appear immediately;
		// guarded views stay hidden by the shell until status flips to 'ready'.
		this.setRoute(route);
		this._status.set('running');

		let result: WcGuardResult;
		try {
			result = await this.runGuard(route);
		} catch (error) {
			console.error('WcRouter: guard threw while entering route', route.name, error);
			result = { kind: 'error', reason: NavigationErrorReason.INTERNAL_ERROR };
		}

		// A newer navigation started while this guard ran — abandon this (now stale) result.
		if (navId !== this.navSeq) {
			return;
		}

		switch (result.kind) {
			case 'ready':
				this._status.set('ready');
				return;
			case 'redirect':
				return this.runNavigation(result.to, depth + 1);
			case 'error':
				this.setError(result.reason);
				return;
		}
	}

	/**
	 * Resolves the guard for a route from the registry and runs it. Non-guarded views (login,
	 * change-password, disconnected, error, invalid) have no entry and render directly.
	 */
	private runGuard(route: WcRoute): Promise<WcGuardResult> | WcGuardResult {
		const guard = this.guards[route.name];
		return guard ? guard.canActivate(route) : { kind: 'ready' };
	}

	private setError(reason: NavigationErrorReason): void {
		this.setRoute({ name: WcRouteName.ERROR, params: { reason } });
		this._status.set('ready');
	}

	/**
	 * Sets the current route. The HTTP interceptor derives its `pageUrl` from {@link currentPath},
	 * a computed over this signal — set synchronously here before a guard's first request fires
	 * (the guard runs synchronously up to its first HTTP call in the same call stack), so the
	 * interceptor pulls the correct path.
	 */
	private setRoute(route: WcRoute): void {
		this._currentRoute.set(route);
	}
}
