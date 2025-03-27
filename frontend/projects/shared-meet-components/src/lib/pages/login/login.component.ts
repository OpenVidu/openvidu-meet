import { NgClass } from '@angular/common';
import { Component } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatToolbar } from '@angular/material/toolbar';
import { MatTooltip } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { ContextService, AuthService } from '../../services/index';
import { HttpErrorResponse } from '@angular/common/http';
import { UserRole } from 'shared-meet-components';

@Component({
	selector: 'app-login',
	standalone: true,
	imports: [MatToolbar, MatTooltip, MatIcon, FormsModule, ReactiveFormsModule, NgClass, MatButton],
	templateUrl: './login.component.html',
	styleUrl: './login.component.scss'
})
export class LoginComponent {
	version = '';
	openviduLogoUrl = '';
	backgroundImageUrl = '';

	loginForm = new FormGroup({
		username: new FormControl('', [Validators.required, Validators.minLength(4)]),
		password: new FormControl('', [Validators.required, Validators.minLength(4)])
	});
	loginErrorMessage: string | undefined;
	redirectTo = ''; // By default, redirect to RoomCreatorComponent

	constructor(
		private router: Router,
		private route: ActivatedRoute,
		private authService: AuthService,
		private contextService: ContextService
	) {}

	async ngOnInit() {
		this.version = this.contextService.getVersion();
		this.openviduLogoUrl = this.contextService.getOpenViduLogoUrl();
		this.backgroundImageUrl = this.contextService.getBackgroundImageUrl();

		this.route.queryParams.subscribe((params) => {
			if (params['redirectTo']) {
				this.redirectTo = params['redirectTo'];
			}
		});
	}

	async login() {
		this.loginErrorMessage = undefined;
		const { username, password } = this.loginForm.value;

		try {
			await this.authService.login(username!, password!);

			// Check if the user has the expected role
			const role = await this.authService.getUserRole();
			if (role !== UserRole.USER) {
				this.authService.logout();
				this.loginErrorMessage = 'Invalid username or password';
				return;
			}

			this.router.navigate([this.redirectTo]);
		} catch (error) {
			if ((error as HttpErrorResponse).status === 429) {
				this.loginErrorMessage = 'Too many login attempts. Please try again later';
			} else {
				this.loginErrorMessage = 'Invalid username or password';
			}
		}
	}
}
