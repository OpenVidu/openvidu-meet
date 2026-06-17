import { Injectable, signal } from '@angular/core';

/**
 * In-memory, signal-backed log of human-readable lines shown in the testapp's
 * "Event log" panel. Any part of the app can append a line; the newest entry is
 * kept first and the list is capped to avoid unbounded growth.
 */
@Injectable({ providedIn: 'root' })
export class EventLogService {
	private static readonly MAX_ENTRIES = 100;

	private readonly _entries = signal<string[]>([]);

	/** Read-only view of the log, newest entry first. */
	readonly entries = this._entries.asReadonly();

	/** Appends a timestamped line to the top of the log. */
	log(message: string): void {
		const timestamp = new Date().toLocaleTimeString();
		this._entries.update((entries) => [`[${timestamp}] ${message}`, ...entries].slice(0, EventLogService.MAX_ENTRIES));
	}

	/** Empties the log. */
	clear(): void {
		this._entries.set([]);
	}
}
