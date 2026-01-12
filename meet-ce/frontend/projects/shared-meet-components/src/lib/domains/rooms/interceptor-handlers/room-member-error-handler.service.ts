import { HttpErrorResponse, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, switchMap, throwError } from 'rxjs';
import { HttpErrorContext, HttpErrorHandler, HttpErrorNotifierService } from '../../../shared/services/http-error-notifier.service';
import { TokenStorageService } from '../../../shared/services/token-storage.service';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';
import { RoomMemberService } from '../services/room-member.service';

/**
 * Handler for room member token-related HTTP errors.
 * Registers itself with HttpErrorNotifierService to autonomously handle room member token refresh.
 * The interceptor doesn't know about this service - it discovers itself via registration.
 */
@Injectable({
	providedIn: 'root'
})
export class RoomMemberInterceptorErrorHandlerService implements HttpErrorHandler {
	private readonly roomMemberService = inject(RoomMemberService);
	private readonly meetingContextService = inject(MeetingContextService);
	private readonly tokenStorageService = inject(TokenStorageService);
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
		const { error, request, pageUrl } = context;

		// Only handle 401 errors
		if (error.status !== 401) {
			return false;
		}

		// Don't handle token generation errors here (let auth handler do it first)
		if (error.url?.includes('/token')) {
			return false;
		}

		// Only handle errors that occur in room pages (excluding profile endpoint)
		return pageUrl.startsWith('/room/') && !request.url.includes('/profile');
	}

	/**
	 * Handles the error and returns a recovery Observable
	 */
	handle(context: HttpErrorContext): Observable<HttpEvent<unknown>> {
		return this.refreshRoomMemberToken(context);
	}

	/**
	 * Refreshes the room member token and retries the original request
	 */
	private refreshRoomMemberToken(context: HttpErrorContext): Observable<HttpEvent<unknown>> {
		const { request: originalRequest, error: originalError, next } = context;
		console.log('Refreshing room member token...');

		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			console.error('Cannot refresh room member token: room ID is undefined');
			return throwError(() => originalError);
		}

		const secret = this.meetingContextService.roomSecret();
		if (!secret) {
			console.error('Cannot refresh room member token: room secret is undefined');
			return throwError(() => originalError);
		}

		const participantName = this.roomMemberService.getParticipantName();
		const participantIdentity = this.roomMemberService.getParticipantIdentity();
		const grantJoinMeetingPermission = !!participantIdentity; // Grant join permission if identity is set

		return from(
			this.roomMemberService.generateToken(roomId, {
				secret,
				grantJoinMeetingPermission,
				participantName,
				participantIdentity
			})
		).pipe(
			switchMap(() => {
				console.log('Room member token refreshed');
				// Update the request with the new token
				const newToken = this.tokenStorageService.getRoomMemberToken();
				const updatedRequest = newToken
					? originalRequest.clone({
							setHeaders: {
								'x-room-member-token': `Bearer ${newToken}`
							}
						})
					: originalRequest;

				return next(updatedRequest);
			}),
			catchError((error: HttpErrorResponse) => {
				if (error.url?.includes('/token')) {
					console.error('Error refreshing room member token');
					return throwError(() => originalError);
				}

				return throwError(() => error);
			})
		);
	}
}
