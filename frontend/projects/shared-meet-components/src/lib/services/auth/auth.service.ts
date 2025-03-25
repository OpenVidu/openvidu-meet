import { Injectable } from '@angular/core';
import { HttpService } from '../http/http.service';
import { Router } from '@angular/router';
import { from, Observable } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { UserRole, User } from '@lib/typings/ce';

@Injectable({
	providedIn: 'root'
})
export class AuthService {
	protected hasCheckAuth = false;
	protected isAuthenticated = false;
	protected user: User | null = null;

	constructor(
		protected httpService: HttpService,
		protected router: Router
	) {}

	async login(username: string, password: string) {
		try {
			await this.httpService.login({ username, password });
			await this.getAuthenticatedUser();
		} catch (err) {
			const error = err as HttpErrorResponse;
			console.error(error.error.message || error.error);
			throw error;
		}
	}

	refreshToken(): Observable<{ message: string }> {
		return from(this.httpService.refreshToken());
	}

	async logout(redirectTo?: string) {
		try {
			await this.httpService.logout();
			this.isAuthenticated = false;
			this.user = null;

			if (redirectTo) {
				this.router.navigate([redirectTo]);
			}
		} catch (error) {
			console.error((error as HttpErrorResponse).error.message);
		}
	}

	async isUserAuthenticated(): Promise<boolean> {
		if (!this.hasCheckAuth) {
			await this.getAuthenticatedUser();
			this.hasCheckAuth = true;
		}
		return this.isAuthenticated;
	}

	getUsername(): string {
		return this.user?.username || '';
	}

	isAdmin(): boolean {
		return this.user?.role === UserRole.ADMIN;
	}

	private async getAuthenticatedUser() {
		try {
			const user = await this.httpService.getProfile();
			this.user = user;
			this.isAuthenticated = true;
		} catch (error) {
			this.user = null;
			this.isAuthenticated = false;
		}
	}
}
