export enum SmartLayoutMode {
	/**
	 * Default layout mode shows all participants in a grid.
	 */
	MOSAIC = 'MOSAIC',

	/**
	 * Smart layout mode shows a limited number of prioritized active participants.
	 */
	SMART_MOSAIC = 'SMART_MOSAIC'
}

/** The participants the smart layout is not showing, as the status rail renders them. */
export interface HiddenParticipantsSummary {
	count: number;
	names: string[];
}

/**
 * Whether two identity orders hold the same identities in the same positions. Both the speaker
 * priority and the displayed camera order are recomputed on every active-speaker event — about twice
 * a second while anyone talks — so comparing before publishing is what keeps an unchanged order from
 * re-running the whole layout.
 */
export const sameIdentityOrder = (a: readonly string[], b: readonly string[]): boolean =>
	a.length === b.length && a.every((identity, index) => identity === b[index]);

/**
 * Whether two summaries describe the same hidden participants. The summary is rebuilt on every
 * active-speaker event, so identity alone would re-render the rail about twice a second.
 */
export function sameHiddenParticipantsSummary(
	a: HiddenParticipantsSummary | undefined,
	b: HiddenParticipantsSummary | undefined
): boolean {
	if (a === undefined || b === undefined) return a === b;

	return a.count === b.count && sameIdentityOrder(a.names, b.names);
}

/**
 * Mosaic order: the previous order of whoever is still here, then the newcomers, so a switch between
 * Smart Mosaic and Mosaic keeps every tile where it was.
 */
export function keepMosaicOrder(previous: readonly string[], allIds: readonly string[]): string[] {
	const present = new Set(allIds);
	const order = previous.filter((id) => present.has(id));
	const placed = new Set(order);

	return [...order, ...allIds.filter((id) => !placed.has(id))];
}

/**
 * Smart Mosaic order: each participant leaving the grid hands its slot to one entering it, so Angular's
 * `@for` sees an insert and a removal at the same index instead of moving tiles around. Arrivals left
 * over go at the end, up to the size of the grid.
 */
export function swapInPlace(
	previous: readonly string[],
	targetIds: ReadonlySet<string>,
	availableIds: ReadonlySet<string>
): string[] {
	const order = previous.filter((id) => availableIds.has(id));
	const current = new Set(order);
	const arriving = [...targetIds].filter((id) => !current.has(id));

	for (const departing of order.filter((id) => !targetIds.has(id))) {
		const index = order.indexOf(departing);
		const replacement = arriving.shift();

		if (replacement) {
			order[index] = replacement;
		} else {
			order.splice(index, 1);
		}
	}

	for (const arrival of arriving) {
		if (order.length < targetIds.size) order.push(arrival);
	}

	return order;
}
