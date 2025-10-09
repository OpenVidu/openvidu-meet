import { Injectable } from '@angular/core';

@Injectable({
	providedIn: 'root'
})
/**
 * Service for managing session storage operations.
 * Provides methods to store, retrieve, and remove data from sessionStorage.
 */
export class SessionStorageService {
	private readonly ROOM_SECRET_KEY = 'ovMeet-roomSecret';
	private readonly REDIRECT_URL_KEY = 'ovMeet-redirectUrl';

	/**
	 * Stores the room secret.
	 *
	 * @param secret The secret to store.
	 */
	public setRoomSecret(secret: string): void {
		this.set(this.ROOM_SECRET_KEY, secret);
	}

	/**
	 * Retrieves the room secret.
	 *
	 * @returns The stored secret or null if not found.
	 */
	public getRoomSecret(): string | null {
		return this.get<string>(this.ROOM_SECRET_KEY);
	}

	/**
	 * Removes the room secret.
	 */
	public removeRoomSecret(): void {
		this.remove(this.ROOM_SECRET_KEY);
	}

	/**
	 * Stores a redirect URL to be used after leaving OpenVidu Meet.
	 *
	 * @param redirectUrl The URL to redirect to.
	 */
	public setRedirectUrl(redirectUrl: string): void {
		this.set(this.REDIRECT_URL_KEY, redirectUrl);
	}

	/**
	 * Retrieves the redirect URL stored in sessionStorage.
	 *
	 * @returns The redirect URL or null if not found.
	 */
	public getRedirectUrl(): string | null {
		return this.get<string>(this.REDIRECT_URL_KEY);
	}

	/**
	 * Clears all data stored in sessionStorage.
	 */
	public clear(): void {
		sessionStorage.clear();
	}

	/**
	 * Stores a value in sessionStorage.
	 * The value is converted to a JSON string before saving.
	 *
	 * @param key The key under which the value will be stored.
	 * @param value The value to be stored (any type).
	 */
	protected set(key: string, value: any): void {
		const jsonValue = JSON.stringify(value);
		sessionStorage.setItem(key, jsonValue);
	}

	/**
	 * Retrieves a value from sessionStorage.
	 * The value is parsed from JSON back to its original type.
	 *
	 * @param key The key of the item to retrieve.
	 * @returns The stored value or null if the key does not exist.
	 */
	protected get<T>(key: string): T | null {
		const jsonValue = sessionStorage.getItem(key);
		return jsonValue ? (JSON.parse(jsonValue) as T) : null;
	}

	/**
	 * Removes a specific item from sessionStorage.
	 *
	 * @param key The key of the item to remove.
	 */
	protected remove(key: string): void {
		sessionStorage.removeItem(key);
	}
}
