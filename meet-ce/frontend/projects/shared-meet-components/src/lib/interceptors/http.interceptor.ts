import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, Observable, switchMap } from 'rxjs';
import { AuthService, RoomMemberService, RoomService, TokenStorageService } from '../services';

/**
 * Adds all necessary authorization headers to the request based on available tokens
 * - authorization: Bearer token for access token (from localStorage)
 * - x-room-member-token: Bearer token for room member token (from sessionStorage)
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

	// Add room member token header if available
	const roomMemberToken = tokenStorageService.getRoomMemberToken();
	if (roomMemberToken) {
		headers['x-room-member-token'] = `Bearer ${roomMemberToken}`;
	}

	// Clone request with all headers at once if any were added
	return Object.keys(headers).length > 0 ? req.clone({ setHeaders: headers }) : req;
};

export const httpInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
	const router: Router = inject(Router);
	const authService: AuthService = inject(AuthService);
	const roomService = inject(RoomService);
	const roomMemberService = inject(RoomMemberService);
	const tokenStorageService = inject(TokenStorageService);

	const pageUrl = router.currentNavigation()?.finalUrl?.toString() || router.url;
	const requestUrl = req.url;

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

	const refreshRoomMemberToken = (firstError: HttpErrorResponse): Observable<HttpEvent<unknown>> => {
		console.log('Refreshing room member token...');
		const roomId = roomService.getRoomId();
		const secret = roomService.getRoomSecret();
		const participantName = roomMemberService.getParticipantName();
		const participantIdentity = roomMemberService.getParticipantIdentity();
		const grantJoinMeetingPermission = !!participantIdentity; // Grant join permission if identity is set

		return from(
			roomMemberService.generateToken(roomId, {
				secret,
				grantJoinMeetingPermission,
				participantName,
				participantIdentity
			})
		).pipe(
			switchMap(() => {
				console.log('Room member token refreshed');
				req = addAuthHeadersIfNeeded(req, tokenStorageService);
				return next(req);
			}),
			catchError((error: HttpErrorResponse) => {
				if (error.url?.includes('/token')) {
					console.error('Error refreshing room member token');
					throw firstError;
				}

				throw error;
			})
		);
	};

	return next(req).pipe(
		catchError((error: HttpErrorResponse) => {
			if (error.status === 401) {
				// Error refreshing room member token
				if (error.url?.includes('/token')) {
					console.log('Generating room member token failed. Refreshing access token first...');
					// This means that first we need to refresh the access token and then the room member token
					return refreshAccessToken(error);
				}

				// Expired room member token
				if (pageUrl.startsWith('/room/') && !requestUrl.includes('/profile')) {
					// If the error occurred in a room page and the request is not to the profile endpoint,
					// refresh the room member token
					return refreshRoomMemberToken(error);
				}

				// Expired access token
				if (!pageUrl.startsWith('/login') || !!tokenStorageService.getRefreshToken()) {
					// If the error occurred in a page that is not the login page,
					// or if there is a refresh token available, refresh the access token
					return refreshAccessToken(error);
				}
			}

			throw error;
		})
	);
};
