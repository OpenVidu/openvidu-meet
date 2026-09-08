/** Embedding integration the testapp currently exercises. */
export type Integration = 'webcomponent' | 'iframe';

/**
 * Form value for an optional boolean. `''` means the attribute/argument is
 * omitted, which is a different request from sending `false`: only a value that
 * is set outranks the room's own default.
 */
export type TriState = '' | 'true' | 'false';

/** Maps a tri-state form value to the optional boolean the embedded API expects. */
export const toOptionalBoolean = (value: TriState): boolean | undefined =>
	value === '' ? undefined : value === 'true';
