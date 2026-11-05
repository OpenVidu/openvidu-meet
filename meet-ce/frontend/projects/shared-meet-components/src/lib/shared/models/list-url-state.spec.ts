import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ListUrlState } from './list-url-state';

interface TestFilter {
	name: string;
	exact: boolean;
	sortField: 'a' | 'b';
}

const DEFAULTS: TestFilter = { name: '', exact: false, sortField: 'a' };

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
					sortField: { param: 'sort', allowed: ['a', 'b'] }
				})
		);
	});

	it('reads the filters from the query string and falls back to the defaults', async () => {
		await router.navigateByUrl('/?q=ana&exact=true&sort=b');
		expect(state.current).toEqual({ name: 'ana', exact: true, sortField: 'b' });

		await router.navigateByUrl('/');
		expect(state.current).toEqual(DEFAULTS);
	});

	it('ignores a value a field does not accept', async () => {
		await router.navigateByUrl('/?sort=nope');
		expect(state.current.sortField).toBe('a');
	});

	it('writes only the fields that differ from the defaults', async () => {
		await router.navigateByUrl('/');
		state.write({ name: 'ana', exact: false, sortField: 'b' });
		await new Promise((resolve) => setTimeout(resolve));

		expect(router.url).toBe('/?q=ana&sort=b');
	});

	it('reports every URL change after the current one', async () => {
		await router.navigateByUrl('/?q=first');
		const seen: TestFilter[] = [];
		state.onChange((filters) => seen.push(filters));

		await router.navigateByUrl('/?q=second');

		expect(seen).toEqual([{ name: 'second', exact: false, sortField: 'a' }]);
	});
});
