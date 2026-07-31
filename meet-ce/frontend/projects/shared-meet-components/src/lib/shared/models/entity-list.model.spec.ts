import { EntityListPage, EntityListState } from './entity-list.model';

interface TestItem {
	id: string;
}

interface TestFilter {
	name: string;
}

/** Deferred promise so tests control exactly when a fetch settles. */
const deferred = <T>() => {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
};

const page = (ids: string[], nextPageToken?: string): EntityListPage<TestItem> => ({
	items: ids.map((id) => ({ id })),
	nextPageToken,
	hasMore: nextPageToken !== undefined
});

describe('EntityListState', () => {
	let fetchPage: jasmine.Spy<(filters: TestFilter, token: string | undefined) => Promise<EntityListPage<TestItem>>>;
	let onLoadError: jasmine.Spy<(error: unknown) => void>;
	let list: EntityListState<TestItem, TestFilter>;

	const ids = () => list.items().map((item) => item.id);

	beforeEach(() => {
		fetchPage = jasmine.createSpy('fetchPage');
		onLoadError = jasmine.createSpy('onLoadError');
		list = new EntityListState<TestItem, TestFilter>({
			initialFilters: { name: '' },
			fetchPage,
			onLoadError
		});
	});

	describe('pagination', () => {
		it('appends pages and forwards the next-page token to the fetcher', async () => {
			fetchPage.and.returnValues(Promise.resolve(page(['a', 'b'], 'token-1')), Promise.resolve(page(['c'])));

			await list.load({ name: 'x' });

			expect(ids()).toEqual(['a', 'b']);
			expect(list.hasMore()).toBeTrue();
			expect(fetchPage).toHaveBeenCalledWith({ name: 'x' }, undefined);

			await list.loadMore({ name: 'x' });

			expect(ids()).toEqual(['a', 'b', 'c']);
			expect(list.hasMore()).toBeFalse();
			expect(fetchPage).toHaveBeenCalledWith({ name: 'x' }, 'token-1');
		});

		it('refresh replaces the items and restarts pagination', async () => {
			fetchPage.and.returnValues(Promise.resolve(page(['a'], 'token-1')), Promise.resolve(page(['b'])));

			await list.load({ name: '' });
			await list.refresh({ name: 'filtered' });

			expect(ids()).toEqual(['b']);
			// A refresh never sends the previous page token.
			expect(fetchPage.calls.mostRecent().args).toEqual([{ name: 'filtered' }, undefined]);
		});

		it('loadMore is a no-op when the backend reported no more pages', async () => {
			fetchPage.and.resolveTo(page(['a']));

			await list.load({ name: '' });
			await list.loadMore({ name: '' });

			expect(fetchPage).toHaveBeenCalledTimes(1);
		});
	});

	describe('loading flags', () => {
		beforeEach(() => {
			jasmine.clock().install();
		});

		afterEach(() => {
			jasmine.clock().uninstall();
		});

		it('never flashes the loading flag for fast responses', async () => {
			fetchPage.and.resolveTo(page(['a']));

			await list.load({ name: '' });

			expect(list.isLoading()).toBeFalse();
		});

		it('shows the loading flag after the delay and clears it when the fetch settles', async () => {
			const fetch = deferred<EntityListPage<TestItem>>();
			fetchPage.and.returnValue(fetch.promise);

			const load = list.load({ name: '' });

			expect(list.isLoading()).toBeFalse();
			jasmine.clock().tick(200);
			expect(list.isLoading()).toBeTrue();

			fetch.resolve(page(['a']));
			await load;

			expect(list.isLoading()).toBeFalse();
		});

		it('loadMore is a no-op while another load is running', async () => {
			const fetch = deferred<EntityListPage<TestItem>>();
			fetchPage.and.returnValues(Promise.resolve(page(['a'], 'token-1')), fetch.promise);

			await list.load({ name: '' });
			const slowLoad = list.load({ name: '' });
			jasmine.clock().tick(200);

			await list.loadMore({ name: '' });

			expect(fetchPage).toHaveBeenCalledTimes(2);

			fetch.resolve(page(['b']));
			await slowLoad;
		});

		it('initialize dismisses the initial loader only after beforeReveal finishes', async () => {
			fetchPage.and.resolveTo(page(['a']));
			const reveal = deferred<void>();
			let initializingDuringReveal: boolean | undefined;

			const initialize = list.initialize({ name: '' }, async () => {
				initializingDuringReveal = list.isInitializing();
				await reveal.promise;
			});

			expect(list.isInitializing()).toBeTrue();

			reveal.resolve();
			await initialize;

			expect(initializingDuringReveal).toBeTrue();
			expect(list.isInitializing()).toBeFalse();
			expect(list.showInitialLoader()).toBeFalse();
		});
	});

	describe('errors', () => {
		it('reports fetch failures through onLoadError and keeps the previous items', async () => {
			fetchPage.and.returnValues(Promise.resolve(page(['a'])), Promise.reject(new Error('boom')));

			await list.load({ name: '' });
			await list.load({ name: '' });

			expect(onLoadError).toHaveBeenCalledWith(jasmine.any(Error));
			expect(ids()).toEqual(['a']);
			expect(list.isLoading()).toBeFalse();
		});
	});

	describe('autoLoadIfEmpty', () => {
		it('reloads with the last-used filters when deletions emptied the view and more pages exist', async () => {
			fetchPage.and.returnValues(
				Promise.resolve(page(['a'], 'token-1')),
				Promise.resolve(page(['b'], 'token-2'))
			);

			await list.load({ name: 'active' });
			list.remove((item) => item.id === 'a');

			await list.autoLoadIfEmpty();

			expect(ids()).toEqual(['b']);
			expect(fetchPage.calls.mostRecent().args).toEqual([{ name: 'active' }, 'token-1']);
		});

		it('does nothing while items remain or when there are no more pages', async () => {
			fetchPage.and.resolveTo(page(['a'], 'token-1'));

			await list.load({ name: '' });
			await list.autoLoadIfEmpty(); // not empty

			list.remove(() => true);
			list.update((items) => items); // still empty, but hasMore true → next call loads
			expect(fetchPage).toHaveBeenCalledTimes(1);
		});
	});

	describe('mutations and snapshots', () => {
		it('remove drops matching items and update transforms them', async () => {
			fetchPage.and.resolveTo(page(['a', 'b', 'c']));
			await list.load({ name: '' });

			list.remove((item) => item.id === 'b');
			expect(ids()).toEqual(['a', 'c']);

			list.update((items) => items.map((item) => ({ id: item.id.toUpperCase() })));
			expect(ids()).toEqual(['A', 'C']);
		});

		it('snapshot/restore round-trips items, pagination and filters', async () => {
			fetchPage.and.returnValues(
				Promise.resolve(page(['a'], 'token-1')),
				Promise.resolve(page(['next'], 'token-2'))
			);
			await list.load({ name: 'saved' });

			const restored = new EntityListState<TestItem, TestFilter>({
				initialFilters: { name: '' },
				fetchPage,
				onLoadError
			});
			restored.restore(list.snapshot());

			expect(restored.items().map((item) => item.id)).toEqual(['a']);
			expect(restored.hasMore()).toBeTrue();
			expect(restored.isInitializing()).toBeFalse();

			// The restored list resumes pagination from the snapshot's token and filters.
			restored.remove(() => true);
			await restored.autoLoadIfEmpty();
			expect(fetchPage.calls.mostRecent().args).toEqual([{ name: 'saved' }, 'token-1']);
		});
	});
});
