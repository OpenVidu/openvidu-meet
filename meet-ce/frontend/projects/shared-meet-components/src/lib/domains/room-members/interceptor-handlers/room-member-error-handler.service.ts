import { HttpErrorResponse, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, switchMap, throwError } from 'rxjs';
import {
	HttpErrorContext,
	HttpErrorHandler,
	HttpErrorNotifierService
} from '../../../shared/services/http-error-notifier.service';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';
import { RoomMemberContextService } from '../services/room-member-context.service';
import { RoomMemberHeaderProviderService } from './room-member-header-provider.service';

/**
 * Handler for room member token-related HTTP errors.
 * Registers itself with HttpErrorNotifierService to autonomously handle room member token refresh.
 * The interceptor doesn't know about this service - it discovers itself via registration.
 */
@Injectable({
	providedIn: 'root'
})
export class RoomMemberInterceptorErrorHandlerService implements HttpErrorHandler {
	private readonly roomMemberContextService = inject(RoomMemberContextService);
	private readonly meetingContextService = inject(MeetingContextService);
	private readonly httpErrorNotifier = inject(HttpErrorNotifierService);
	private readonly roomMemberHeaderProvider = inject(RoomMemberHeaderProviderService);

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
		if (error.url?.includes('/members/token')) {
			return false;
		}

		// Only handle errors that occur in room pages (excluding profile endpoint)
		return pageUrl.startsWith('/room/') && !request.url.includes('/users/me');
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
		const participantName = this.roomMemberContextService.participantName();
		const participantIdentity = this.roomMemberContextService.participantIdentity();
		const joinMeeting = !!participantIdentity; // Grant join permission if identity is set

		return from(
			this.roomMemberContextService.generateToken(roomId, {
				secret,
				joinMeeting,
				participantName,
				participantIdentity
			})
		).pipe(
			switchMap(() => {
				console.log('Room member token refreshed');

				// Update the request with the new token
				const headers = this.roomMemberHeaderProvider.provideHeaders();
				const updatedRequest = headers ? originalRequest.clone({ setHeaders: headers }) : originalRequest;

				return next(updatedRequest);
			}),
			catchError((error: HttpErrorResponse) => {
				if (error.url?.includes('/members/token')) {
					console.error('Error refreshing room member token');
					return throwError(() => originalError);
				}

				return throwError(() => error);
			})
		);
	}
}
