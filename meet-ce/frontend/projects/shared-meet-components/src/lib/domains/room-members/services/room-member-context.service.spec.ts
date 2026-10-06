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
const joinToken = (): string => {
	const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const payload = base64UrlEncode(JSON.stringify({ metadata: JSON.stringify({ roomId: 'room1', badge: 'other' }) }));
	return `${header}.${payload}.fake-signature`;
};

describe('RoomMemberContextService', () => {
	let service: RoomMemberContextService;
	let redirectToErrorPage: jasmine.Spy;
	let wait: jasmine.Spy;

	beforeEach(async () => {
		redirectToErrorPage = jasmine.createSpy('redirectToErrorPage').and.resolveTo(undefined);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RoomMemberContextService,
				{
					provide: RoomMemberService,
					useValue: { generateRoomMemberToken: async () => ({ token: joinToken() }) }
				},
				{ provide: NavigationService, useValue: { redirectToErrorPage } },
				{ provide: AuthService, useValue: { isUserAuthenticated: async () => false } },
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: MeetStorageService, useValue: {} }
			]
		});

		service = TestBed.inject(RoomMemberContextService);
		wait = spyOn(service as unknown as TokenUpdateClock, 'wait').and.resolveTo();
		await service.generateToken('room1', { joinMeeting: true });
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
});
