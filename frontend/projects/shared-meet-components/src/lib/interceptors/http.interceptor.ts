import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, ParticipantService, RecordingService, RoomService } from '@lib/services';
import { catchError, from, Observable, switchMap } from 'rxjs';

export const httpInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
	const router: Router = inject(Router);
	const authService: AuthService = inject(AuthService);
	const roomService = inject(RoomService);
	const participantTokenService = inject(ParticipantService);
	const recordingService = inject(RecordingService);

	const pageUrl = router.currentNavigation()?.finalUrl?.toString() || router.url;
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
			catchError(async (error: HttpErrorResponse) => {
				if (error.url?.includes('/auth/refresh')) {
					console.error('Error refreshing access token');

					// If the original request was not to the profile endpoint, logout and redirect to the login page
					if (!requestUrl.includes('/profile')) {
						console.log('Logging out...');
						await authService.logout(pageUrl);
					}

					throw firstError;
				}

				throw error;
			})
		);
	};

	const refreshParticipantToken = (firstError: HttpErrorResponse): Observable<HttpEvent<unknown>> => {
		console.log('Refreshing participant token...');
		const roomId = roomService.getRoomId();
		const secret = roomService.getRoomSecret();
		const participantName = participantTokenService.getParticipantName();
		const participantIdentity = participantTokenService.getParticipantIdentity();

		return from(
			participantTokenService.refreshParticipantToken({ roomId, secret, participantName, participantIdentity })
		).pipe(
			switchMap(() => {
				console.log('Participant token refreshed');
				return next(req);
			}),
			catchError((error: HttpErrorResponse) => {
				if (error.url?.includes('/token/refresh')) {
					console.error('Error refreshing participant token');
					throw firstError;
				}

				throw error;
			})
		);
	};

	const refreshRecordingToken = (firstError: HttpErrorResponse): Observable<HttpEvent<unknown>> => {
		console.log('Refreshing recording token...');
		const roomId = roomService.getRoomId();
		const secret = roomService.getRoomSecret();

		return from(recordingService.generateRecordingToken(roomId, secret)).pipe(
			switchMap(() => {
				console.log('Recording token refreshed');
				return next(req);
			}),
			catchError((error: HttpErrorResponse) => {
				if (error.url?.includes('/recording-token')) {
					console.error('Error refreshing recording token');
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

				// Error refreshing recording token
				if (error.url?.includes('/recording-token')) {
					console.log('Refreshing recording token failed. Refreshing access token first...');
					// This means that first we need to refresh the access token and then the recording token
					return refreshAccessToken(error);
				}

				// Expired recording token
				if (
					pageUrl.startsWith('/room/') &&
					pageUrl.includes('/recordings') &&
					requestUrl.includes('/recordings')
				) {
					// If the error occurred in the room recordings page and the request is to the recordings endpoint,
					// refresh the recording token
					return refreshRecordingToken(error);
				}

				// Expired participant token
				if (
					pageUrl.startsWith('/room/') &&
					!pageUrl.includes('/recordings') &&
					!requestUrl.includes('/profile')
				) {
					// If the error occurred in a room page and the request is not to the profile endpoint,
					// refresh the participant token
					return refreshParticipantToken(error);
				}

				// Expired access token
				if (!pageUrl.startsWith('/login')) {
					// If the error occurred in a page that is not the login page, refresh the access token
					return refreshAccessToken(error);
				}
			}

			throw error;
		})
	);
};
