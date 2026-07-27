import { inject, Service } from '@angular/core';
import type { ILogger } from '../models/logger.model';
import { STORAGE_PREFIX } from '../models/storage.model';
import { migrateLegacyStorage } from './browser-storage.migration';
import { LoggerService } from './logger.service';

/** Where a key lives: shared across tabs (`local`) or isolated per tab (`session`). */
export type StorageArea = 'local' | 'session';

/**
 * The single browser-storage engine for the whole application.
 *
 * Every store (`MediaStorageService`, `MeetStorageService`, `TokenStorageService`,
 * `SessionStorageService`, `RoomMemberContextService`) *injects* this engine rather than reaching
 * for `localStorage`/`sessionStorage` directly — composition, no storage inheritance anywhere. This
 * is the only place in the library allowed to touch the raw Web Storage APIs (enforced by an ESLint
 * guardrail), so it is also the single owner of:
 *
 * - the one prefix ({@link STORAGE_PREFIX}) applied to every key;
 * - the one serialization: values are wrapped as `{ item: value }` so falsy values (`false`, `0`,
 *   `''`) and `null` round-trip intact and stay distinguishable from an absent key;
 * - the availability guard: Web Storage access can *throw* (Safari private mode, storage-blocked
 *   policies), so it is probed once at construction and every operation becomes a safe no-op when
 *   unavailable.
 *
 * Routing (`local` vs `session`) is a per-call argument; the decision of *which* keys are tab-scoped
 * stays a private detail of the store that owns them (e.g. `MediaStorageService.areaFor`).
 */
@Service()
export class BrowserStorageService {
	private readonly log: ILogger = inject(LoggerService).get('BrowserStorage');
	private readonly available = this.checkStorageAvailability();

	constructor() {
		if (!this.available) {
			this.log.w('Browser storage is not available - BrowserStorageService will operate in no-op mode');
			return;
		}

		// One-shot, idempotent migration of legacy keys/formats. Safe to run on every boot; it
		// self-terminates once the legacy keys are gone. Remove after one release cycle.
		try {
			migrateLegacyStorage(window.localStorage, window.sessionStorage);
		} catch (e) {
			this.log.e('Legacy storage migration failed', e);
		}
	}

	/**
	 * Persists a value, wrapped as `{ item: value }`, under {@link STORAGE_PREFIX}` + key`.
	 *
	 * @param area `'local'` (default, shared across tabs) or `'session'` (isolated per tab).
	 */
	set(key: string, value: unknown, area: StorageArea = 'local'): void {
		const storage = this.storageFor(area);
		if (!storage) return;

		try {
			storage.setItem(STORAGE_PREFIX + key, JSON.stringify({ item: value }));
		} catch (e) {
			this.log.e(`Failed to set storage key: ${key}`, e);
		}
	}

	/**
	 * Reads a value written by {@link set}, or `null` if it is absent or corrupted.
	 *
	 * A stored entry that is not valid JSON, or that parses to anything other than the
	 * `{ item: … }` wrapper (e.g. a stale foreign value under a clashing key), is treated as
	 * corrupted: the entry is deleted and `null` is returned, so a foreign value can never silently
	 * read as `undefined`.
	 */
	get<T = unknown>(key: string, area: StorageArea = 'local'): T | null {
		const storage = this.storageFor(area);
		if (!storage) return null;

		const storageKey = STORAGE_PREFIX + key;
		const raw = storage.getItem(storageKey);
		if (raw === null) return null;

		try {
			const parsed: unknown = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object' || !('item' in parsed)) {
				throw new Error('Unexpected storage shape');
			}
			return (parsed as { item: T }).item;
		} catch (e) {
			this.log.e(`Failed to parse storage key: ${key}`, e);
			storage.removeItem(storageKey); // discard the corrupted entry so it stops failing
			return null;
		}
	}

	remove(key: string, area: StorageArea = 'local'): void {
		const storage = this.storageFor(area);
		if (!storage) return;

		try {
			storage.removeItem(STORAGE_PREFIX + key);
		} catch (e) {
			this.log.e(`Failed to remove storage key: ${key}`, e);
		}
	}

	/**
	 * Returns the backend for an area, or `null` when storage is unavailable — which turns every
	 * operation into a safe no-op.
	 */
	private storageFor(area: StorageArea): Storage | null {
		if (!this.available) return null;
		return area === 'session' ? window.sessionStorage : window.localStorage;
	}

	/**
	 * Probes storage once at construction. Access can *throw* (not just return null) when blocked by
	 * browser policy or Safari's private mode, so the result is cached to keep later calls cheap.
	 */
	private checkStorageAvailability(): boolean {
		const probe = '__ovStorageProbe__';
		try {
			for (const storage of [window.localStorage, window.sessionStorage]) {
				storage.setItem(probe, probe);
				storage.removeItem(probe);
			}
			return true;
		} catch {
			return false;
		}
	}
}
