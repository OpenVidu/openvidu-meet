import { HttpErrorResponse, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HttpErrorContext, HttpErrorNotifierService } from '../../../shared/services/http-error-notifier.service';
import { TokenStorageService } from '../../../shared/services/token-storage.service';
import { AuthService } from '../services/auth.service';
import { AuthHeaderProviderService } from './auth-header-provider.service';
import { AuthInterceptorErrorHandlerService } from './auth-error-handler.service';

describe('AuthInterceptorErrorHandlerService', () => {
	let handler: AuthInterceptorErrorHandlerService;
	let authService: jasmine.SpyObj<AuthService>;

	const expired = new HttpErrorResponse({ status: 401, url: '/meet/api/v1/rooms' });

	const failedRefresh = (status: number) =>
		authService.refreshToken.and.rejectWith(
			new HttpErrorResponse({ status, url: '/meet/internal-api/v1/auth/refresh' })
		);

	const context = (): HttpErrorContext => ({
		error: expired,
		request: new HttpRequest('GET', '/meet/api/v1/rooms'),
		pageUrl: '/rooms',
		next: (() => {
			throw new Error('the request must not be retried');
		}) as unknown as HttpHandlerFn
	});

	beforeEach(() => {
		authService = jasmine.createSpyObj<AuthService>('AuthService', ['refreshToken', 'logout']);
		authService.logout.and.resolveTo();

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: AuthService, useValue: authService },
				{ provide: TokenStorageService, useValue: { getRefreshToken: () => 'refresh-token' } },
				{ provide: HttpErrorNotifierService, useValue: { register: () => {} } },
				{ provide: AuthHeaderProviderService, useValue: { provideHeaders: () => undefined } }
			]
		});

		handler = TestBed.inject(AuthInterceptorErrorHandlerService);
	});

	it('logs the user out when the refresh token is refused', async () => {
		failedRefresh(401);

		await expectAsync(firstValueFrom(handler.handle(context()))).toBeRejectedWith(expired);

		expect(authService.logout).toHaveBeenCalledOnceWith('/rooms');
	});

	it('keeps the session when the server is unavailable to refresh it', async () => {
		failedRefresh(503);

		await expectAsync(firstValueFrom(handler.handle(context()))).toBeRejectedWith(expired);

		expect(authService.logout).not.toHaveBeenCalled();
	});
});
