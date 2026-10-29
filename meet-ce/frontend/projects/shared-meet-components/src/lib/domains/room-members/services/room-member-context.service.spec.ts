import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { LoggerService } from '../../../shared/services/logger.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { MeetStorageService } from '../../../shared/services/storage.service';
import { AuthService } from '../../auth/services/auth.service';
import { RoomMemberContextService } from './room-member-context.service';
import { RoomMemberService } from './room-member.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, i: () => {}, w: () => {}, e: () => {} };
	}
}

/** Reaches the delay between attempts, so the retries run without waiting for it. */
interface TokenUpdateClock {
	wait(delayMs: number): Promise<void>;
}

const base64UrlEncode = (value: string): string =>
	btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** An unsigned room member token, as the server issues it before the participant joins. */
const joinToken = (badge = 'other'): string => {
	const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const payload = base64UrlEncode(JSON.stringify({ metadata: JSON.stringify({ roomId: 'room1', badge }) }));
	return `${header}.${payload}.fake-signature`;
};

describe('RoomMemberContextService', () => {
	let service: RoomMemberContextService;
	let redirectToErrorPage: jasmine.Spy;
	let wait: jasmine.Spy;
	let generateRoomMemberToken: jasmine.Spy;
	let refreshRoomMemberToken: jasmine.Spy;

	beforeEach(async () => {
		redirectToErrorPage = jasmine.createSpy('redirectToErrorPage').and.resolveTo(undefined);
		generateRoomMemberToken = jasmine.createSpy('generateRoomMemberToken').and.resolveTo({ token: joinToken() });
		refreshRoomMemberToken = jasmine.createSpy('refreshRoomMemberToken');

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RoomMemberContextService,
				{ provide: RoomMemberService, useValue: { generateRoomMemberToken, refreshRoomMemberToken } },
				{ provide: NavigationService, useValue: { redirectToErrorPage } },
				{ provide: AuthService, useValue: { isUserAuthenticated: async () => false } },
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: MeetStorageService, useValue: {} }
			]
		});

		service = TestBed.inject(RoomMemberContextService);
		wait = spyOn(service as unknown as TokenUpdateClock, 'wait').and.resolveTo();
		await service.generateToken('room1', { secret: 'speaker-secret', joinMeeting: true });
	});

	/**
	 * A participant whose token cannot be replaced is still in the meeting, whose media LiveKit carries
	 * on its own: only the server answering that the member lost access takes them out of it.
	 */
	describe('token update in a meeting', () => {
		const failingWith = (status: number, failures = Infinity) => {
			let left = failures;
			return jasmine.createSpy('update').and.callFake(async () => {
				if (left-- > 0) throw new HttpErrorResponse({ status });

				return 'new-token';
			});
		};

		for (const status of [0, 409, 503]) {
			it(`retries an update that failed with ${status}, waiting longer each time`, async () => {
				const update = failingWith(status, 2);

				const updated = await service.updateTokenInMeeting(update);

				expect(updated).toBeTrue();
				expect(update).toHaveBeenCalledTimes(3);
				expect(wait.calls.allArgs()).toEqual([[1000], [2000]]);
				expect(redirectToErrorPage).not.toHaveBeenCalled();
			});
		}

		it('keeps the participant in the meeting when the refresh fails for a network error', async () => {
			const update = failingWith(0);

			const updated = await service.updateTokenInMeeting(update);

			expect(updated).toBeFalse();
			expect(update).toHaveBeenCalledTimes(6);
			expect(redirectToErrorPage).not.toHaveBeenCalled();
		});

		for (const status of [401, 403, 404]) {
			it(`sends the participant to the error page when the server answers ${status}`, async () => {
				const update = failingWith(status);

				const updated = await service.updateTokenInMeeting(update);

				expect(updated).toBeFalse();
				expect(update).toHaveBeenCalledTimes(1);
				expect(redirectToErrorPage).toHaveBeenCalledOnceWith(NavigationErrorReason.ROOM_ACCESS_REVOKED, true);
			});
		}

		it('stops retrying once the participant has left the meeting', async () => {
			const update = failingWith(0);
			wait.and.callFake(async () => service.clearContext());

			const updated = await service.updateTokenInMeeting(update);

			expect(updated).toBeFalse();
			expect(update).toHaveBeenCalledTimes(1);
		});
	});

	/**
	 * The server refuses to refresh a token that a later change invalidated, such as a permissions change whose
	 * notice this participant missed. The meeting then asks for a new token with the credentials it joined with,
	 * and only a refusal of that request means the participant lost access.
	 */
	describe('refresh of a token a later change invalidated', () => {
		const refusedWith = (status: number) => Promise.reject(new HttpErrorResponse({ status }));

		it('regenerates the token with the credentials the participant joined with', async () => {
			const regeneratedToken = joinToken('moderator');
			refreshRoomMemberToken.and.returnValue(refusedWith(401));
			generateRoomMemberToken.and.resolveTo({ token: regeneratedToken });

			const updated = await service.updateTokenInMeeting(() => service.refreshToken('room1'));

			expect(updated).toBeTrue();
			expect(generateRoomMemberToken).toHaveBeenCalledWith(
				'room1',
				{ secret: 'speaker-secret', joinMeeting: true },
				undefined
			);
			expect(service.roomMemberToken()).toBe(regeneratedToken);
			expect(redirectToErrorPage).not.toHaveBeenCalled();
		});

		it('sends the participant to the error page when the regeneration is refused too', async () => {
			refreshRoomMemberToken.and.returnValue(refusedWith(401));
			generateRoomMemberToken.and.returnValue(refusedWith(403));

			const updated = await service.updateTokenInMeeting(() => service.refreshToken('room1'));

			expect(updated).toBeFalse();
			expect(redirectToErrorPage).toHaveBeenCalledOnceWith(NavigationErrorReason.ROOM_ACCESS_REVOKED, true);
		});

		it('sends the participant to the error page without regenerating when they left the meeting', async () => {
			generateRoomMemberToken.calls.reset();
			refreshRoomMemberToken.and.returnValue(refusedWith(404));

			const updated = await service.updateTokenInMeeting(() => service.refreshToken('room1'));

			expect(updated).toBeFalse();
			expect(generateRoomMemberToken).not.toHaveBeenCalled();
			expect(redirectToErrorPage).toHaveBeenCalledOnceWith(NavigationErrorReason.ROOM_ACCESS_REVOKED, true);
		});
	});
});
