/** One key figure of a list page, shown as a tile (or a chip on a phone). */
export interface ListFigure<TFilter> {
	key: string;
	label: string;
	count: number;
	/** CSS color of the figure's icon and bar. */
	color: string;
	/** Material icon name. */
	icon: string;
	/**
	 * What selecting the figure applies to the list; `null` for the total, which clears the filter.
	 * A figure without it only informs.
	 */
	filter?: TFilter | null;
	/** Phone card sentence of a figure that only informs. */
	sentence?: string;
	/** The item a figure that only informs points at. */
	next?: { name: string; link: string[]; when: string };
}

/** The key of the figure whose filter is exactly `current` (an empty value is the total's), if any. */
export const selectedFigureKey = (
	figures: readonly ListFigure<string | readonly string[]>[],
	current: string | readonly string[]
): string | undefined => {
	const normalize = (value: string | readonly string[] | null | undefined) =>
		[value ?? []].flat().filter(Boolean).sort().join(',');

	return figures.find(({ filter }) => filter !== undefined && normalize(filter) === normalize(current))?.key;
};
