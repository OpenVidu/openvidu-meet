import { HttpErrorResponse, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, from, switchMap } from 'rxjs';
import {
	HttpErrorContext,
	HttpErrorHandler,
	HttpErrorNotifierService
} from '../../../shared/services/http-error-notifier.service';
import { TokenStorageService } from '../../../shared/services/token-storage.service';
import { AuthService } from '../services/auth.service';

/**
 * Handler for authentication-related HTTP errors.
 * Registers itself with HttpErrorNotifierService to autonomously handle access token refresh.
 * The interceptor doesn't know about this service - it discovers itself via registration.
 */
@Injectable({
	providedIn: 'root'
})
export class AuthInterceptorErrorHandlerService implements HttpErrorHandler {
	private readonly authService = inject(AuthService);
	private readonly tokenStorageService = inject(TokenStorageService);
	private readonly router = inject(Router);
	private readonly httpErrorNotifier = inject(HttpErrorNotifierService);

	/**
	 * Registers this handler with the error notifier service
	 */
	init(): void {
		this.httpErrorNotifier.register(this);
	}

	/**
	 * Determines if this handler can handle the given error context
	 */
	canHandle(context: HttpErrorContext): boolean {
		const { error, pageUrl } = context;

		// Only handle 401 errors
		if (error.status !== 401) {
			return false;
		}

		// Don't handle if it's already a token refresh endpoint error (avoid infinite loop)
		if (error.url?.includes('/auth/refresh')) {
			return false;
		}

		// Special case: room member token generation failed, need to refresh access token first
		if (error.url?.includes('/token')) {
			return true;
		}

		// Handle if not on login page OR if there's a refresh token available
		return !pageUrl.startsWith('/login') || !!this.tokenStorageService.getRefreshToken();
	}

	/**
	 * Handles the error and returns a recovery Observable
	 */
	handle(context: HttpErrorContext): Observable<HttpEvent<unknown>> {
		const { error } = context;

		// Special case: room member token generation failed
		if (error.url?.includes('/token')) {
			console.log('Generating room member token failed. Refreshing access token first...');
		}

		return this.refreshAccessToken(context);
	}

	/**
	 * Refreshes the access token and retries the original request
	 */
	private refreshAccessToken(context: HttpErrorContext): Observable<HttpEvent<unknown>> {
		const { request: originalRequest, error: originalError, pageUrl, next } = context;
		console.log('Refreshing access token...');

		return from(this.authService.refreshToken()).pipe(
			switchMap(() => {
				console.log('Access token refreshed');
				// Update the request with the new token
				const newToken = this.tokenStorageService.getAccessToken();
				const updatedRequest = newToken
					? originalRequest.clone({
							setHeaders: {
								authorization: `Bearer ${newToken}`
							}
						})
					: originalRequest;

				return next(updatedRequest);
			}),
			catchError(async (error: HttpErrorResponse) => {
				if (error.url?.includes('/auth/refresh')) {
					console.error('Error refreshing access token');

					// If the original request was not to the profile endpoint, logout and redirect to the login page
					if (!originalRequest.url.includes('/profile')) {
						console.log('Logging out...');
						await this.authService.logout(pageUrl);
					}

					throw originalError;
				}

				throw error;
			})
		);
	}
}
