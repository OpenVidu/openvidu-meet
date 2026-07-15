import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { AssetsService } from '../../../../shared/services/assets.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { AuthService } from '../../services/auth.service';

@Component({
	selector: 'ov-login',
	imports: [
		MatFormFieldModule,
		ReactiveFormsModule,
		MatInputModule,
		MatButtonModule,
		MatCardModule,
		MatIconModule,
		MatTooltipModule,
		RouterModule,
		TranslatePipe
	],
	templateUrl: './login.component.html',
	styleUrl: './login.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent implements OnInit {
	private navigationService = inject(NavigationService);
	private route = inject(ActivatedRoute);
	private authService = inject(AuthService);
	private readonly assets = inject(AssetsService);
	private readonly translateService = inject(TranslateService);

	/** OpenVidu Meet brand logo (resolves in SPA & webcomponent modes). */
	protected readonly logoUrl = this.assets.meetLogo;

	loginForm = new FormGroup({
		userId: new FormControl('', [Validators.required]),
		password: new FormControl('', [Validators.required])
	});

	showPassword = signal(false);
	loginErrorMessage = signal<string | undefined>(undefined);

	/**
	 * Where to navigate after a successful login. Bound directly when rendered outside the
	 * Angular Router (the webcomponent shell, which has no route query params); the SPA leaves
	 * it empty and reads `redirectTo` from the route query params instead.
	 */
	readonly redirectToInput = input<string>('', { alias: 'redirectTo' });

	redirectTo = signal(''); // By default, redirect to home page

	ngOnInit() {
		// Webcomponent: the input carries the destination. SPA: fall back to the route query param.
		const fromInput = this.redirectToInput();
		if (fromInput) {
			this.redirectTo.set(fromInput);
		}

		this.route.queryParams.subscribe((params) => {
			if (params['redirectTo']) {
				this.redirectTo.set(params['redirectTo']);
			}
		});
	}

	async login() {
		this.loginErrorMessage.set(undefined);
		const { userId, password } = this.loginForm.value;

		try {
			const { mustChangePassword } = await this.authService.login(userId!, password!);

			// Redirect to dedicated mandatory password page after first login or password reset
			if (mustChangePassword) {
				await this.navigationService.redirectToChangePasswordPage(this.redirectTo(), true);
				return;
			}

			await this.navigationService.redirectTo(this.redirectTo());
		} catch (error) {
			if ((error as HttpErrorResponse).status === 429) {
				this.loginErrorMessage.set(this.translateService.translate('AUTH.LOGIN.ERROR_TOO_MANY_ATTEMPTS'));
			} else {
				this.loginErrorMessage.set(this.translateService.translate('AUTH.LOGIN.ERROR_INVALID_CREDENTIALS'));
			}
		}
	}
}
