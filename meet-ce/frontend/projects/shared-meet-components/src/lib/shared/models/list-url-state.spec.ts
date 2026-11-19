import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ListUrlState } from './list-url-state';

interface TestFilter {
	name: string;
	exact: boolean;
	sortField: 'a' | 'b';
	tags: string[];
}

const DEFAULTS: TestFilter = { name: '', exact: false, sortField: 'a', tags: [] };

describe('ListUrlState', () => {
	let router: Router;
	let state: ListUrlState<TestFilter>;

	beforeEach(() => {
		TestBed.configureTestingModule({ providers: [provideRouter([])] });
		router = TestBed.inject(Router);
		state = TestBed.runInInjectionContext(
			() =>
				new ListUrlState(DEFAULTS, {
					name: { param: 'q' },
					sortField: { param: 'sort', allowed: ['a', 'b'] },
					tags: { allowed: ['x', 'y', 'z'] }
				})
		);
	});

	it('reads the filters from the query string and falls back to the defaults', async () => {
		await router.navigateByUrl('/?q=ana&exact=true&sort=b');
		expect(state.current).toEqual({ name: 'ana', exact: true, sortField: 'b', tags: [] });

		await router.navigateByUrl('/');
		expect(state.current).toEqual(DEFAULTS);
	});

	it('ignores a value a field does not accept', async () => {
		await router.navigateByUrl('/?sort=nope');
		expect(state.current.sortField).toBe('a');
	});

	it('writes only the fields that differ from the defaults', async () => {
		await router.navigateByUrl('/');
		state.write({ name: 'ana', exact: false, sortField: 'b', tags: [] });
		await new Promise((resolve) => setTimeout(resolve));

		expect(router.url).toBe('/?q=ana&sort=b');
	});

	it('reports every URL change after the current one', async () => {
		await router.navigateByUrl('/?q=first');
		const seen: TestFilter[] = [];
		state.onChange((filters) => seen.push(filters));

		await router.navigateByUrl('/?q=second');

		expect(seen).toEqual([{ name: 'second', exact: false, sortField: 'a', tags: [] }]);
	});

	describe('list fields', () => {
		it('reads a comma-separated value as a list and a single value as a one-item list', async () => {
			await router.navigateByUrl('/?tags=x,z');
			expect(state.current.tags).toEqual(['x', 'z']);

			await router.navigateByUrl('/?tags=y');
			expect(state.current.tags).toEqual(['y']);
		});

		it('drops the items a field does not accept and the repeated ones', async () => {
			await router.navigateByUrl('/?tags=x,nope,x,');
			expect(state.current.tags).toEqual(['x']);

			await router.navigateByUrl('/?tags=nope');
			expect(state.current.tags).toEqual([]);
		});

		it('writes a list comma-separated and leaves an empty one out', async () => {
			await router.navigateByUrl('/');
			state.write({ ...DEFAULTS, tags: ['x', 'z'] });
			await new Promise((resolve) => setTimeout(resolve));
			expect(router.url).toBe('/?tags=x,z');

			state.write({ ...DEFAULTS, tags: ['y'] });
			await new Promise((resolve) => setTimeout(resolve));
			expect(router.url).toBe('/?tags=y');

			state.write({ ...DEFAULTS, tags: [] });
			await new Promise((resolve) => setTimeout(resolve));
			expect(router.url).toBe('/');
		});
	});
});
