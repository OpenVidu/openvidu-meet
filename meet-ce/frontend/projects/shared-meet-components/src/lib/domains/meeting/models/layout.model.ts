export enum MeetLayoutMode {
	/**
	 * Default layout mode shows all participants in a grid
	 */
	MOSAIC = 'MOSAIC',

	/**
	 * The layout mode that shows the last (N) speakers in a grid.
	 * Optimized for large meetings.
	 */
	SMART_MOSAIC = 'SMART_MOSAIC'
}
