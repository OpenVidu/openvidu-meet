import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MeetUserDTO, MeetUserRole } from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { TokenStorageService } from '../../../shared/services/token-storage.service';
import { UserService } from '../../users/services/user.service';

@Injectable({
	providedIn: 'root'
})
export class AuthService {
	protected readonly AUTH_API = `${HttpService.INTERNAL_API_PATH_PREFIX}/auth`;

	protected hasCheckAuth = false;
	protected user: MeetUserDTO | null = null;

	constructor(
		protected httpService: HttpService,
		protected userService: UserService,
		protected tokenStorageService: TokenStorageService,
		protected navigationService: NavigationService
	) {}

	/**
	 * Logs in a user with the provided credentials.
	 *
	 * @param userId - The unique identifier of the user
	 * @param password - The user's password
	 * @returns A promise that resolves when the login is successful
	 */
	async login(userId: string, password: string) {
		try {
			const path = `${this.AUTH_API}/login`;
			const body = { userId, password };
			const response = await this.httpService.postRequest<{
				message: string;
				accessToken: string;
				refreshToken?: string;
				mustChangePassword?: boolean;
			}>(path, body);

			// Save tokens in localStorage
			this.tokenStorageService.setAccessToken(response.accessToken);
			if (response.refreshToken) {
				this.tokenStorageService.setRefreshToken(response.refreshToken);
			}

			// TODO: Redirect user to profile page in order to change password on first login if required by backend
			// if (response.mustChangePassword) {
			// 	this.navigationService.redirectToProfilePage();
			// 	return;
			// }

			await this.getAuthenticatedUser(true);
		} catch (err) {
			const error = err as HttpErrorResponse;
			console.error(error.error.message || error.error);
			throw error;
		}
	}

	/**
	 * Refreshes the access token using the refresh token.
	 *
	 * @returns A promise that resolves to the response from the refresh endpoint
	 */
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

	/**
	 * Logs out the currently authenticated user and clears authentication tokens.
	 * Redirects to the login page after logout, optionally with a query parameter to redirect back after login.
	 *
	 * @param redirectToAfterLogin - Optional path to redirect to after login
	 * @returns A promise that resolves when the logout is successful
	 */
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

	/**
	 * Checks if the user is authenticated by attempting to retrieve the authenticated user's information.
	 *
	 * @return A promise that resolves to true if the user is authenticated, false otherwise
	 */
	async isUserAuthenticated(): Promise<boolean> {
		await this.getAuthenticatedUser();
		return !!this.user;
	}

	/**
	 * Retrieves the authenticated user's ID.
	 *
	 * @return A promise that resolves to the user's ID if authenticated, undefined otherwise
	 */
	async getUserId(): Promise<string | undefined> {
		await this.getAuthenticatedUser();
		return this.user?.userId;
	}

	/**
	 * Retrieves the authenticated user's name.
	 *
	 * @return A promise that resolves to the user's name if authenticated, undefined otherwise
	 */
	async getUserName(): Promise<string | undefined> {
		await this.getAuthenticatedUser();
		return this.user?.name;
	}

	/**
	 * Retrieves the authenticated user's role.
	 *
	 * @return A promise that resolves to the user's role if authenticated, undefined otherwise
	 */
	async getUserRole(): Promise<MeetUserRole | undefined> {
		await this.getAuthenticatedUser();
		return this.user?.role;
	}

	/**
	 * Checks if the authenticated user has an admin role.
	 *
	 * @return A promise that resolves to true if the user is an admin, false otherwise
	 */
	async isAdmin(): Promise<boolean> {
		const role = await this.getUserRole();
		return role === MeetUserRole.ADMIN;
	}

	/**
	 * Retrieves the authenticated user's information and caches it in the service.
	 * If the user information is already cached and force is not true, it returns immediately.
	 * If force is true, it will attempt to fetch the user information again from the server.
	 *
	 * @param force - If true, forces a refresh of the user information from the server
	 */
	private async getAuthenticatedUser(force = false) {
		if (force || (!this.user && !this.hasCheckAuth)) {
			try {
				const user = await this.userService.getMe();
				this.user = user;
			} catch (error) {
				this.user = null;
			}

			this.hasCheckAuth = true;
		}
	}
}
