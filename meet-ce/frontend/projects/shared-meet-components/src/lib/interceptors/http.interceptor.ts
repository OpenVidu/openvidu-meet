import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, ParticipantService, RecordingService, RoomService, TokenStorageService } from '@openvidu-meet/shared/services';
import { catchError, from, Observable, switchMap } from 'rxjs';

/**
 * Adds all necessary authorization headers to the request based on available tokens
 * - authorization: Bearer token for access token (from localStorage)
 * - x-participant-token: Bearer token for participant token (from sessionStorage)
 * - x-recording-token: Bearer token for recording token (from sessionStorage)
 */
const addAuthHeadersIfNeeded = (
	req: HttpRequest<unknown>,
	tokenStorageService: TokenStorageService
): HttpRequest<unknown> => {
	const headers: { [key: string]: string } = {};

	// Add access token header if available
	const accessToken = tokenStorageService.getAccessToken();
	if (accessToken) {
		headers['authorization'] = `Bearer ${accessToken}`;
	}

	// Add participant token header if available
	const participantToken = tokenStorageService.getParticipantToken();
	if (participantToken) {
		headers['x-participant-token'] = `Bearer ${participantToken}`;
	}

	// Add recording token header if available
	const recordingToken = tokenStorageService.getRecordingToken();
	if (recordingToken) {
		headers['x-recording-token'] = `Bearer ${recordingToken}`;
	}

	// Clone request with all headers at once if any were added
	return Object.keys(headers).length > 0 ? req.clone({ setHeaders: headers }) : req;
};

export const httpInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
	const router: Router = inject(Router);
	const authService: AuthService = inject(AuthService);
	const roomService = inject(RoomService);
	const participantTokenService = inject(ParticipantService);
	const recordingService = inject(RecordingService);
	const tokenStorageService = inject(TokenStorageService);

	const pageUrl = router.currentNavigation()?.finalUrl?.toString() || router.url;
	const requestUrl = req.url;

	// Clone request with credentials for cookie mode
	req = req.clone({
		withCredentials: true
	});

	// Add all authorization headers if tokens exist
	req = addAuthHeadersIfNeeded(req, tokenStorageService);

	const refreshAccessToken = (firstError: HttpErrorResponse) => {
		console.log('Refreshing access token...');
		return from(authService.refreshToken()).pipe(
			switchMap(() => {
				console.log('Access token refreshed');
				req = addAuthHeadersIfNeeded(req, tokenStorageService);
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
				req = addAuthHeadersIfNeeded(req, tokenStorageService);
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
				req = addAuthHeadersIfNeeded(req, tokenStorageService);
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
