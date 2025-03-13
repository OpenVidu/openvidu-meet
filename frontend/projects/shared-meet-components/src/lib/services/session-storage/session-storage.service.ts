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
	 * Stores a moderator secret for a specific room.
	 *
	 * @param roomName The room name.
	 * @param secret The secret string.
	 */
	public setModeratorSecret(roomName: string, secret: string): void {
		this.set(`moderator_secret_${roomName}`, secret);
	}

	/**
	 * Retrieves the moderator secret for a specific room.
	 *
	 * @param roomName The room name.
	 * @returns The stored secret or null if not found.
	 */
	public getModeratorSecret(roomName: string): string | null {
		return this.get<string>(`moderator_secret_${roomName}`) ?? null;
	}

	/**
	 * Removes the moderator secret for a specific room.
	 *
	 * @param roomName The room name.
	 */
	public removeModeratorSecret(roomName: string): void {
		this.remove(`moderator_secret_${roomName}`);
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
