import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { HttpService, NavigationService } from '@lib/services';
import { MeetApiKey, User, UserRole } from '@lib/typings/ce';
import { from, Observable } from 'rxjs';

@Injectable({
	providedIn: 'root'
})
export class AuthService {
	protected readonly AUTH_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/auth`;
	protected readonly USERS_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/users`;

	protected hasCheckAuth = false;
	protected user: User | null = null;

	constructor(
		protected httpService: HttpService,
		protected navigationService: NavigationService
	) {}

	async login(username: string, password: string) {
		try {
			const path = `${this.AUTH_API}/login`;
			const body = { username, password };
			await this.httpService.postRequest(path, body);
			await this.getAuthenticatedUser(true);
		} catch (err) {
			const error = err as HttpErrorResponse;
			console.error(error.error.message || error.error);
			throw error;
		}
	}

	refreshToken(): Observable<any> {
		const path = `${this.AUTH_API}/refresh`;
		const response = this.httpService.postRequest(path);
		return from(response);
	}

	async logout(redirectToAfterLogin?: string) {
		try {
			const path = `${this.AUTH_API}/logout`;
			await this.httpService.postRequest(path);
			this.user = null;

			// Redirect to login page with a query parameter if provided
			// to redirect to the original page after login
			this.navigationService.redirectToLoginPage(redirectToAfterLogin, true);
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

	async isAdmin(): Promise<boolean> {
		const roles = await this.getUserRoles();
		return roles ? roles.includes(UserRole.ADMIN) : false;
	}

	private async getAuthenticatedUser(force = false) {
		if (force || (!this.user && !this.hasCheckAuth)) {
			try {
				const path = `${this.USERS_API}/profile`;
				const user = await this.httpService.getRequest<User>(path);
				this.user = user;
			} catch (error) {
				this.user = null;
			}

			this.hasCheckAuth = true;
		}
	}

	async changePassword(newPassword: string): Promise<any> {
		const path = `${this.USERS_API}/change-password`;
		return this.httpService.postRequest(path, { newPassword });
	}

	async generateApiKey(): Promise<MeetApiKey> {
		const path = `${this.AUTH_API}/api-keys`;
		return this.httpService.postRequest<MeetApiKey>(path);
	}

	async getApiKeys(): Promise<MeetApiKey[]> {
		const path = `${this.AUTH_API}/api-keys`;
		return this.httpService.getRequest<MeetApiKey[]>(path);
	}

	async deleteApiKeys(): Promise<any> {
		const path = `${this.AUTH_API}/api-keys`;
		return this.httpService.deleteRequest(path);
	}
}
