import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { from, Observable } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { UserRole, User } from '../../typings/ce';
import { HttpService } from '../../services';

@Injectable({
	providedIn: 'root'
})
export class AuthService {
	protected hasCheckAuth = false;
	protected user: User | null = null;

	constructor(
		protected httpService: HttpService,
		protected router: Router
	) {}

	async login(username: string, password: string) {
		try {
			await this.httpService.login({ username, password });
			await this.getAuthenticatedUser(true);
		} catch (err) {
			const error = err as HttpErrorResponse;
			console.error(error.error.message || error.error);
			throw error;
		}
	}

	refreshToken(): Observable<{ message: string }> {
		return from(this.httpService.refreshToken());
	}

	async logout(redirectToAfterLogin?: string) {
		try {
			await this.httpService.logout();
			this.user = null;

			// Redirect to login page with a query parameter if provided
			// to redirect to the original page after login
			const queryParams = redirectToAfterLogin
				? { queryParams: { redirectTo: redirectToAfterLogin } }
				: undefined;
			this.router.navigate(['login'], queryParams);
		} catch (error) {
			console.error((error as HttpErrorResponse).error.message);
		}
	}

	async isUserAuthenticated(): Promise<boolean> {
		await this.getAuthenticatedUser();
		return !!this.user;
	}

	async getUsername(): Promise<string | undefined> {
		await this.getAuthenticatedUser();
		return this.user?.username;
	}

	async getUserRoles(): Promise<UserRole[] | undefined> {
		await this.getAuthenticatedUser();
		return this.user?.roles;
	}

	private async getAuthenticatedUser(force = false) {
		if (force || (!this.user && !this.hasCheckAuth)) {
			try {
				const user = await this.httpService.getProfile();
				this.user = user;
			} catch (error) {
				this.user = null;
			}

			this.hasCheckAuth = true;
		}
	}
}
