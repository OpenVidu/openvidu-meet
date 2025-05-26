import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterModule } from '@angular/router';
import { UserRole } from 'shared-meet-components';
import { AuthService } from '../../../services';

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
		RouterModule
	],
	templateUrl: './login.component.html',
	styleUrl: './login.component.scss'
})
export class ConsoleLoginComponent {
	loginForm = new FormGroup({
		username: new FormControl('', [Validators.required, Validators.minLength(4)]),
		password: new FormControl('', [Validators.required, Validators.minLength(4)])
	});
	loginErrorMessage: string | undefined;
	invalidRole = false;

	constructor(
		private authService: AuthService,
		private router: Router
	) {}

	ngOnInit(): void {}

	async onSubmit() {
		this.loginErrorMessage = undefined;
		const { username, password } = this.loginForm.value;

		try {
			await this.authService.login(username!, password!);

			// Check if the user has the expected role
			const role = await this.authService.getUserRole();
			if (role !== UserRole.ADMIN) {
				await this.authService.logout();
				this.invalidRole = true;
				this.loginErrorMessage =
					'You have been authenticated as a user with insufficient permissions. Please log in with an admin account or';
				return;
			}

			this.router.navigate(['console']);
		} catch (error) {
			if ((error as HttpErrorResponse).status === 429) {
				this.loginErrorMessage = 'Too many login attempts. Please try again later';
			} else {
				this.loginErrorMessage = 'Invalid username or password';
			}
		}
	}
}
