import { inject, Service } from '@angular/core';
import { SessionStorageKeys } from '../models/storage.model';
import { BrowserStorageService } from './browser-storage.service';

/**
 * Service for managing meeting-scoped session storage.
 *
 * Persists through the shared {@link BrowserStorageService} engine, always routing to
 * `sessionStorage`, so it inherits the availability guard for free (no uncaught throw in Safari
 * private mode / storage-blocked browsers — important because this runs inside `auth.guard`).
 */
@Service()
export class SessionStorageService {
	private readonly storage = inject(BrowserStorageService);

	/**
	 * Stores the room secret together with the room it was given for.
	 *
	 * @param roomId The room the secret belongs to.
	 * @param secret The secret to store.
	 */
	public setRoomSecret(roomId: string, secret: string): void {
		this.storage.set(SessionStorageKeys.ROOM_SECRET, { roomId, secret }, 'session');
	}

	/**
	 * Retrieves the room secret stored for a room.
	 *
	 * @param roomId The room being entered.
	 * @returns The secret stored for that room, or null when none was stored for it.
	 */
	public getRoomSecret(roomId: string): string | null {
		const stored = this.storage.get<{ roomId: string; secret: string }>(SessionStorageKeys.ROOM_SECRET, 'session');
		return stored?.roomId === roomId ? stored.secret : null;
	}

	/**
	 * Removes the stored room secret.
	 */
	public removeRoomSecret(): void {
		this.storage.remove(SessionStorageKeys.ROOM_SECRET, 'session');
	}

	/**
	 * Stores a redirect URL to be used after leaving OpenVidu Meet.
	 *
	 * @param redirectUrl The URL to redirect to.
	 */
	public setRedirectUrl(redirectUrl: string): void {
		this.storage.set(SessionStorageKeys.REDIRECT_URL, redirectUrl, 'session');
	}

	/**
	 * Retrieves the redirect URL stored in sessionStorage.
	 *
	 * @returns The redirect URL or null if not found.
	 */
	public getRedirectUrl(): string | null {
		return this.storage.get<string>(SessionStorageKeys.REDIRECT_URL, 'session');
	}

	/**
	 * Removes the stored redirect URL.
	 */
	public removeRedirectUrl(): void {
		this.storage.remove(SessionStorageKeys.REDIRECT_URL, 'session');
	}

	/**
	 * Stores the E2EE key data (key and origin flag) together with the room it was given for.
	 *
	 * @param roomId The room the key belongs to.
	 * @param e2eeKey The E2EE key to store.
	 * @param fromUrl True if the E2EE key came from a URL parameter.
	 */
	public setE2EEData(roomId: string, e2eeKey: string, fromUrl: boolean): void {
		this.storage.set(SessionStorageKeys.E2EE_DATA, { roomId, key: e2eeKey, fromUrl }, 'session');
	}

	/**
	 * Retrieves the E2EE key data (key and origin flag) stored for a room.
	 *
	 * @param roomId The room being entered.
	 * @returns The E2EE data stored for that room, or null when none was stored for it.
	 */
	public getE2EEData(roomId: string): { key: string; fromUrl: boolean } | null {
		const stored = this.storage.get<{ roomId: string; key: string; fromUrl: boolean }>(
			SessionStorageKeys.E2EE_DATA,
			'session'
		);
		return stored?.roomId === roomId ? { key: stored.key, fromUrl: stored.fromUrl } : null;
	}

	/**
	 * Removes the stored E2EE key data.
	 */
	public removeE2EEData(): void {
		this.storage.remove(SessionStorageKeys.E2EE_DATA, 'session');
	}

	/**
	 * Stores whether the authenticated user must change password before accessing the app.
	 *
	 * @param required True when password change is required.
	 */
	public setMustChangePasswordRequired(required: boolean): void {
		this.storage.set(SessionStorageKeys.MUST_CHANGE_PASSWORD, required, 'session');
	}

	/**
	 * Retrieves whether the authenticated user must change password before continuing.
	 *
	 * @returns True if password change is required; otherwise false.
	 */
	public getMustChangePasswordRequired(): boolean {
		return this.storage.get<boolean>(SessionStorageKeys.MUST_CHANGE_PASSWORD, 'session') ?? false;
	}

	/**
	 * Removes the stored mandatory password change flag.
	 */
	public removeMustChangePasswordRequired(): void {
		this.storage.remove(SessionStorageKeys.MUST_CHANGE_PASSWORD, 'session');
	}

	/**
	 * Clears all data related to the meeting,including room secret, redirect URL, and E2EE data.
	 */
	public clearMeetingData(): void {
		this.removeRoomSecret();
		this.removeRedirectUrl();
		this.removeE2EEData();
	}
}
