import { z } from 'zod';

/**
 * Reproduces zod 3's `getParsedType` so `invalid_type` messages keep reporting the same
 * received-type names the API has always returned. `typeof` is not enough: it collapses
 * `NaN` into `number` and both `null` and arrays into `object`, while the REST API
 * documents (and tests assert) `nan`, `null` and `array`.
 */
const parsedTypeOf = (input: unknown): string => {
	switch (typeof input) {
		case 'number':
			return Number.isNaN(input) ? 'nan' : 'number';
		case 'object':
			if (input === null) {
				return 'null';
			}

			if (Array.isArray(input)) {
				return 'array';
			}

			if (input instanceof Date) {
				return 'date';
			}

			if (input instanceof Map) {
				return 'map';
			}

			if (input instanceof Set) {
				return 'set';
			}

			return 'object';
		default:
			return typeof input;
	}
};

/**
 * Renders a rejected value for the `received '<value>'` part of an enum message. Primitives
 * are shown verbatim (`received 'bogus'`); anything else falls back to its type name, since
 * interpolating an object would only ever yield a useless `[object Object]`.
 */
const displayValueOf = (input: unknown): string => {
	if (input !== null && (typeof input === 'object' || typeof input === 'function')) {
		return parsedTypeOf(input);
	}

	return String(input);
};

/**
 * Restores zod 3's validation-error wording on top of zod 4.
 *
 * zod 4 reworded every built-in issue message, which leaks straight into the `details[]`
 * of every `422 Unprocessable Entity` response (see `rejectUnprocessableRequest`) and is
 * therefore part of the public REST API's observable behaviour. Two changes mattered:
 *
 * 1. Wording: `Invalid enum value` became `Invalid option: expected one of ...`, and
 *    `Expected boolean, received string` became `Invalid input: expected boolean, ...`.
 * 2. Semantics: for **enum** fields zod 4 reports a missing property with the exact same
 *    code (`invalid_value`) and message as an out-of-range value, so API clients could no
 *    longer tell "you omitted this field" from "you sent a bad value". zod 3 answered
 *    `Required` for the former.
 *
 * Only zod's own `invalid_type` / `invalid_value` messages are rewritten. `custom` issues
 * must fall through untouched: unlike a `.refine()` message (which wins over the global
 * error map), a message passed to `ctx.addIssue()` LOSES to it, so rewriting them here
 * would clobber messages like 'Invalid regular expression pattern'.
 *
 * Messages set explicitly on a schema or check (`z.string().min(1, 'owner cannot be
 * empty')`, `z.url('Must be a valid URL')`, `.refine(..., { message })`) always take
 * precedence over this map and are unaffected.
 *
 * Must run before the first request is parsed; the error map is consulted at parse time,
 * so schemas built at import time are covered regardless of module evaluation order.
 */
export const configureZodErrorMessages = (): void => {
	z.config({
		customError: (issue) => {
			if (issue.code !== 'invalid_type' && issue.code !== 'invalid_value') {
				return undefined;
			}

			if (issue.input === undefined) {
				return 'Required';
			}

			if (issue.code === 'invalid_value') {
				const expected = (issue.values ?? []).map((value) => `'${String(value)}'`).join(' | ');
				return `Invalid enum value. Expected ${expected}, received '${displayValueOf(issue.input)}'`;
			}

			return `Expected ${issue.expected}, received ${parsedTypeOf(issue.input)}`;
		}
	});
};
