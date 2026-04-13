import { HttpErrorResponse, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, switchMap } from 'rxjs';
import { HTTP_HEADERS } from '../../../shared/constants/http-headers.constants';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import {
	HttpErrorContext,
	HttpErrorHandler,
	HttpErrorNotifierService
} from '../../../shared/services/http-error-notifier.service';
import { NavigationService } from '../../../shared/services/navigation.service';
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
	private readonly navigationService = inject(NavigationService);

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

		// Do not attempt room-member refresh more than once for the same request.
		if (request.headers.get(HTTP_HEADERS.ROOM_REFRESH_ATTEMPTED) === 'true') {
			return false;
		}

		const hasRecordingSecretInRequest = request.url.includes('recordingSecret=');
		const hasRoomMemberToken = !!this.roomMemberContextService.roomMemberToken();

		// Private-recording-secret-only flow: skip room-member refresh and let auth handler recover.
		if (hasRecordingSecretInRequest && !hasRoomMemberToken) {
			return false;
		}

		// Only handle errors that occur in room or recording pages,
		// excluding requests to the profile endpoint and that do not have the skip-auth-recovery header
		return (
			(pageUrl.startsWith('/room/') || pageUrl.startsWith('/recording/')) &&
			!request.url.includes('/users/me') &&
			request.headers.get(HTTP_HEADERS.SKIP_AUTH_RECOVERY) !== 'true'
		);
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
		console.log('Regenerating room member token...');

		const roomId = this.meetingContextService.roomId();
		if (!roomId) {
			console.error('Cannot regenerate room member token: room ID is undefined');
			throw originalError;
		}

		const secret = this.meetingContextService.roomSecret();
		const joinMeeting = !!this.meetingContextService.isActiveMeeting();
		return from(
			this.roomMemberContextService.generateToken(roomId, {
				secret,
				joinMeeting
			})
		).pipe(
			switchMap(() => {
				console.log('Room member token regenerated');

				// Update the request with the new token
				const headers = this.roomMemberHeaderProvider.provideHeaders();
				const updatedRequest = originalRequest.clone({
					setHeaders: {
						...(headers || {}),
						[HTTP_HEADERS.ROOM_REFRESH_ATTEMPTED]: 'true'
					}
				});

				return next(updatedRequest);
			}),
			catchError(async (error: HttpErrorResponse) => {
				if (error.url?.includes('/members/token')) {
					console.error('Error regenerating room member token');
					await this.navigationService.redirectToErrorPage(NavigationErrorReason.ROOM_ACCESS_REVOKED, true);
					throw originalError;
				}

				throw error;
			})
		);
	}
}
