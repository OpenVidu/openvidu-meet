import { HttpErrorResponse, HttpEvent, HttpRequest, HttpResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { HttpErrorContext } from '../../../shared/services/http-error-notifier.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { TokenStorageService } from '../../../shared/services/token-storage.service';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';
import { RoomMemberContextService } from '../services/room-member-context.service';
import { RoomMemberInterceptorErrorHandlerService } from './room-member-error-handler.service';
import { RoomMemberHeaderProviderService } from './room-member-header-provider.service';

/**
 * A demotion revokes the room member tokens a participant holds, so a request of theirs can be
 * refused even while they are in the meeting. Only the server refusing them a new token takes them out.
 */
describe('RoomMemberInterceptorErrorHandlerService', () => {
	let handler: RoomMemberInterceptorErrorHandlerService;
	let generateToken: jasmine.Spy;
	let redirectToErrorPage: jasmine.Spy;
	let accessToken: string | null;

	const request = new HttpRequest('GET', '/api/v1/rooms/room1');
	const revoked = new HttpErrorResponse({ status: 401, url: request.url });

	const context = (retry: Observable<HttpEvent<unknown>>): HttpErrorContext => ({
		error: revoked,
		request,
		pageUrl: '/room/room1',
		next: () => retry
	});

	const outcome = (retry: Observable<HttpEvent<unknown>>) =>
		firstValueFrom(handler.handle(context(retry))).catch((error: unknown) => error);

	beforeEach(() => {
		generateToken = jasmine.createSpy('generateToken').and.resolveTo('new-token');
		redirectToErrorPage = jasmine.createSpy('redirectToErrorPage').and.resolveTo(undefined);
		accessToken = null;

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RoomMemberInterceptorErrorHandlerService,
				{ provide: RoomMemberContextService, useValue: { generateToken } },
				{
					provide: MeetingContextService,
					useValue: { roomId: () => 'room1', roomSecret: () => 'secret', isActiveMeeting: () => true }
				},
				{ provide: RoomMemberHeaderProviderService, useValue: { provideHeaders: () => null } },
				{ provide: NavigationService, useValue: { redirectToErrorPage } },
				{ provide: TokenStorageService, useValue: { getAccessToken: () => accessToken } }
			]
		});

		handler = TestBed.inject(RoomMemberInterceptorErrorHandlerService);
	});

	it('retries the request with a regenerated token', async () => {
		const response = await outcome(of(new HttpResponse({ status: 200 })));

		expect((response as HttpResponse<unknown>).status).toBe(200);
		expect(generateToken).toHaveBeenCalledOnceWith('room1', { secret: 'secret', joinMeeting: true });
	});

	// A later demotion can revoke the regenerated token before the retry reaches the server.
	it('fails the request of a participant without an account when the retry is refused too', async () => {
		const error = await outcome(throwError(() => revoked));

		expect(error).toBe(revoked);
		expect(redirectToErrorPage).not.toHaveBeenCalled();
	});

	it('lets the sign-in recovery handle a refused retry of a signed-in user', async () => {
		accessToken = 'access-token';

		const error = await outcome(throwError(() => revoked));

		expect(error).toEqual(jasmine.objectContaining({ continueWithNextHandler: true }));
	});

	for (const status of [0, 409, 503]) {
		it(`keeps the participant in the meeting when the token cannot be regenerated (${status})`, async () => {
			generateToken.and.rejectWith(new HttpErrorResponse({ status, url: '/rooms/room1/members/token' }));

			const error = await outcome(of(new HttpResponse({ status: 200 })));

			expect(error).toBe(revoked);
			expect(redirectToErrorPage).not.toHaveBeenCalled();
		});
	}

	for (const status of [403, 404]) {
		it(`sends the participant to the error page when the server refuses a new token (${status})`, async () => {
			generateToken.and.rejectWith(new HttpErrorResponse({ status, url: '/rooms/room1/members/token' }));

			await outcome(of(new HttpResponse({ status: 200 })));

			expect(redirectToErrorPage).toHaveBeenCalledOnceWith(NavigationErrorReason.ROOM_ACCESS_REVOKED, true);
		});
	}
});
