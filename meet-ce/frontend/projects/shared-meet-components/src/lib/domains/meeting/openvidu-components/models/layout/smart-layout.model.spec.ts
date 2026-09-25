import { keepMosaicOrder, swapInPlace } from './smart-layout.model';

describe('keepMosaicOrder', () => {
	it('keeps the previous order of whoever is still here and appends the newcomers', () => {
		expect(keepMosaicOrder(['c', 'a', 'gone'], ['a', 'b', 'c', 'd'])).toEqual(['c', 'a', 'b', 'd']);
	});
});

describe('swapInPlace', () => {
	const ids = (...values: string[]) => new Set(values);

	it('gives the slot of a participant leaving the grid to the one entering it', () => {
		expect(swapInPlace(['a', 'b', 'c'], ids('a', 'd', 'c'), ids('a', 'b', 'c', 'd'))).toEqual(['a', 'd', 'c']);
	});

	it('closes the slot of a departure nobody replaces', () => {
		expect(swapInPlace(['a', 'b', 'c'], ids('a', 'c'), ids('a', 'b', 'c'))).toEqual(['a', 'c']);
	});

	it('drops whoever left the meeting before swapping', () => {
		expect(swapInPlace(['a', 'gone', 'b'], ids('a', 'b', 'c'), ids('a', 'b', 'c'))).toEqual(['a', 'b', 'c']);
	});

	it('appends arrivals up to the size of the grid only', () => {
		expect(swapInPlace([], ids('a', 'b'), ids('a', 'b', 'c'))).toEqual(['a', 'b']);
	});

	it('leaves the order alone when the same participants stay', () => {
		expect(swapInPlace(['b', 'a'], ids('a', 'b'), ids('a', 'b', 'c'))).toEqual(['b', 'a']);
	});
});
