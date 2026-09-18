import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LeaveRedirectService } from '../../services/leave-redirect.service';
import { NavigationService } from '../../services/navigation.service';
import { RuntimeConfigService } from '../../services/runtime-config.service';
import { describeNavigationError } from '../../utils/navigation-error.util';
import { AuthService } from '../../../domains/auth/services/auth.service';

@Component({
	selector: 'ov-error',
	imports: [MatCardModule, MatIconModule, MatButtonModule, TranslatePipe],
	templateUrl: './error.component.html',
	styleUrl: './error.component.scss'
})
export class ErrorComponent implements OnInit {
	private route = inject(ActivatedRoute);
	protected authService = inject(AuthService);
	protected navService = inject(NavigationService);
	protected leaveRedirect = inject(LeaveRedirectService);
	protected runtimeConfigService = inject(RuntimeConfigService);

	/**
	 * Optional error reason. When set it takes precedence over the `reason` route query param, so the
	 * component can be embedded directly (e.g. the web component shell, which has no `/error` route)
	 * the same way it works as the SPA's routed `/error` page.
	 */
	readonly reason = input<string>('');

	// Effective reason: explicit input wins, otherwise the SPA route's `?reason=` query param.
	private readonly effectiveReason = computed(() => this.reason() || this.route.snapshot.queryParams['reason'] || '');
	private readonly description = computed(() =>
		this.effectiveReason() ? describeNavigationError(this.effectiveReason()) : null
	);

	// Translation KEYS resolved by the `translate` pipe in the template, so the copy reacts to a live
	// language switch / lazily-loaded locale (resolving imperatively would freeze it to the English
	// fallback for non-English users).
	readonly errorTitleKey = computed(() => this.description()?.titleKey ?? 'ERROR.DEFAULT_TITLE');
	readonly errorMessageKey = computed(() => this.description()?.messageKey ?? '');

	showBackButton = signal(true);
	backButtonTextKey = signal('ERROR.BACK');

	ngOnInit() {
		this.setBackButtonText();
	}

	/**
	 * Shows the back button only where it leads somewhere, and names it after where it leads.
	 *
	 * A leave-redirect URL takes the caller out of the error screen in every mode. Without one, the
	 * web component tells its host to tear the embed down and the SPA navigates to the console, but
	 * an iframe can do neither: it has no host listening this early and no internal route to fall
	 * back to, so the button would do nothing at all.
	 */
	async setBackButtonText() {
		const redirection = this.leaveRedirect.getLeaveRedirectURL();
		const isSpa = !this.runtimeConfigService.isEmbeddedMode();
		const goesToConsole = isSpa && !redirection && (await this.authService.isUserAuthenticated());

		this.showBackButton.set(!!redirection || this.runtimeConfigService.isWebcomponentMode() || goesToConsole);
		this.backButtonTextKey.set(goesToConsole ? 'ERROR.BACK_TO_CONSOLE' : 'ERROR.ACCEPT');
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
