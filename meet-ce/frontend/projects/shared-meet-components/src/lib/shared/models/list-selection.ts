import { computed, effect, Signal, signal, untracked } from '@angular/core';

export interface ListSelectionOptions<TItem> {
	items: Signal<TItem[]>;
	idOf: (item: TItem) => string;
	/** Which items can be selected; every item by default. */
	canSelect?: (item: TItem) => boolean;
}

/**
 * The rows ticked in a list: ids that survive reloads while their item is still listed. Create it in the
 * component's field initializers, after the input that holds the items.
 */
export class ListSelection<TItem> {
	private readonly ids = signal<ReadonlySet<string>>(new Set());
	private readonly selectable = computed(() => this.options.items().filter((item) => this.canSelect(item)));

	readonly count = computed(() => this.ids().size);
	readonly selected = computed(() => this.options.items().filter((item) => this.isSelected(item)));
	readonly allSelected = computed(() => this.count() > 0 && this.count() === this.selectable().length);
	readonly someSelected = computed(() => this.count() > 0 && this.count() < this.selectable().length);

	constructor(private readonly options: ListSelectionOptions<TItem>) {
		effect(() => {
			const listedIds = new Set(this.options.items().map(this.options.idOf));

			untracked(() => {
				const kept = [...this.ids()].filter((id) => listedIds.has(id));

				if (kept.length < this.ids().size) this.ids.set(new Set(kept));
			});
		});
	}

	isSelected(item: TItem): boolean {
		return this.ids().has(this.options.idOf(item));
	}

	toggle(item: TItem) {
		const id = this.options.idOf(item);
		const ids = new Set(this.ids());

		if (!ids.delete(id)) ids.add(id);

		this.ids.set(ids);
	}

	toggleAll() {
		const ids = this.allSelected() ? [] : [...this.ids(), ...this.selectable().map(this.options.idOf)];
		this.ids.set(new Set(ids));
	}

	private canSelect(item: TItem): boolean {
		return this.options.canSelect?.(item) ?? true;
	}
}
