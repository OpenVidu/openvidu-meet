import { signal } from '@angular/core';

export interface SummaryStateOptions<TSummary> {
	read: () => Promise<TSummary>;
	/** Called when `read` rejects: log it. */
	onError: (error: unknown) => void;
}

/**
 * The key figures of a list page as the server last reported them: `null` until the first read and
 * whenever a read fails, so a page shows no figure rather than a stale one.
 *
 * Like {@link EntityListState} it is a plain class created in a field initializer.
 */
export class SummaryState<TSummary> {
	private readonly _value = signal<TSummary | null>(null);
	private reads = 0;

	readonly value = this._value.asReadonly();

	constructor(private readonly options: SummaryStateOptions<TSummary>) {}

	/** Reads the figures again; only the latest read counts when several overlap. */
	async refresh(): Promise<void> {
		const read = ++this.reads;

		try {
			const summary = await this.options.read();

			if (read === this.reads) this._value.set(summary);
		} catch (error) {
			if (read === this.reads) this._value.set(null);

			this.options.onError(error);
		}
	}
}
