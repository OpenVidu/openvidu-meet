import { beforeAll, describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { configureZodErrorMessages } from '../../../src/config/zod-config.js';
import { AppearanceConfigSchema, RoomFiltersSchema } from '../../../src/models/zod-schemas/room.schema.js';
import { SecurityConfigSchema, TestWebhookReqSchema } from '../../../src/models/zod-schemas/global-config.schema.js';
import {
	UpdateUserRoleReqSchema,
	UserFiltersSchema,
	UserOptionsSchema
} from '../../../src/models/zod-schemas/user.schema.js';

/**
 * Guards the wording of the validation errors the REST API returns in `details[]` of a
 * `422 Unprocessable Entity` (see `rejectUnprocessableRequest`). zod 4's default messages
 * differ from the ones this API has always returned, and `src/config/zod-config.ts` maps
 * them back — a zod upgrade that changes issue codes or shapes would silently alter public
 * API output, so it is pinned here rather than only in the integration suites (which need a
 * live MongoDB/Redis/LiveKit/S3 deployment; zod schemas parse in memory and need nothing).
 *
 * Only `message` is asserted because `field` + `message` is all the 422 response exposes —
 * zod's internal issue `code` is never surfaced to clients.
 */
describe('Validation error messages (public 422 contract)', () => {
	beforeAll(() => {
		// Installed at boot by models/error.model.ts; unit tests apply it explicitly to avoid
		// pulling the DI container in just for its side effect.
		configureZodErrorMessages();
	});

	/** First message for `field`, or the first message overall when the field validated fine. */
	const messageFor = (schema: z.ZodType, input: unknown, field: string): string => {
		const result = schema.safeParse(input);

		if (result.success) {
			throw new Error(`Expected '${field}' to fail validation, but parsing succeeded`);
		}

		const issue = result.error.issues.find((candidate) => candidate.path.join('.') === field);

		if (!issue) {
			const seen = result.error.issues.map((candidate) => candidate.path.join('.')).join(', ');
			throw new Error(`No issue reported for '${field}' (got issues for: ${seen})`);
		}

		return issue.message;
	};

	describe('a missing property answers "Required"', () => {
		it('for a string property', () => {
			expect(messageFor(UserOptionsSchema, {}, 'userId')).toBe('Required');
		});

		it('for an enum property', () => {
			// The reason the error map exists: zod 4 reports a missing enum with the very same
			// message as an out-of-range one, which loses the "you omitted this" signal.
			expect(messageFor(UpdateUserRoleReqSchema, {}, 'role')).toBe('Required');
		});

		it('for a nested property', () => {
			const input = { appearance: { themes: [{ name: 'theme', enabled: true }] } };
			expect(messageFor(AppearanceConfigSchema, input.appearance, 'themes.0.baseTheme')).toBe('Required');
		});
	});

	describe('a rejected value reports its expected and received type', () => {
		it('names the enum options it expected', () => {
			expect(
				messageFor(
					AppearanceConfigSchema,
					{ themes: [{ name: 't', enabled: true, baseTheme: 'nope' }] },
					'themes.0.baseTheme'
				)
			).toBe("Invalid enum value. Expected 'light' | 'dark', received 'nope'");
		});

		it('reports a string sent for a boolean', () => {
			expect(messageFor(UserFiltersSchema, { nameCaseInsensitive: 'notabool' }, 'nameCaseInsensitive')).toBe(
				'Expected boolean, received string'
			);
		});

		it('reports a string sent for an array', () => {
			expect(
				messageFor(
					SecurityConfigSchema,
					{ authentication: { oauthProviders: 'x' } },
					'authentication.oauthProviders'
				)
			).toBe('Expected array, received string');
		});

		it('reports "nan" rather than "number" for an uncoercible number', () => {
			// z.coerce.number() turns 'abc' into NaN, whose `typeof` is misleadingly 'number'.
			expect(messageFor(RoomFiltersSchema, { maxItems: 'abc' }, 'maxItems')).toBe(
				'Expected number, received nan'
			);
		});

		it.each([
			['null', null, 'Expected string, received null'],
			['an array', ['a'], 'Expected string, received array'],
			['an object', { a: 1 }, 'Expected string, received object'],
			['a number', 7, 'Expected string, received number'],
			['a boolean', true, 'Expected string, received boolean']
		])('reports %s sent for a string', (_label, value, expected) => {
			expect(messageFor(z.object({ s: z.string() }), { s: value }, 's')).toBe(expected);
		});
	});

	describe('a missing property is distinguishable from a rejected one', () => {
		it.each([
			['enum', z.object({ f: z.enum(['a', 'b']) }), 'zzz'],
			['string', z.object({ f: z.string() }), 1],
			['boolean', z.object({ f: z.boolean() }), 'x'],
			['number', z.object({ f: z.number() }), 'x']
		])('for a %s property', (_label, schema, rejectedValue) => {
			const missing = messageFor(schema, {}, 'f');
			const rejected = messageFor(schema, { f: rejectedValue }, 'f');

			expect(missing).toBe('Required');
			expect(rejected).not.toBe(missing);
		});
	});

	describe('messages defined by a schema are never overridden', () => {
		it('keeps a ctx.addIssue message', () => {
			// The subtle one: unlike a .refine() message, an addIssue message LOSES to the global
			// error map, so zod-config.ts must leave `custom` issues alone.
			const input = { roomNameMatchMode: 'regex', roomName: '[' };
			expect(messageFor(RoomFiltersSchema, input, 'roomName')).toBe('Invalid regular expression pattern');
		});

		it('keeps a .refine message', () => {
			const schema = z.object({
				f: z.string().refine((value) => value === 'ok', { message: 'must be ok' })
			});
			expect(messageFor(schema, { f: 'no' }, 'f')).toBe('must be ok');
		});

		it('keeps a .min message', () => {
			const input = { userId: 'ab', name: 'Name', role: 'admin', password: 'password' };
			expect(messageFor(UserOptionsSchema, input, 'userId')).toBe('userId must be at least 5 characters long');
		});

		it('keeps a .regex message', () => {
			const input = { userId: 'ABCDEF', name: 'Name', role: 'admin', password: 'password' };
			expect(messageFor(UserOptionsSchema, input, 'userId')).toBe(
				'userId must contain only lowercase letters, numbers, and underscores'
			);
		});

		it('keeps a z.url message', () => {
			expect(messageFor(TestWebhookReqSchema, { url: 'not a url' }, 'url')).toBe('Must be a valid URL');
		});

		it('keeps a schema-level error message', () => {
			const schema = z.object({ f: z.string({ error: 'custom schema error' }) });
			expect(messageFor(schema, { f: 1 }, 'f')).toBe('custom schema error');
		});
	});
});
