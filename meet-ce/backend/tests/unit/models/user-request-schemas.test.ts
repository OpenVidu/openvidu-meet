import { beforeAll, describe, expect, it } from '@jest/globals';
import type { z } from 'zod';
import { configureZodErrorMessages } from '../../../src/config/zod-config.js';
import { LoginReqSchema, TokenMetadataSchema } from '../../../src/models/zod-schemas/auth.schema.js';
import {
	BulkDeleteUsersReqSchema,
	ChangePasswordReqSchema,
	ResetUserPasswordReqSchema,
	UpdateUserRoleReqSchema,
	UserFiltersSchema,
	UserOptionsSchema
} from '../../../src/models/zod-schemas/user.schema.js';

const issues = (schema: z.ZodType, input: unknown): string[] => {
	const result = schema.safeParse(input);

	if (result.success) {
		return [];
	}

	return result.error.issues.map(({ path, message }) =>
		path.length > 0 ? `${path.join('.')}: ${message}` : message
	);
};

beforeAll(() => {
	configureZodErrorMessages();
});

describe('UserOptionsSchema', () => {
	const user = (overrides: Record<string, unknown> = {}) => ({
		userId: 'alice_1',
		name: 'Alice',
		role: 'room_manager',
		password: 'secret',
		...overrides
	});

	it('accepts a user and returns it as given', () => {
		expect(UserOptionsSchema.parse(user())).toEqual(user());
	});

	it('accepts a user id of 5 to 20 characters', () => {
		expect(issues(UserOptionsSchema, user({ userId: 'a'.repeat(5) }))).toEqual([]);
		expect(issues(UserOptionsSchema, user({ userId: 'a'.repeat(20) }))).toEqual([]);
		expect(issues(UserOptionsSchema, user({ userId: 'a1_' + 'b'.repeat(17) }))).toEqual([]);
	});

	it('rejects a user id outside 5 to 20 characters', () => {
		expect(issues(UserOptionsSchema, user({ userId: 'a'.repeat(4) }))).toEqual([
			'userId: userId must be at least 5 characters long'
		]);
		expect(issues(UserOptionsSchema, user({ userId: 'a'.repeat(21) }))).toEqual([
			'userId: userId cannot exceed 20 characters'
		]);
	});

	it.each(['Alice1', 'alice 1', 'alice-1', 'alice.1', 'alicé1', 'alice!'])('rejects the user id %p', (userId) => {
		expect(issues(UserOptionsSchema, user({ userId }))).toEqual([
			'userId: userId must contain only lowercase letters, numbers, and underscores'
		]);
	});

	it('accepts a name of 1 to 50 characters', () => {
		expect(issues(UserOptionsSchema, user({ name: 'a' }))).toEqual([]);
		expect(issues(UserOptionsSchema, user({ name: 'a'.repeat(50) }))).toEqual([]);
	});

	it('rejects an empty name and a name over 50 characters', () => {
		expect(issues(UserOptionsSchema, user({ name: '' }))).toEqual(['name: name is required and cannot be empty']);
		expect(issues(UserOptionsSchema, user({ name: 'a'.repeat(51) }))).toEqual([
			'name: name cannot exceed 50 characters'
		]);
	});

	it('accepts a password of 5 characters and rejects 4', () => {
		expect(issues(UserOptionsSchema, user({ password: '12345' }))).toEqual([]);
		expect(issues(UserOptionsSchema, user({ password: '1234' }))).toEqual([
			'password: password must be at least 5 characters long'
		]);
	});

	it('requires every field', () => {
		expect(issues(UserOptionsSchema, {})).toEqual([
			'userId: Required',
			'name: Required',
			'role: Required',
			'password: Required'
		]);
	});

	it('rejects a role that does not exist', () => {
		expect(issues(UserOptionsSchema, user({ role: 'root' }))).toEqual([
			"role: Invalid enum value. Expected 'admin' | 'room_manager' | 'room_member', received 'root'"
		]);
	});
});

describe('UserFiltersSchema', () => {
	const parse = (input: Record<string, unknown>) => UserFiltersSchema.parse(input);

	it('fills the defaults when nothing is filtered', () => {
		expect(parse({})).toEqual({
			nameCaseInsensitive: false,
			maxItems: 10,
			sortField: 'registrationDate',
			sortOrder: 'desc'
		});
	});

	it('keeps the filters as given', () => {
		expect(
			parse({
				userId: 'alice',
				name: 'Alice',
				nameMatchMode: 'prefix',
				nameCaseInsensitive: 'true',
				role: 'admin',
				nextPageToken: 'token',
				sortField: 'name',
				sortOrder: 'asc'
			})
		).toEqual({
			userId: 'alice',
			name: 'Alice',
			nameMatchMode: 'prefix',
			nameCaseInsensitive: true,
			role: 'admin',
			nextPageToken: 'token',
			maxItems: 10,
			sortField: 'name',
			sortOrder: 'asc'
		});
	});

	it.each([
		['true', true],
		['TRUE', true],
		['false', false],
		['False', false],
		[true, true],
		[false, false]
	])('reads nameCaseInsensitive %p as %p', (value, expected) => {
		expect(parse({ nameCaseInsensitive: value }).nameCaseInsensitive).toBe(expected);
	});

	it('rejects a nameCaseInsensitive that is neither true nor false', () => {
		expect(issues(UserFiltersSchema, { nameCaseInsensitive: 'yes' })).toEqual([
			'nameCaseInsensitive: Expected boolean, received string'
		]);
	});

	it.each([
		['25', 25],
		['99.9', 99],
		['0.5', 1],
		['100', 100],
		['101', 100],
		['5000', 100]
	])('reads maxItems %p as %p', (value, expected) => {
		expect(parse({ maxItems: value }).maxItems).toBe(expected);
	});

	it.each(['0', '-1', ''])('rejects maxItems %p as not positive', (value) => {
		expect(issues(UserFiltersSchema, { maxItems: value })).toEqual([
			'maxItems: maxItems must be a positive number'
		]);
	});

	it('rejects a role, a sort field, a sort order and a match mode that do not exist', () => {
		expect(issues(UserFiltersSchema, { role: 'root' })).toEqual([
			"role: Invalid enum value. Expected 'admin' | 'room_manager' | 'room_member', received 'root'"
		]);
		expect(issues(UserFiltersSchema, { sortField: 'role' })).toEqual([
			"sortField: Invalid enum value. Expected 'name' | 'registrationDate', received 'role'"
		]);
		expect(issues(UserFiltersSchema, { sortOrder: 'up' })).toEqual([
			"sortOrder: Invalid enum value. Expected 'asc' | 'desc', received 'up'"
		]);
		expect(issues(UserFiltersSchema, { nameMatchMode: 'fuzzy' })).toEqual([
			"nameMatchMode: Invalid enum value. Expected 'exact' | 'prefix' | 'partial' | 'regex', received 'fuzzy'"
		]);
	});

	it('validates the name pattern only in regex mode and only when there is one', () => {
		expect(issues(UserFiltersSchema, { name: '(', nameMatchMode: 'regex' })).toEqual([
			'name: Invalid regular expression pattern'
		]);
		expect(issues(UserFiltersSchema, { name: '(', nameMatchMode: 'partial' })).toEqual([]);
		expect(issues(UserFiltersSchema, { name: '(' })).toEqual([]);
		expect(issues(UserFiltersSchema, { nameMatchMode: 'regex' })).toEqual([]);
		expect(issues(UserFiltersSchema, { name: '', nameMatchMode: 'regex' })).toEqual([]);
	});
});

describe('BulkDeleteUsersReqSchema', () => {
	it('reads a comma-separated list, trimming each id and dropping the empty entries', () => {
		expect(BulkDeleteUsersReqSchema.parse({ userIds: ' a ,, b,' })).toEqual({ userIds: ['a', 'b'] });
	});

	it.each([
		['an empty string', ''],
		['only separators', ' , ,'],
		['a missing list', undefined],
		['an array', ['alice']],
		['a number', 5]
	])('rejects %s as having no user id', (_label, value) => {
		expect(issues(BulkDeleteUsersReqSchema, { userIds: value })).toEqual([
			'userIds: At least one userId is required'
		]);
	});
});

describe('password and role schemas', () => {
	it('ChangePasswordReqSchema requires the current password, whatever it is, and a new one of 5 characters', () => {
		expect(ChangePasswordReqSchema.parse({ currentPassword: '', newPassword: '12345' })).toEqual({
			currentPassword: '',
			newPassword: '12345'
		});
		expect(issues(ChangePasswordReqSchema, { currentPassword: 'old', newPassword: '1234' })).toEqual([
			'newPassword: New password must be at least 5 characters long'
		]);
		expect(issues(ChangePasswordReqSchema, {})).toEqual(['currentPassword: Required', 'newPassword: Required']);
	});

	it('ResetUserPasswordReqSchema requires a new password of 5 characters', () => {
		expect(ResetUserPasswordReqSchema.parse({ newPassword: '12345' })).toEqual({ newPassword: '12345' });
		expect(issues(ResetUserPasswordReqSchema, { newPassword: '1234' })).toEqual([
			'newPassword: New password must be at least 5 characters long'
		]);
		expect(issues(ResetUserPasswordReqSchema, {})).toEqual(['newPassword: Required']);
	});

	it('UpdateUserRoleReqSchema requires a role that exists', () => {
		expect(UpdateUserRoleReqSchema.parse({ role: 'room_member' })).toEqual({ role: 'room_member' });
		expect(issues(UpdateUserRoleReqSchema, { role: 'root' })).toEqual([
			"role: Invalid enum value. Expected 'admin' | 'room_manager' | 'room_member', received 'root'"
		]);
	});
});

describe('LoginReqSchema', () => {
	it('accepts credentials of 5 characters', () => {
		expect(LoginReqSchema.parse({ userId: '12345', password: '12345' })).toEqual({
			userId: '12345',
			password: '12345'
		});
	});

	it('rejects a user id and a password under 5 characters', () => {
		expect(issues(LoginReqSchema, { userId: '1234', password: '1234' })).toEqual([
			'userId: userId must be at least 5 characters long',
			'password: password must be at least 5 characters long'
		]);
		expect(issues(LoginReqSchema, {})).toEqual(['userId: Required', 'password: Required']);
	});
});

describe('TokenMetadataSchema', () => {
	it('keeps the fields of an access token', () => {
		expect(TokenMetadataSchema.parse({ iat: 1, tokenType: 'access', sid: 's', rid: 'r' })).toEqual({
			iat: 1,
			tokenType: 'access',
			sid: 's',
			rid: 'r'
		});
		expect(TokenMetadataSchema.parse({ iat: 1, tokenType: 'refresh' })).toEqual({ iat: 1, tokenType: 'refresh' });
		expect(TokenMetadataSchema.parse({ iat: 1, tokenType: 'temporary' }).tokenType).toBe('temporary');
	});

	it('requires the issue time and a token type that exists', () => {
		expect(issues(TokenMetadataSchema, {})).toEqual(['iat: Required', 'tokenType: Required']);
		expect(issues(TokenMetadataSchema, { iat: '1', tokenType: 'bearer' })).toEqual([
			'iat: Expected number, received string',
			"tokenType: Invalid enum value. Expected 'access' | 'refresh' | 'temporary', received 'bearer'"
		]);
	});
});
