import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
import { describeNavigationError } from '../../../../shared/utils/navigation-error.util';
import { AuthService } from '../../../auth/services/auth.service';

@Component({
	selector: 'ov-error',
	imports: [MatCardModule, MatIconModule, MatButtonModule],
	templateUrl: './error.component.html',
	styleUrl: './error.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorComponent implements OnInit {
	private route = inject(ActivatedRoute);
	protected authService = inject(AuthService);
	protected navService = inject(NavigationService);
	protected runtimeConfigService = inject(RuntimeConfigService);

	errorName = signal('Error');
	message = signal('');

	showBackButton = signal(true);
	backButtonText = signal('Back');

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
			const { title, message } = describeNavigationError(reason);
			this.errorName.set(title);
			this.message.set(message);
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
		this.backButtonText.set(isStandaloneMode && !redirection && isAuthenticated ? 'Back to Console' : 'Accept');
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
