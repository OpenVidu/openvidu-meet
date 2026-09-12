import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EventLogService, LogEntry, LogEntryKind } from '../../services/event-log';

/** A log entry plus what the console needs to render it. */
interface ConsoleRow extends LogEntry {
	/** Short tag shown in the kind column. */
	readonly tag: string;
	/** Pretty-printed payload, or `null` when the detail is not structured. */
	readonly payload: string | null;
}

const KIND_TAGS: Record<LogEntryKind, string> = {
	command: 'CMD',
	event: 'EVT',
	webhook: 'HOOK',
	warning: 'WARN',
	info: 'INFO'
};

/** Chip order in the bar, which is also the order kinds were introduced in the log. */
const KINDS = Object.keys(KIND_TAGS) as LogEntryKind[];

const DEFAULT_HEIGHT = 236;
const MIN_HEIGHT = 120;
/** Leaves the top bar plus a usable stage above the dock, however far the drag goes. */
const MIN_STAGE_HEIGHT = 220;

/** Only structured details are worth expanding; plain reasons already fit on the row. */
const prettyPayload = (detail: string): string | null => {
	if (!detail.startsWith('{') && !detail.startsWith('[')) return null;

	try {
		return JSON.stringify(JSON.parse(detail), null, 2);
	} catch {
		return null;
	}
};

const toRow = (entry: LogEntry): ConsoleRow => ({
	...entry,
	tag: KIND_TAGS[entry.kind],
	payload: prettyPayload(entry.detail)
});

/**
 * Console dock: everything that crossed the host boundary, typed by kind so
 * commands, events and webhooks are told apart at a glance. Filtering, search
 * and row expansion are view state and stay here; the entries come from
 * `EventLogService`.
 */
@Component({
	selector: 'app-console-dock',
	imports: [FormsModule],
	templateUrl: './console-dock.html',
	styleUrl: './console-dock.css'
})
export class ConsoleDock {
	protected readonly log = inject(EventLogService);

	protected readonly collapsed = signal(false);
	protected readonly height = signal(DEFAULT_HEIGHT);
	/** Kinds currently shown. Several can be on at once; all of them by default. */
	protected readonly shownKinds = signal<ReadonlySet<LogEntryKind>>(new Set(KINDS));
	protected readonly query = signal('');
	protected readonly expandedId = signal<number | null>(null);

	protected readonly rows = computed<ConsoleRow[]>(() => {
		const shownKinds = this.shownKinds();
		const query = this.query().trim().toLowerCase();

		return this.log
			.entries()
			.filter((entry) => {
				if (!shownKinds.has(entry.kind)) return false;

				if (!query) return true;

				return `${entry.name} ${entry.detail}`.toLowerCase().includes(query);
			})
			.map(toRow);
	});

	protected readonly everyKindShown = computed(() => this.shownKinds().size === KINDS.length);

	protected readonly chips = computed(() => {
		const counts = this.log.counts();
		const shownKinds = this.shownKinds();

		return KINDS.map((kind) => ({
			kind,
			label: KIND_TAGS[kind].toLowerCase(),
			count: counts[kind],
			on: shownKinds.has(kind)
		}));
	});

	/** Newest entry, shown in the collapsed strip so awareness survives collapsing. */
	protected readonly latestRow = computed<ConsoleRow | undefined>(() => {
		const newest = this.log.entries()[0];
		return newest ? toRow(newest) : undefined;
	});

	// ── Resizing ────────────────────────────────────────────────────────────
	// Pointer capture keeps the drag on the grip, so the move and up handlers stay
	// on the element itself instead of on the document.

	private dragOrigin: { y: number; height: number } | null = null;

	protected startResize(event: PointerEvent): void {
		this.dragOrigin = { y: event.clientY, height: this.height() };
		(event.target as HTMLElement).setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	protected resize(event: PointerEvent): void {
		if (!this.dragOrigin) return;

		this.setHeight(this.dragOrigin.height + (this.dragOrigin.y - event.clientY));
	}

	protected endResize(event: PointerEvent): void {
		if (!this.dragOrigin) return;

		this.dragOrigin = null;
		(event.target as HTMLElement).releasePointerCapture(event.pointerId);
	}

	protected nudgeHeight(delta: number, event: Event): void {
		event.preventDefault();
		this.setHeight(this.height() + delta);
	}

	private setHeight(height: number): void {
		const max = Math.max(MIN_HEIGHT, window.innerHeight - MIN_STAGE_HEIGHT);
		this.height.set(Math.min(Math.max(height, MIN_HEIGHT), max));
	}

	// ── Filtering ───────────────────────────────────────────────────────────

	protected toggleKind(kind: LogEntryKind): void {
		this.shownKinds.update((shown) => {
			const next = new Set(shown);

			if (next.has(kind)) {
				next.delete(kind);
			} else {
				next.add(kind);
			}

			return next;
		});
	}

	protected showEveryKind(): void {
		this.shownKinds.set(new Set(KINDS));
	}

	protected toggleExpanded(row: ConsoleRow): void {
		if (!row.payload) return;

		this.expandedId.update((id) => (id === row.id ? null : row.id));
	}

	protected copyVisible(): void {
		const text = this.rows()
			.map((row) => `[${row.time}] ${row.tag} ${row.name} ${row.detail}`.trimEnd())
			.join('\n');

		void navigator.clipboard?.writeText(text);
	}

	protected clear(): void {
		this.expandedId.set(null);
		this.log.clear();
	}
}
