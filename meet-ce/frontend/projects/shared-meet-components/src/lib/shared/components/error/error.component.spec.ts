import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../domains/auth/services/auth.service';
import { LeaveRedirectService } from '../../services/leave-redirect.service';
import { NavigationService } from '../../services/navigation.service';
import { RuntimeConfigService } from '../../services/runtime-config.service';
import { ErrorComponent } from './error.component';

describe('ErrorComponent', () => {
	let embeddedMode: boolean;
	let signedIn: boolean;

	beforeEach(() => {
		embeddedMode = false;
		signedIn = false;

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: ActivatedRoute, useValue: { snapshot: { queryParams: {} } } },
				{ provide: AuthService, useValue: { isUserAuthenticated: async () => signedIn } },
				{ provide: NavigationService, useValue: {} },
				{ provide: LeaveRedirectService, useValue: { getLeaveRedirectURL: () => undefined } },
				{ provide: RuntimeConfigService, useValue: { isEmbeddedMode: () => embeddedMode } }
			]
		});
		TestBed.overrideComponent(ErrorComponent, { set: { template: '', imports: [] } });
	});

	const backButtonAfterInit = async (): Promise<string | null> => {
		const component = TestBed.createComponent(ErrorComponent).componentInstance;
		await component.setBackButtonText();
		return component.showBackButton() ? component.backButtonTextKey() : null;
	};

	describe('the back button', () => {
		it('reads Accept in an iframe without a leave redirect', async () => {
			embeddedMode = true;
			signedIn = true;

			expect(await backButtonAfterInit()).toBe('ERROR.ACCEPT');
		});

		it('goes back to the console of a signed-in user in the standalone app', async () => {
			signedIn = true;

			expect(await backButtonAfterInit()).toBe('ERROR.BACK_TO_CONSOLE');
		});

		it('is absent for an anonymous participant in the standalone app', async () => {
			expect(await backButtonAfterInit()).toBeNull();
		});
	});
});
