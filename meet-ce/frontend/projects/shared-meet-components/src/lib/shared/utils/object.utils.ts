type PlainObject = Record<string, unknown>;

// Keys that could reach/replace an object's prototype through bracket assignment
// (e.g. a JSON.parse'd payload with an own "__proto__" property).
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const isPlainObject = (value: unknown): value is PlainObject => {
	if (value === null || typeof value !== 'object') return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

/**
 * Recursively merges own enumerable properties of `source` into `target`,
 * mutating and returning `target`. Mirrors the subset of `lodash.merge`
 * semantics relied on across the app: plain objects are merged deeply (and
 * cloned when absent from the target), `undefined` source values are ignored,
 * and any other value (primitives, arrays, Date, …) overwrites the target value.
 * Keys that could pollute the prototype chain (`__proto__`, `constructor`,
 * `prototype`) are skipped.
 */
export const deepMerge = <T>(target: T, source: unknown): T => {
	if (!isPlainObject(source)) return target;
	const out = (isPlainObject(target) ? target : {}) as PlainObject;
	for (const key of Object.keys(source)) {
		if (UNSAFE_KEYS.has(key)) continue;
		const sourceValue = source[key];
		if (sourceValue === undefined) continue;
		if (isPlainObject(sourceValue)) {
			out[key] = deepMerge(isPlainObject(out[key]) ? out[key] : {}, sourceValue);
		} else {
			out[key] = sourceValue;
		}
	}
	return out as T;
};
