/**
 * Stub that indicates a property can be expanded.
 */
export interface ExpandableStub {
	_expandable: true;
	_href: string;
}

/**
 * Adds expand query parameter support to filters.
 */
export interface ExpandableFilters {
	/**
	 * Comma-separated properties to expand (e.g., "config,autoDeletionPolicy").
	 */
	expand?: string;
}
