import { NgClass } from '@angular/common';
import { Component } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatToolbar } from '@angular/material/toolbar';
import { MatTooltip } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { ContextService, AuthService } from '../../services/index';
import { HttpErrorResponse } from '@angular/common/http';

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

	constructor(
		private router: Router,
		private authService: AuthService,
		private contextService: ContextService
	) {}

	async ngOnInit() {
		this.version = this.contextService.getVersion();
		this.openviduLogoUrl = this.contextService.getOpenViduLogoUrl();
		this.backgroundImageUrl = this.contextService.getBackgroundImageUrl();
	}

	async login() {
		this.loginErrorMessage = undefined;
		const { username, password } = this.loginForm.value;

		try {
			// TODO: Replace with user login
			await this.authService.adminLogin(username!, password!);
			this.router.navigate(['']);
		} catch (error) {
			if ((error as HttpErrorResponse).status === 429) {
				this.loginErrorMessage = 'Too many login attempts. Please try again later';
			} else {
				this.loginErrorMessage = 'Invalid username or password';
			}
		}
	}
}
