import { Injectable } from '@angular/core';
import { WcRoute } from '../models/wc-route.model';

/**
 * The subset of {@link WcRouterService} that out-of-domain callers drive. Declared here (not imported
 * from the router) so consumers can depend on the capability without depending on the router itself.
 */
export interface WcNavigator {
	navigate(route: WcRoute): Promise<void>;
	navigateToInitial(): Promise<void>;
}

/**
 * Dependency-inversion seam between {@link NavigationService} (in `shared/`) and {@link WcRouterService}
 * (in `domains/embedded/`).
 *
 * NavigationService's webcomponent branches must drive the WC mini-router, but injecting WcRouterService
 * directly closes a DI cycle. Routing the call through this leaf gateway (which depends on nothing) removes that edge:
 * NavigationService injects the gateway, and WcRouterService registers itself as the handler when the WC shell constructs it.
 *
 * Until a router registers (SPA/iframe mode has no WC router) the methods are no-ops — safe because
 * NavigationService only calls them in webcomponent mode, where the shell has constructed the router.
 */
@Injectable({ providedIn: 'root' })
export class WcRouterGateway {
	private navigator: WcNavigator | null = null;

	/** Wire up the concrete router. Called once by {@link WcRouterService} on construction. */
	register(navigator: WcNavigator): void {
		this.navigator = navigator;
	}

	navigate(route: WcRoute): Promise<void> {
		return this.navigator?.navigate(route) ?? Promise.resolve();
	}

	navigateToInitial(): Promise<void> {
		return this.navigator?.navigateToInitial() ?? Promise.resolve();
	}
}
