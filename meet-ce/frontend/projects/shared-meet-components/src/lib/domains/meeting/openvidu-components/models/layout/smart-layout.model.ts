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
