import { ListFigure, selectedFigureKey } from './list-figure.model';

const figure = (key: string, filter?: string | string[] | null): ListFigure<string | string[]> => ({
	key,
	label: key,
	count: 1,
	color: 'red',
	icon: 'x',
	filter
});

describe('selectedFigureKey', () => {
	const figures = [
		figure('all', null),
		figure('open', 'open'),
		figure('failed', ['failed', 'aborted']),
		figure('info')
	];

	it('is the total when the list has no filter', () => {
		expect(selectedFigureKey(figures, '')).toBe('all');
		expect(selectedFigureKey(figures, [])).toBe('all');
	});

	it('is the figure whose filter is exactly the list filter, whatever the order of a group', () => {
		expect(selectedFigureKey(figures, 'open')).toBe('open');
		expect(selectedFigureKey(figures, ['aborted', 'failed'])).toBe('failed');
	});

	it('is none when no figure holds the list filter', () => {
		expect(selectedFigureKey(figures, 'closed')).toBeUndefined();
		expect(selectedFigureKey(figures, ['failed'])).toBeUndefined();
	});
});
