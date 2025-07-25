import { Injectable } from '@angular/core';

@Injectable({
	providedIn: 'root'
})
/**
 * Service for managing session storage operations.
 * Provides methods to store, retrieve, and remove data from sessionStorage.
 */
export class SessionStorageService {
	constructor() {}

	/**
	 * Stores a secret associated with a participant role for a specific room.
	 *
	 * @param roomId The room ID.
	 * @param secret The secret to store.
	 */
	public setRoomSecret(roomId: string, secret: string): void {
		this.set(`room_secret_${roomId}`, secret);
	}

	/**
	 * Retrieves the room secret for a specific room.
	 *
	 * @param roomId The room ID.
	 * @returns The stored secret or null if not found.
	 */
	public getRoomSecret(roomId: string): string | null {
		return this.get<string>(`room_secret_${roomId}`) ?? null;
	}

	/**
	 * Removes the room secret for a specific room.
	 *
	 * @param roomId The room ID.
	 */
	public removeRoomSecret(roomId: string): void {
		this.remove(`room_secret_${roomId}`);
	}

	/**
	 * Stores a redirect URL to be used after leaving OpenVidu Meet.
	 *
	 * @param redirectUrl The URL to redirect to.
	 */
	public setRedirectUrl(redirectUrl: string): void {
		this.set('redirect_url', redirectUrl);
	}

	/**
	 * Retrieves the redirect URL stored in sessionStorage.
	 *
	 * @returns The redirect URL or null if not found.
	 */
	public getRedirectUrl(): string | null {
		return this.get<string>('redirect_url') ?? null;
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
