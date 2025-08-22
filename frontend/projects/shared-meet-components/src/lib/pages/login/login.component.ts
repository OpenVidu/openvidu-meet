import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService, NavigationService } from '@lib/services';

@Component({
	selector: 'ov-login',
	standalone: true,
	imports: [
		MatFormFieldModule,
		ReactiveFormsModule,
		MatInputModule,
		MatButtonModule,
		FormsModule,
		MatCardModule,
		MatIconModule,
		MatTooltipModule,
		RouterModule
	],
	templateUrl: './login.component.html',
	styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
	loginForm = new FormGroup({
		username: new FormControl('', [Validators.required]),
		password: new FormControl('', [Validators.required])
	});

	showPassword = false;
	loginErrorMessage: string | undefined;

	redirectTo = ''; // By default, redirect to home page

	constructor(
		private navigationService: NavigationService,
		private route: ActivatedRoute,
		private authService: AuthService
	) {}

	ngOnInit() {
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
			await this.navigationService.redirectTo(this.redirectTo);
		} catch (error) {
			if ((error as HttpErrorResponse).status === 429) {
				this.loginErrorMessage = 'Too many login attempts. Please try again later';
			} else {
				this.loginErrorMessage = 'Invalid username or password';
			}
		}
	}
}
