import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { NavigationService } from '../../services/navigation.service';
import { RuntimeConfigService } from '../../services/runtime-config.service';
import { describeNavigationError } from '../../utils/navigation-error.util';
import { AuthService } from '../../../domains/auth/services/auth.service';

@Component({
	selector: 'ov-error',
	imports: [MatCardModule, MatIconModule, MatButtonModule, TranslatePipe],
	templateUrl: './error.component.html',
	styleUrl: './error.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorComponent implements OnInit {
	private route = inject(ActivatedRoute);
	protected authService = inject(AuthService);
	protected navService = inject(NavigationService);
	protected runtimeConfigService = inject(RuntimeConfigService);

	// Signals hold translation KEYS resolved by the `translate` pipe in the template, so the copy
	// reacts to a live language switch / lazily-loaded locale (resolving imperatively here would
	// freeze it to the English fallback for non-English users).
	errorTitleKey = signal('ERROR.DEFAULT_TITLE');
	errorMessageKey = signal('');

	showBackButton = signal(true);
	backButtonTextKey = signal('ERROR.BACK');

	ngOnInit() {
		this.setErrorReason();
		this.setBackButtonText();
	}

	/**
	 * Retrieves the error reason from URL query parameters
	 */
	private setErrorReason() {
		const reason = this.route.snapshot.queryParams['reason'];
		if (reason) {
			const { titleKey, messageKey } = describeNavigationError(reason);
			this.errorTitleKey.set(titleKey);
			this.errorMessageKey.set(messageKey);
		}
	}

	/**
	 * Sets the back button text based on the application mode and user authentication
	 */
	async setBackButtonText() {
		const isStandaloneMode = !this.runtimeConfigService.isWebcomponentMode();
		const redirection = this.navService.getLeaveRedirectURL();
		const isAuthenticated = await this.authService.isUserAuthenticated();

		// If in standalone mode without redirection and user is not authenticated,
		// hide back button (user has no where to go back to)
		if (isStandaloneMode && !redirection && !isAuthenticated) {
			this.showBackButton.set(false);
			return;
		}

		this.showBackButton.set(true);
		this.backButtonTextKey.set(
			isStandaloneMode && !redirection && isAuthenticated ? 'ERROR.BACK_TO_CONSOLE' : 'ERROR.ACCEPT'
		);
	}

	/**
	 * Back-button handler. Defers WC-vs-SPA branching to
	 * {@link NavigationService.goBackFromMeeting} (which falls back to the
	 * console route in SPA mode).
	 */
	async goBack() {
		await this.navService.goBackFromMeeting('/', true);
	}
}
