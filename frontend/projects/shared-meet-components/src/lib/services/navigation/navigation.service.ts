import { Injectable } from '@angular/core';
import { Location } from '@angular/common';
import { Params, Router, UrlTree } from '@angular/router';
import { ErrorReason } from '../../models';

@Injectable({
	providedIn: 'root'
})
export class NavigationService {
	constructor(
		private router: Router,
		private location: Location
	) {}

	/**
	 * Redirects to internal or external URLs
	 */
	async redirectTo(url: string, isExternal: boolean = false): Promise<void> {
		if (isExternal) {
			console.log('Redirecting to external URL:', url);
			window.location.href = url;
		} else {
			console.log('Redirecting to internal route:', url);
			try {
				await this.router.navigate([url], { replaceUrl: true });
			} catch (error) {
				console.error('Error navigating to internal route:', error);
			}
		}
	}

	/**
	 * Redirects to error page with specific reason
	 */
	async redirectToErrorPage(reason: ErrorReason): Promise<void> {
		try {
			await this.router.navigate(['error'], { queryParams: { reason } });
		} catch (error) {
			console.error('Error redirecting to error page:', error);
		}
	}

	/**
	 * Creates a URL tree for redirecting to error page
	 */
	createRedirectionToErrorPage(reason: ErrorReason): UrlTree {
		return this.router.createUrlTree(['error'], { queryParams: { reason } });
	}

	/**
	 * Creates a URL tree for redirecting to login page with `redirectTo` query parameter
	 */
	createRedirectionToLoginPage(redirectTo: string): UrlTree {
		return this.router.createUrlTree(['login'], { queryParams: { redirectTo } });
	}

	/**
	 * Navigates to recordings page
	 */
	async redirectToRecordingsPage(roomId: string, secret: string): Promise<void> {
		try {
			await this.router.navigate([`room/${roomId}/recordings`], {
				queryParams: { secret }
			});
		} catch (error) {
			console.error('Error navigating to recordings:', error);
		}
	}

	/**
	 * Creates a URL tree for redirecting to recordings page
	 */
	createRedirectionToRecordingsPage(roomId: string, secret: string): UrlTree {
		return this.router.createUrlTree([`room/${roomId}/recordings`], {
			queryParams: { secret }
		});
	}

	/**
	 * Updates URL query parameters without navigation
	 */
	updateUrlQueryParams(oldParams: Params, newParams: Record<string, any>): void {
		const queryParams = {
			...oldParams,
			...newParams
		};
		const urlTree = this.router.createUrlTree([], {
			queryParams,
			queryParamsHandling: 'merge'
		});
		const newUrl = this.router.serializeUrl(urlTree);
		this.location.replaceState(newUrl);
	}

	/**
	 * Removes the 'secret' query parameter from the URL
	 */
	removeModeratorSecretFromUrl(queryParams: Params): void {
		delete queryParams['secret'];
		const urlTree = this.router.createUrlTree([], { queryParams });
		const newUrl = this.router.serializeUrl(urlTree);
		this.location.replaceState(newUrl);
	}

	/**
	 * Navigates to a specific route
	 */
	async navigateTo(route: string, queryParams?: Record<string, any>, replaceUrl: boolean = false): Promise<void> {
		try {
			await this.router.navigate([route], {
				queryParams,
				replaceUrl
			});
		} catch (error) {
			console.error('Error navigating to route:', error);
		}
	}
}
