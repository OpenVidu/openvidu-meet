import { HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { catchError, from, switchMap } from 'rxjs';
import { AuthService, ContextService, HttpService, SessionStorageService } from '../services';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

export const httpInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
	const router: Router = inject(Router);
	const authService: AuthService = inject(AuthService);
	const contextService = inject(ContextService);
	const sessionStorageService = inject(SessionStorageService);
	const httpService: HttpService = inject(HttpService);

	req = req.clone({
		withCredentials: true
	});

	return next(req).pipe(
		catchError((error: HttpErrorResponse) => {
			if (error.status === 401) {
				// Expired access token
				// Get current URL to determine if it's an admin or participant route
				const url = router.getCurrentNavigation()?.finalUrl?.toString() || router.url;

				if (url.startsWith('/console')) {
					if (!url.includes('login')) {
						console.log('Refreshing admin token...');
						return authService.adminRefresh().pipe(
							switchMap(() => {
								console.log('Admin token refreshed');
								return next(req);
							}),
							catchError(() => {
								console.error('Error refreshing admin token. Logging out...');
								authService.adminLogout();
								throw error;
							})
						);
					}
				} else if (url.startsWith('/room')) {
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
						catchError(() => {
							console.error('Error refreshing participant token');
							throw error;
						})
					);
				}
			}

			throw error;
		})
	);
};
