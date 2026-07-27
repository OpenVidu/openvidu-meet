import { inject, Service } from '@angular/core';
import { TokenStorageKeys } from '../models/storage.model';
import { BrowserStorageService } from './browser-storage.service';

/**
 * Service to manage JWT token storage for authentication.
 *
 * Persists through the shared {@link BrowserStorageService} engine, so it inherits the availability
 * guard for free (no uncaught throw in Safari private mode / storage-blocked browsers).
 */
@Service()
export class TokenStorageService {
	private readonly storage = inject(BrowserStorageService);

	// Saves the access token to localStorage
	setAccessToken(token: string): void {
		this.storage.set(TokenStorageKeys.ACCESS_TOKEN, token);
	}

	// Retrieves the access token from localStorage
	getAccessToken(): string | null {
		return this.storage.get<string>(TokenStorageKeys.ACCESS_TOKEN);
	}

	// Saves the refresh token to localStorage
	setRefreshToken(token: string): void {
		this.storage.set(TokenStorageKeys.REFRESH_TOKEN, token);
	}

	// Retrieves the refresh token from localStorage
	getRefreshToken(): string | null {
		return this.storage.get<string>(TokenStorageKeys.REFRESH_TOKEN);
	}

	// Clears access and refresh tokens from localStorage
	clearAccessAndRefreshTokens(): void {
		this.storage.remove(TokenStorageKeys.ACCESS_TOKEN);
		this.storage.remove(TokenStorageKeys.REFRESH_TOKEN);
	}
}
