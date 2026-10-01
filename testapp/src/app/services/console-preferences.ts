import { effect, Injectable, signal } from '@angular/core';
import { LOG_ENTRY_KINDS, LogEntryKind } from './event-log';

/** Where the console docks: under the meeting, or as a column beside the controls panel. */
export type ConsolePosition = 'bottom' | 'side';

const STORAGE_KEY = 'testappConsole';

const storedPreferences = (): { position?: unknown; kinds?: unknown } => {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {};
	} catch {
		return {};
	}
};

/** A missing or unreadable list shows every kind; unknown names are dropped. */
const storedKinds = (stored: unknown): Set<LogEntryKind> =>
	new Set(Array.isArray(stored) ? LOG_ENTRY_KINDS.filter((kind) => stored.includes(kind)) : LOG_ENTRY_KINDS);

/**
 * The console's layout choices that outlive a page load: where it docks and which
 * kinds of line it shows. Both are restored from storage so a test run starts the
 * way the previous one was left.
 */
@Injectable({ providedIn: 'root' })
export class ConsolePreferencesService {
	private readonly stored = storedPreferences();
	private readonly _position = signal<ConsolePosition>(this.stored.position === 'side' ? 'side' : 'bottom');
	private readonly _shownKinds = signal<ReadonlySet<LogEntryKind>>(storedKinds(this.stored.kinds));

	readonly position = this._position.asReadonly();
	/** Kinds currently shown. Several can be on at once; all of them by default. */
	readonly shownKinds = this._shownKinds.asReadonly();

	constructor() {
		effect(() => {
			const preferences = { position: this._position(), kinds: [...this._shownKinds()] };

			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
			} catch {
				// Private browsing or a blocked storage partition: the choices still apply for this session.
			}
		});
	}

	togglePosition(): void {
		this._position.update((position) => (position === 'bottom' ? 'side' : 'bottom'));
	}

	toggleKind(kind: LogEntryKind): void {
		this._shownKinds.update((shown) => {
			const next = new Set(shown);

			if (next.has(kind)) {
				next.delete(kind);
			} else {
				next.add(kind);
			}

			return next;
		});
	}

	showEveryKind(): void {
		this._shownKinds.set(new Set(LOG_ENTRY_KINDS));
	}
}
