import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetUserDTO } from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { SessionStorageService } from '../../../shared/services/session-storage.service';
import { TokenStorageService } from '../../../shared/services/token-storage.service';
import { UserService } from '../../users/services/user.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
	const user = { userId: 'alice' } as MeetUserDTO;
	let tokens: { access: string | null; refresh: string | null };
	let getMe: jasmine.Spy;
	let service: AuthService;

	beforeEach(() => {
		tokens = { access: null, refresh: null };
		getMe = jasmine.createSpy('getMe').and.resolveTo(user);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				AuthService,
				{ provide: UserService, useValue: { getMe } },
				{
					provide: TokenStorageService,
					useValue: { getAccessToken: () => tokens.access, getRefreshToken: () => tokens.refresh }
				},
				{ provide: HttpService, useValue: {} },
				{ provide: NavigationService, useValue: {} },
				{ provide: SessionStorageService, useValue: {} }
			]
		});

		service = TestBed.inject(AuthService);
	});

	it('takes a browser that stores no token as anonymous without asking the server', async () => {
		expect(await service.isUserAuthenticated()).toBeFalse();
		expect(getMe).not.toHaveBeenCalled();
	});

	it('asks the server for the user of a stored access token', async () => {
		tokens.access = 'access-token';

		expect(await service.isUserAuthenticated()).toBeTrue();
		expect(getMe).toHaveBeenCalledTimes(1);
	});

	it('asks the server when only a refresh token is stored, so an expired session is renewed', async () => {
		tokens.refresh = 'refresh-token';

		expect(await service.getUserId()).toBe('alice');
		expect(getMe).toHaveBeenCalledTimes(1);
	});

	it('takes a stored token the server refuses as anonymous', async () => {
		tokens.access = 'revoked-token';
		getMe.and.rejectWith(new Error('401'));

		expect(await service.isUserAuthenticated()).toBeFalse();
	});
});
