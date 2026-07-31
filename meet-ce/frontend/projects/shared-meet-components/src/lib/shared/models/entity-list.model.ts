import { signal, Signal } from '@angular/core';

/** Delay before a loading indicator becomes visible, so fast responses never flash a spinner. */
const LOADER_DELAY_MS = 200;

/** One page of entities as returned by a list endpoint. */
export interface EntityListPage<TItem> {
	items: TItem[];
	/** Token for the next page, when the backend reports one. */
	nextPageToken?: string;
	/** Whether more pages exist after this one (`pagination.isTruncated`). */
	hasMore: boolean;
}

export interface EntityListStateOptions<TItem, TFilter> {
	/** Filters active before the first load; every `load()` call replaces them. */
	initialFilters: TFilter;
	/**
	 * Fetches one page. Receives the active filters and the token of the page to
	 * fetch (`undefined` on the first load and on refresh). All domain specifics —
	 * building API filters, mapping the response — live in this callback, so the
	 * state class never needs to know the entity type it manages.
	 */
	fetchPage: (filters: TFilter, nextPageToken: string | undefined) => Promise<EntityListPage<TItem>>;
	/** Called when `fetchPage` rejects: log and notify with the domain's message. */
	onLoadError: (error: unknown) => void;
}

/** Serializable snapshot of the list, for {@link ListStateCacheService}-style back-navigation restore. */
export interface EntityListSnapshot<TItem, TFilter> {
	items: TItem[];
	nextPageToken?: string;
	hasMore: boolean;
	filters: TFilter;
}

/**
 * State and behaviour shared by every paginated entity list page (rooms, users,
 * recordings, room members): the items signal, token pagination, the delayed
 * loading flags and the load/refresh/auto-reload flows. Components own the
 * domain logic (what to fetch, how to notify) through
 * {@link EntityListStateOptions} and keep this class purely mechanical.
 *
 * It is a plain class, not a service: each list on a page gets its own
 * instance (`room-detail` holds two), created directly in a field initializer.
 */
export class EntityListState<TItem, TFilter> {
	private readonly _items = signal<TItem[]>([]);
	private readonly _isLoading = signal(false);
	private readonly _hasMore = signal(false);
	private readonly _isInitializing = signal(true);
	private readonly _showInitialLoader = signal(false);

	private nextPageToken?: string;
	private currentFilters: TFilter;

	/** The loaded items. Mutate through {@link update} / {@link remove}. */
	readonly items: Signal<TItem[]> = this._items.asReadonly();
	/** True while a page is being fetched, after {@link LOADER_DELAY_MS}. */
	readonly isLoading: Signal<boolean> = this._isLoading.asReadonly();
	/** Whether the backend reports more pages after the last one loaded. */
	readonly hasMore: Signal<boolean> = this._hasMore.asReadonly();
	/** True until {@link initialize} or {@link restore} completes. */
	readonly isInitializing: Signal<boolean> = this._isInitializing.asReadonly();
	/** Delayed flag for the full-page loader during {@link initialize}. */
	readonly showInitialLoader: Signal<boolean> = this._showInitialLoader.asReadonly();

	constructor(private readonly options: EntityListStateOptions<TItem, TFilter>) {
		this.currentFilters = options.initialFilters;
	}

	/**
	 * First load of a page whose content is this list: shows the delayed initial
	 * loader, fetches the first page and clears {@link isInitializing}.
	 *
	 * @param beforeReveal async work to finish before the initial loader is
	 * dismissed (e.g. deriving header data from the first page).
	 */
	async initialize(filters: TFilter, beforeReveal?: () => Promise<void>): Promise<void> {
		const delayLoader = setTimeout(() => this._showInitialLoader.set(true), LOADER_DELAY_MS);

		await this.load(filters);
		await beforeReveal?.();

		clearTimeout(delayLoader);
		this._showInitialLoader.set(false);
		this._isInitializing.set(false);
	}

	/**
	 * Fetches a page with the given filters. Appends to the current items, or
	 * replaces them when `refresh` is true (which also restarts pagination).
	 */
	async load(filters: TFilter, refresh = false): Promise<void> {
		this.currentFilters = filters;
		const delayLoader = setTimeout(() => this._isLoading.set(true), LOADER_DELAY_MS);

		try {
			const page = await this.options.fetchPage(filters, refresh ? undefined : this.nextPageToken);

			this._items.set(refresh ? page.items : [...this._items(), ...page.items]);
			this.nextPageToken = page.nextPageToken;
			this._hasMore.set(page.hasMore);
		} catch (error) {
			this.options.onLoadError(error);
		} finally {
			clearTimeout(delayLoader);
			this._isLoading.set(false);
		}
	}

	/** Loads the next page, unless there is none or a load is already running. */
	async loadMore(filters: TFilter): Promise<void> {
		if (!this._hasMore() || this._isLoading()) return;

		await this.load(filters);
	}

	/** Replaces the list with a fresh first page. */
	async refresh(filters: TFilter): Promise<void> {
		await this.load(filters, true);
	}

	/**
	 * Reloads with the last-used filters when deletions emptied the current view
	 * but more pages exist, so the user is not left staring at an empty list.
	 */
	async autoLoadIfEmpty(): Promise<void> {
		if (this._items().length === 0 && this._hasMore()) {
			await this.load(this.currentFilters);
		}
	}

	/** Applies an arbitrary transformation to the items (e.g. replace an updated entity). */
	update(updater: (items: TItem[]) => TItem[]): void {
		this._items.set(updater(this._items()));
	}

	/** Removes every item matching the predicate (e.g. after a deletion). */
	remove(shouldRemove: (item: TItem) => boolean): void {
		this.update((items) => items.filter((item) => !shouldRemove(item)));
	}

	/** Captures items, pagination and filters for a later {@link restore}. */
	snapshot(): EntityListSnapshot<TItem, TFilter> {
		return {
			items: this._items(),
			nextPageToken: this.nextPageToken,
			hasMore: this._hasMore(),
			filters: this.currentFilters
		};
	}

	/** Restores a {@link snapshot} (back navigation) and skips initialization. */
	restore(snapshot: EntityListSnapshot<TItem, TFilter>): void {
		this._items.set(snapshot.items);
		this.nextPageToken = snapshot.nextPageToken;
		this._hasMore.set(snapshot.hasMore);
		this.currentFilters = snapshot.filters;
		this._isInitializing.set(false);
	}
}
