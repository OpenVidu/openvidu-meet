/**
 * Puts a storage key under a prefix, as a path segment: a key already under it is returned as-is,
 * and an empty prefix leaves every key untouched.
 */
export const withKeyPrefix = (prefix: string, key: string): string =>
	!prefix || key.startsWith(`${prefix}/`) ? key : `${prefix}/${key}`;
