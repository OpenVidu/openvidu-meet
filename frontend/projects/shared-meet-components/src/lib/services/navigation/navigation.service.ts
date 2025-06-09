import { Injectable } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ErrorRedirectReason } from '@lib/models/navigation.model';

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
	async redirectToErrorPage(reason: keyof ErrorRedirectReason): Promise<void> {
		try {
			await this.router.navigate(['error'], { queryParams: { reason } });
		} catch (error) {
			console.error('Error redirecting to error page:', error);
		}
	}

	/**
	 * Updates URL query parameters without navigation
	 */
	updateUrlQueryParams(route: ActivatedRoute, newParams: Record<string, any>): void {
		const queryParams = {
			...route.snapshot.queryParams,
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
	 * Navigates to recordings page
	 */
	async goToRecordings(roomId: string, secret: string): Promise<void> {
		try {
			await this.router.navigate([`room/${roomId}/recordings`], {
				queryParams: { secret }
			});
		} catch (error) {
			console.error('Error navigating to recordings:', error);
		}
	}
}
