import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { catchError, from, Observable, switchMap } from 'rxjs';
import { AuthService, ContextService, HttpService, SessionStorageService } from '../services';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

export const httpInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
	const router: Router = inject(Router);
	const authService: AuthService = inject(AuthService);
	const contextService = inject(ContextService);
	const sessionStorageService = inject(SessionStorageService);
	const httpService: HttpService = inject(HttpService);

	const pageUrl = router.getCurrentNavigation()?.finalUrl?.toString() || router.url;
	const requestUrl = req.url;

	req = req.clone({
		withCredentials: true
	});

	const refreshAccessToken = (firstError: HttpErrorResponse) => {
		console.log('Refreshing access token...');
		return authService.refreshToken().pipe(
			switchMap(() => {
				console.log('Access token refreshed');
				return next(req);
			}),
			catchError((error: HttpErrorResponse) => {
				if (error.url?.includes('/auth/refresh')) {
					console.error('Error refreshing access token');

					// If the original request was not to the profile endpoint, logout and redirect to the login page
					if (!requestUrl.includes('/profile')) {
						console.log('Logging out...');
						const redirectTo = pageUrl.startsWith('/console') ? 'console/login' : 'login';
						authService.logout(redirectTo);
					}

					throw firstError;
				}

				throw error;
			})
		);
	};

	const refreshParticipantToken = (firstError: HttpErrorResponse): Observable<HttpEvent<unknown>> => {
		console.log('Refreshing participant token...');
		const roomId = contextService.getRoomId();
		const participantName = contextService.getParticipantName();
		const storedSecret = sessionStorageService.getModeratorSecret(roomId);
		const secret = storedSecret || contextService.getSecret();

		return from(httpService.refreshParticipantToken({ roomId, participantName, secret })).pipe(
			switchMap((data) => {
				console.log('Participant token refreshed');
				contextService.setToken(data.token);
				return next(req);
			}),
			catchError((error: HttpErrorResponse) => {
				if (error.url?.includes('/token/refresh')) {
					if (error.status === 409) {
						console.log('Participant token is still valid');
						// This means that the unauthorized error was due to an expired access token
						// Refresh the access token and try again
						return refreshAccessToken(firstError);
					}

					console.error('Error refreshing participant token');
					throw firstError;
				}

				throw error;
			})
		);
	};

	return next(req).pipe(
		catchError((error: HttpErrorResponse) => {
			if (error.status === 401) {
				// Error refreshing participant token
				if (error.url?.includes('/token/refresh')) {
					console.log('Refreshing participant token failed. Refreshing access token first...');
					// This means that first we need to refresh the access token and then the participant token
					return refreshAccessToken(error);
				}

				// Expired access/participant token
				if (pageUrl.startsWith('/room') && !requestUrl.includes('/profile')) {
					// If the error occurred in a room page and the request is not to the profile endpoint,
					// refresh the participant token
					return refreshParticipantToken(error);
				} else if (!pageUrl.startsWith('/console/login') && !pageUrl.startsWith('/login')) {
					// If the error occurred in a page that is not the login page, refresh the access token
					return refreshAccessToken(error);
				}
			}

			throw error;
		})
	);
};
