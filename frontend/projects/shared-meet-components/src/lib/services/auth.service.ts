import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { HttpService, NavigationService, TokenStorageService } from '@lib/services';
import { MeetApiKey, User, UserRole } from '@openvidu-meet/typings';
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
		protected tokenStorageService: TokenStorageService,
		protected navigationService: NavigationService
	) {}

	async login(username: string, password: string) {
		try {
			const path = `${this.AUTH_API}/login`;
			const body = { username, password };
			const response = await this.httpService.postRequest<any>(path, body);

			// Check if we got tokens in the response (header mode)
			if (response.accessToken && response.refreshToken) {
				this.tokenStorageService.setAccessToken(response.accessToken);
				this.tokenStorageService.setRefreshToken(response.refreshToken);
			}

			await this.getAuthenticatedUser(true);
		} catch (err) {
			const error = err as HttpErrorResponse;
			console.error(error.error.message || error.error);
			throw error;
		}
	}

	async refreshToken() {
		const path = `${this.AUTH_API}/refresh`;
		const refreshToken = this.tokenStorageService.getRefreshToken();

		// Add refresh token header if in header mode
		let headers: Record<string, string> | undefined;
		if (refreshToken) {
			headers = {};
			headers['x-refresh-token'] = `Bearer ${refreshToken}`;
		}

		const response = await this.httpService.postRequest<any>(path, {}, headers);

		// Update access token in localStorage if returned in response
		if (response.accessToken) {
			this.tokenStorageService.setAccessToken(response.accessToken);
		}

		return response;
	}

	async logout(redirectToAfterLogin?: string) {
		try {
			const path = `${this.AUTH_API}/logout`;
			await this.httpService.postRequest(path);
			this.user = null;

			// Clear tokens from localStorage if in header mode
			this.tokenStorageService.clearAccessAndRefreshTokens();

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

	async changePassword(currentPassword: string, newPassword: string): Promise<any> {
		const path = `${this.USERS_API}/change-password`;
		return this.httpService.postRequest(path, { currentPassword, newPassword });
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
