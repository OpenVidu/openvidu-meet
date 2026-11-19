import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ListSelection } from './list-selection';

interface Row {
	id: string;
	locked?: boolean;
}

describe('ListSelection', () => {
	const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }));
	let items: ReturnType<typeof signal<Row[]>>;
	let selection: ListSelection<Row>;

	beforeEach(() => {
		items = signal(rows('a', 'b', 'c'));
		selection = TestBed.runInInjectionContext(
			() =>
				new ListSelection({
					items,
					idOf: (row) => row.id,
					canSelect: (row) => !row.locked
				})
		);
	});

	const ids = () => selection.selected().map((row) => row.id);

	it('reports some selected while a part of the selectable rows is ticked, and all when every one is', () => {
		selection.toggle(items()[0]);

		expect(selection.someSelected()).toBeTrue();
		expect(selection.allSelected()).toBeFalse();

		selection.toggle(items()[1]);
		selection.toggle(items()[2]);

		expect(selection.someSelected()).toBeFalse();
		expect(selection.allSelected()).toBeTrue();
	});

	it('unticks a ticked row when it is toggled again', () => {
		selection.toggle(items()[0]);
		selection.toggle(items()[0]);

		expect(selection.count()).toBe(0);
	});

	it('ticks only the selectable rows with the select all box, and clears them with a second click', () => {
		items.set([{ id: 'a' }, { id: 'b', locked: true }, { id: 'c' }]);

		selection.toggleAll();

		expect(ids()).toEqual(['a', 'c']);
		expect(selection.allSelected()).toBeTrue();

		selection.toggleAll();

		expect(selection.count()).toBe(0);
	});

	it('completes a partial selection with the select all box', () => {
		selection.toggle(items()[1]);

		selection.toggleAll();

		expect(ids()).toEqual(['a', 'b', 'c']);
	});

	it('stops reporting all selected once more rows are listed, and the select all box then ticks them too', () => {
		selection.toggleAll();

		items.set(rows('a', 'b', 'c', 'd'));

		expect(selection.allSelected()).toBeFalse();
		expect(selection.someSelected()).toBeTrue();

		selection.toggleAll();

		expect(ids()).toEqual(['a', 'b', 'c', 'd']);
	});

	it('drops the rows that leave the list and keeps the ones that stay', () => {
		selection.toggleAll();

		items.set(rows('b', 'c', 'd'));
		TestBed.tick();

		expect(ids()).toEqual(['b', 'c']);
		expect(selection.count()).toBe(2);
	});
});
