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

	const url = router.getCurrentNavigation()?.finalUrl?.toString() || router.url;

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
					console.error('Error refreshing access token. Logging out...');
					const redirectTo = url.startsWith('/console') ? 'console/login' : 'login';
					authService.logout(redirectTo);
					throw firstError;
				}

				throw error;
			})
		);
	};

	const refreshParticipantToken = (firstError: HttpErrorResponse): Observable<HttpEvent<unknown>> => {
		console.log('Refreshing participant token...');
		const roomName = contextService.getRoomName();
		const participantName = contextService.getParticipantName();
		const storedSecret = sessionStorageService.getModeratorSecret(roomName);
		const secret = storedSecret || contextService.getSecret();

		return from(httpService.refreshParticipantToken({ roomName, participantName, secret })).pipe(
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
				if (url.startsWith('/room')) {
					return refreshParticipantToken(error);
				} else if (!url.startsWith('/console/login') && !url.startsWith('/login')) {
					return refreshAccessToken(error);
				}
			}

			throw error;
		})
	);
};
