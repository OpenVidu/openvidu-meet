/**
 * Puts a storage key under a prefix, as a path segment; an empty prefix leaves the key untouched.
 */
export const withKeyPrefix = (prefix: string, key: string): string => (prefix ? `${prefix}/${key}` : key);
