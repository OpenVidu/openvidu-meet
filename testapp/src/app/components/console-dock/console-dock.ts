import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConsolePosition, ConsolePreferencesService } from '../../services/console-preferences';
import { EventLogService, LOG_ENTRY_KINDS, LogEntry, LogEntryKind } from '../../services/event-log';

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

/**
 * The dock's extent along the axis it resizes on: height at the bottom, width at the side.
 * `stageMin` is the room kept for the meeting, however far the drag goes: the top bar plus a
 * usable stage above the dock, or the controls panel plus a usable stage beside it.
 */
const SIZES: Record<ConsolePosition, { initial: number; min: number; stageMin: number }> = {
	bottom: { initial: 236, min: 120, stageMin: 220 },
	side: { initial: 400, min: 280, stageMin: 880 }
};

/** Pixels a key press moves the grip. */
const NUDGE = 24;

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
	protected readonly preferences = inject(ConsolePreferencesService);

	protected readonly side = computed(() => this.preferences.position() === 'side');
	protected readonly collapsed = signal(false);
	protected readonly size = signal(SIZES[this.preferences.position()].initial);
	protected readonly query = signal('');
	protected readonly expandedId = signal<number | null>(null);

	protected readonly rows = computed<ConsoleRow[]>(() => {
		const shownKinds = this.preferences.shownKinds();
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

	protected readonly everyKindShown = computed(() => this.preferences.shownKinds().size === LOG_ENTRY_KINDS.length);

	protected readonly chips = computed(() => {
		const counts = this.log.counts();
		const shownKinds = this.preferences.shownKinds();

		return LOG_ENTRY_KINDS.map((kind) => ({
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

	// ── Layout ──────────────────────────────────────────────────────────────

	protected togglePosition(): void {
		this.preferences.togglePosition();
		this.size.set(SIZES[this.preferences.position()].initial);
	}

	// Pointer capture keeps the drag on the grip, so the move and up handlers stay
	// on the element itself instead of on the document.

	private dragOrigin: { pointer: number; size: number } | null = null;

	protected startResize(event: PointerEvent): void {
		this.dragOrigin = { pointer: this.pointerAlongAxis(event), size: this.size() };
		(event.target as HTMLElement).setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	protected resize(event: PointerEvent): void {
		if (!this.dragOrigin) return;

		const travelled = this.pointerAlongAxis(event) - this.dragOrigin.pointer;

		// The bottom dock grows as the pointer moves up, the side one as it moves right.
		this.setSize(this.dragOrigin.size + (this.side() ? travelled : -travelled));
	}

	protected endResize(event: PointerEvent): void {
		if (!this.dragOrigin) return;

		this.dragOrigin = null;
		(event.target as HTMLElement).releasePointerCapture(event.pointerId);
	}

	protected nudgeSize(event: KeyboardEvent): void {
		const [grow, shrink] = this.side() ? ['ArrowRight', 'ArrowLeft'] : ['ArrowUp', 'ArrowDown'];

		if (event.key !== grow && event.key !== shrink) return;

		event.preventDefault();
		this.setSize(this.size() + (event.key === grow ? NUDGE : -NUDGE));
	}

	private pointerAlongAxis(event: PointerEvent): number {
		return this.side() ? event.clientX : event.clientY;
	}

	private setSize(size: number): void {
		const { min, stageMin } = SIZES[this.preferences.position()];
		const viewport = this.side() ? window.innerWidth : window.innerHeight;

		this.size.set(Math.min(Math.max(size, min), Math.max(min, viewport - stageMin)));
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
