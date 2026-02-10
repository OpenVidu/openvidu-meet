import { HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ROOM_MEMBER_CONTEXT_ADAPTER, RoomMemberContextAdapter } from '../adapters';
import { HttpErrorNotifierService, TokenStorageService } from '../services';

/**
 * Adds all necessary authorization headers to the request based on available tokens
 * - authorization: Bearer token for access token (from localStorage)
 * - x-room-member-token: Bearer token for room member token (from sessionStorage)
 */
const addAuthHeadersIfNeeded = (
	req: HttpRequest<unknown>,
	tokenStorageService: TokenStorageService,
	roomMemberContextService: RoomMemberContextAdapter
): HttpRequest<unknown> => {
	const headers: { [key: string]: string } = {};

	// Add access token header if available
	const accessToken = tokenStorageService.getAccessToken();
	if (accessToken) {
		headers['authorization'] = `Bearer ${accessToken}`;
	}

	// Add room member token header if available
	const roomMemberToken = roomMemberContextService.getRoomMemberToken();
	if (roomMemberToken) {
		headers['x-room-member-token'] = `Bearer ${roomMemberToken}`;
	}

	// Clone request with all headers at once if any were added
	return Object.keys(headers).length > 0 ? req.clone({ setHeaders: headers }) : req;
};

/**
 *
 * This interceptor follows the principle of single responsibility and domain separation.
 * It only handles:
 * 1. Adding authorization headers to requests
 * 2. Detecting HTTP errors
 * 3. Delegating error to registered domain handlers
 */
export const httpInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
	const router = inject(Router);
	const tokenStorageService = inject(TokenStorageService);
	const roomMemberContextService = inject(ROOM_MEMBER_CONTEXT_ADAPTER);
	const httpErrorNotifier = inject(HttpErrorNotifierService);

	const pageUrl = router.currentNavigation()?.finalUrl?.toString() || router.url;

	// Add all authorization headers if tokens exist
	req = addAuthHeadersIfNeeded(req, tokenStorageService, roomMemberContextService);

	return next(req).pipe(
		catchError((error: HttpErrorResponse) => {
			// Attempt recovery through registered domain handlers
			const responseHandler$ = httpErrorNotifier.handle({
				error,
				request: req,
				pageUrl,
				next
			});

			// If a handler provided a response Observable, return it
			// Otherwise, rethrow the error
			if (responseHandler$) {
				return responseHandler$;
			}

			return throwError(() => error);
		})
	);
};
