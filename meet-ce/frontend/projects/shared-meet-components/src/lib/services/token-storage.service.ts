import { Injectable } from '@angular/core';

/**
 * Service to manage JWT token storage when using header-based authentication.
 * Tokens are stored in localStorage/sessionStorage when authTransportMode is 'header'.
 */
@Injectable({
	providedIn: 'root'
})
export class TokenStorageService {
	private readonly ACCESS_TOKEN_KEY = 'ovMeet-accessToken';
	private readonly REFRESH_TOKEN_KEY = 'ovMeet-refreshToken';
	private readonly ROOM_MEMBER_TOKEN_KEY = 'ovMeet-roomMemberToken';

	// ACCESS AND REFRESH TOKEN METHODS

	// Saves the access token to localStorage
	setAccessToken(token: string): void {
		localStorage.setItem(this.ACCESS_TOKEN_KEY, token);
	}

	// Retrieves the access token from localStorage
	getAccessToken(): string | null {
		return localStorage.getItem(this.ACCESS_TOKEN_KEY);
	}

	// Saves the refresh token to localStorage
	setRefreshToken(token: string): void {
		localStorage.setItem(this.REFRESH_TOKEN_KEY, token);
	}

	// Retrieves the refresh token from localStorage
	getRefreshToken(): string | null {
		return localStorage.getItem(this.REFRESH_TOKEN_KEY);
	}

	// Clears access and refresh tokens from localStorage
	clearAccessAndRefreshTokens(): void {
		localStorage.removeItem(this.ACCESS_TOKEN_KEY);
		localStorage.removeItem(this.REFRESH_TOKEN_KEY);
	}

	// ROOM MEMBER TOKEN METHODS
	// Uses sessionStorage instead of localStorage to ensure token is not shared across browser tabs

	// Saves the room member token to sessionStorage
	setRoomMemberToken(token: string): void {
		sessionStorage.setItem(this.ROOM_MEMBER_TOKEN_KEY, token);
	}

	// Retrieves the room member token from sessionStorage
	getRoomMemberToken(): string | null {
		return sessionStorage.getItem(this.ROOM_MEMBER_TOKEN_KEY);
	}

	// Removes the room member token from sessionStorage
	clearRoomMemberToken(): void {
		sessionStorage.removeItem(this.ROOM_MEMBER_TOKEN_KEY);
	}
}
