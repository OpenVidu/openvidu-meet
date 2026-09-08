import { computed, Injectable, signal } from '@angular/core';

/**
 * Where a log line came from. The console renders one colour rail and one filter
 * chip per kind, so a line's kind is decided at the call site rather than parsed
 * back out of its text.
 */
export type LogEntryKind = 'command' | 'event' | 'webhook' | 'warning' | 'info';

/** One line of the console. `detail` is the payload rendered next to the name. */
export interface LogEntry {
	readonly id: number;
	readonly kind: LogEntryKind;
	readonly time: string;
	readonly name: string;
	readonly detail: string;
}

/** Local wall clock as `HH:MM:SS`. Fixed width, so the console's time column never wraps. */
const timestamp = (): string => new Date().toTimeString().slice(0, 8);

const stringify = (payload: unknown): string => {
	if (payload === undefined || payload === null) return '';

	try {
		return JSON.stringify(payload);
	} catch {
		return '';
	}
};

/**
 * In-memory, signal-backed log of everything that crosses the host boundary:
 * commands the testapp sends, events the embedded app emits, webhooks the local
 * bridge relays, plus warnings and status lines. Newest entry first, capped to
 * avoid unbounded growth.
 */
@Injectable({ providedIn: 'root' })
export class EventLogService {
	private static readonly MAX_ENTRIES = 200;

	private nextId = 0;
	private readonly _entries = signal<LogEntry[]>([]);

	/** Read-only view of the log, newest entry first. */
	readonly entries = this._entries.asReadonly();

	/** Entry count per kind, for the console's filter chips. */
	readonly counts = computed(() => {
		const counts: Record<LogEntryKind, number> = { command: 0, event: 0, webhook: 0, warning: 0, info: 0 };

		for (const entry of this._entries()) {
			counts[entry.kind]++;
		}

		return counts;
	});

	/** A command the host sent to the embedded app. `args` is the rendered argument list. */
	command(name: string, args = ''): void {
		this.append('command', name, args);
	}

	/** A lifecycle event the embedded app emitted. */
	event(name: string, payload: unknown): void {
		this.append('event', name, stringify(payload));
	}

	/** A webhook the local bridge relayed from the Meet server. */
	webhook(name: string, payload: unknown): void {
		this.append('webhook', name, stringify(payload));
	}

	/** A rejected or unsupported action, with the reason. */
	warning(name: string, reason = ''): void {
		this.append('warning', name, reason);
	}

	/** A status line from the harness itself. */
	info(name: string, detail = ''): void {
		this.append('info', name, detail);
	}

	clear(): void {
		this._entries.set([]);
	}

	private append(kind: LogEntryKind, name: string, detail: string): void {
		const entry: LogEntry = {
			id: this.nextId++,
			kind,
			time: timestamp(),
			name,
			detail
		};

		this._entries.update((entries) => [entry, ...entries].slice(0, EventLogService.MAX_ENTRIES));
	}
}
