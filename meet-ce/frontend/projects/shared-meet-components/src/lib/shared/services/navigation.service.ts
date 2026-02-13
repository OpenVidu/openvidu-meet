import { Injectable } from '@angular/core';
import { Params, Router, UrlTree } from '@angular/router';
import { NavigationErrorReason } from '../models/navigation.model';
import { AppContextService } from './app-context.service';
import { SessionStorageService } from './session-storage.service';

@Injectable({
	providedIn: 'root'
})
export class NavigationService {
	protected leaveRedirectUrl?: string;

	constructor(
		private router: Router,
		private sessionStorageService: SessionStorageService,
		private appCtxService: AppContextService
	) {}

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
		const isEmbeddedMode = this.appCtxService.isEmbeddedMode();

		// Explicit valid URL provided - use as is
		if (leaveRedirectUrl && this.isValidUrl(leaveRedirectUrl)) {
			this.setLeaveRedirectUrl(leaveRedirectUrl);
			return;
		}

		// Absolute path provided in embedded mode - construct full URL based on parent origin
		if (isEmbeddedMode && leaveRedirectUrl?.startsWith('/')) {
			const parentUrl = document.referrer;
			const parentOrigin = new URL(parentUrl).origin;
			this.setLeaveRedirectUrl(parentOrigin + leaveRedirectUrl);
			return;
		}

		// Auto-detect from referrer (only if no explicit URL provided and not embedded)
		if (!leaveRedirectUrl && !isEmbeddedMode) {
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

		const isEmbeddedMode = this.appCtxService.isEmbeddedMode();
		if (isEmbeddedMode) {
			// Change the top window location if in embedded mode
			window.top!.location.href = url;
		} else {
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
	 */
	async redirectTo(url: string): Promise<void> {
		try {
			let urlTree = this.router.parseUrl(url);
			await this.router.navigateByUrl(urlTree, { replaceUrl: true });
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
}
