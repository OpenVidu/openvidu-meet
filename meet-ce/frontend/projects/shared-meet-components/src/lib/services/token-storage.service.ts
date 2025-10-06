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
	private readonly PARTICIPANT_TOKEN_KEY = 'ovMeet-participantToken';
	private readonly RECORDING_TOKEN_KEY = 'ovMeet-recordingToken';

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

	// PARTICIPANT AND RECORDING TOKEN METHODS
	// Uses sessionStorage instead of localStorage to ensure tokens are not shared across browser tabs

	// Saves the participant token to sessionStorage
	setParticipantToken(token: string): void {
		sessionStorage.setItem(this.PARTICIPANT_TOKEN_KEY, token);
	}

	// Retrieves the participant token from sessionStorage
	getParticipantToken(): string | null {
		return sessionStorage.getItem(this.PARTICIPANT_TOKEN_KEY);
	}

	// Removes the participant token from sessionStorage
	clearParticipantToken(): void {
		sessionStorage.removeItem(this.PARTICIPANT_TOKEN_KEY);
	}

	// Saves the recording token to sessionStorage
	setRecordingToken(token: string): void {
		sessionStorage.setItem(this.RECORDING_TOKEN_KEY, token);
	}

	// Retrieves the recording token from sessionStorage
	getRecordingToken(): string | null {
		return sessionStorage.getItem(this.RECORDING_TOKEN_KEY);
	}

	// Removes the recording token from sessionStorage
	clearRecordingToken(): void {
		sessionStorage.removeItem(this.RECORDING_TOKEN_KEY);
	}
}
