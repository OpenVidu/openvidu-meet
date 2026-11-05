import { beforeAll, describe, expect, it } from '@jest/globals';
import type { z } from 'zod';
import { configureZodErrorMessages } from '../../../src/config/zod-config.js';
import {
	BulkDeleteRoomMembersReqSchema,
	mergeMemberHeaderFieldsIntoQuery,
	RoomMemberFiltersSchema,
	RoomMemberHeaderFieldsSchema,
	RoomMemberOptionsSchema,
	RoomMemberQueryFieldsSchema,
	UpdateRoomMemberReqSchema
} from '../../../src/models/zod-schemas/room-member.schema.js';

const issues = (schema: z.ZodType, input: unknown): string[] => {
	const result = schema.safeParse(input);

	if (result.success) {
		return [];
	}

	return result.error.issues.map(({ path, message }) =>
		path.length > 0 ? `${path.join('.')}: ${message}` : message
	);
};

const bothOrNeither = 'userId: Either userId or name must be provided, but not both';

beforeAll(() => {
	configureZodErrorMessages();
});

describe('RoomMemberOptionsSchema', () => {
	const parse = (input: Record<string, unknown>) => RoomMemberOptionsSchema.parse(input);

	it('accepts a member identified by a user id', () => {
		expect(parse({ userId: 'alice_1', baseRole: 'moderator' })).toEqual({
			userId: 'alice_1',
			baseRole: 'moderator'
		});
	});

	it('accepts a member identified by a name', () => {
		expect(parse({ name: 'Guest One', baseRole: 'speaker' })).toEqual({ name: 'Guest One', baseRole: 'speaker' });
	});

	it('rejects a member with both a user id and a name, or with neither', () => {
		expect(issues(RoomMemberOptionsSchema, { userId: 'alice', name: 'Alice', baseRole: 'speaker' })).toEqual([
			bothOrNeither
		]);
		expect(issues(RoomMemberOptionsSchema, { baseRole: 'speaker' })).toEqual([bothOrNeither]);
	});

	it('treats an empty user id as no user id', () => {
		expect(issues(RoomMemberOptionsSchema, { userId: '', baseRole: 'speaker' })).toEqual([
			'userId: userId must contain only lowercase letters, numbers, and underscores',
			bothOrNeither
		]);
	});

	it('requires a base role that exists', () => {
		expect(issues(RoomMemberOptionsSchema, { userId: 'alice' })).toEqual(['baseRole: Required']);
		expect(issues(RoomMemberOptionsSchema, { userId: 'alice', baseRole: 'owner' })).toEqual([
			"baseRole: Invalid enum value. Expected 'moderator' | 'speaker', received 'owner'"
		]);
	});

	it('rejects a user id with characters other than lowercase letters, digits and underscores', () => {
		for (const userId of ['Alice', 'a b', 'a-b', 'alice!', 'aliçe']) {
			expect(issues(RoomMemberOptionsSchema, { userId, baseRole: 'speaker' })).toEqual([
				'userId: userId must contain only lowercase letters, numbers, and underscores'
			]);
		}
	});

	it('accepts a name of 1 to 50 characters', () => {
		expect(parse({ name: 'a', baseRole: 'speaker' }).name).toBe('a');
		expect(parse({ name: 'a'.repeat(50), baseRole: 'speaker' }).name).toBe('a'.repeat(50));
	});

	it('rejects an empty name and a name over 50 characters', () => {
		expect(issues(RoomMemberOptionsSchema, { name: '', baseRole: 'speaker' })).toEqual([
			'name: name cannot be empty',
			bothOrNeither
		]);
		expect(issues(RoomMemberOptionsSchema, { name: 'a'.repeat(51), baseRole: 'speaker' })).toEqual([
			'name: name cannot exceed 50 characters'
		]);
	});

	it('normalizes the custom permissions to the current names, without completing them', () => {
		expect(
			parse({ userId: 'alice', baseRole: 'speaker', customPermissions: { canRecord: true, chatWrite: false } })
				.customPermissions
		).toEqual({ recordingControl: true, chatWrite: false });
	});

	it('rejects custom permissions that contradict themselves or are not booleans', () => {
		expect(
			issues(RoomMemberOptionsSchema, {
				userId: 'alice',
				baseRole: 'speaker',
				customPermissions: { canKickParticipants: true, participantKick: false }
			})
		).toEqual([expect.stringMatching(/^customPermissions\.canKickParticipants: Conflicting values/)]);
		expect(
			issues(RoomMemberOptionsSchema, {
				userId: 'alice',
				baseRole: 'speaker',
				customPermissions: { chatRead: 'yes' }
			})
		).toEqual(['customPermissions.chatRead: Expected boolean, received string']);
	});
});

describe('UpdateRoomMemberReqSchema', () => {
	it('accepts a body that changes nothing', () => {
		expect(UpdateRoomMemberReqSchema.parse({})).toEqual({});
	});

	it('accepts a base role and normalized custom permissions', () => {
		expect(
			UpdateRoomMemberReqSchema.parse({ baseRole: 'moderator', customPermissions: { canEndMeeting: true } })
		).toEqual({ baseRole: 'moderator', customPermissions: { meetingEnd: true } });
	});

	it('rejects a base role that does not exist', () => {
		expect(issues(UpdateRoomMemberReqSchema, { baseRole: 'owner' })).toEqual([
			"baseRole: Invalid enum value. Expected 'moderator' | 'speaker', received 'owner'"
		]);
	});
});

describe('RoomMemberFiltersSchema', () => {
	const parse = (input: Record<string, unknown>) => RoomMemberFiltersSchema.parse(input);

	it('fills the defaults when nothing is filtered', () => {
		expect(parse({})).toEqual({
			nameCaseInsensitive: false,
			maxItems: 10,
			sortField: 'membershipDate',
			sortOrder: 'desc'
		});
	});

	it('keeps the filters as given', () => {
		expect(
			parse({
				name: 'Alice',
				nameMatchMode: 'partial',
				nameCaseInsensitive: 'true',
				baseRole: 'speaker',
				type: 'identified_guest',
				nextPageToken: 'token',
				sortField: 'name',
				sortOrder: 'asc'
			})
		).toEqual({
			name: 'Alice',
			nameMatchMode: 'partial',
			nameCaseInsensitive: true,
			baseRole: 'speaker',
			type: 'identified_guest',
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
		expect(issues(RoomMemberFiltersSchema, { nameCaseInsensitive: 'yes' })).toEqual([
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
		expect(issues(RoomMemberFiltersSchema, { maxItems: value })).toEqual([
			'maxItems: maxItems must be a positive number'
		]);
	});

	it('rejects a base role, a type, a sort field, a sort order and a match mode that do not exist', () => {
		expect(issues(RoomMemberFiltersSchema, { baseRole: 'owner' })).toEqual([
			"baseRole: Invalid enum value. Expected 'moderator' | 'speaker', received 'owner'"
		]);
		expect(issues(RoomMemberFiltersSchema, { type: 'bot' })).toEqual([
			"type: Invalid enum value. Expected 'user' | 'identified_guest', received 'bot'"
		]);
		expect(issues(RoomMemberFiltersSchema, { sortField: 'type' })).toEqual([
			"sortField: Invalid enum value. Expected 'name' | 'membershipDate', received 'type'"
		]);
		expect(issues(RoomMemberFiltersSchema, { sortOrder: 'up' })).toEqual([
			"sortOrder: Invalid enum value. Expected 'asc' | 'desc', received 'up'"
		]);
		expect(issues(RoomMemberFiltersSchema, { nameMatchMode: 'fuzzy' })).toEqual([
			"nameMatchMode: Invalid enum value. Expected 'exact' | 'prefix' | 'partial' | 'regex', received 'fuzzy'"
		]);
	});

	it('keeps the base fields asked for, once each, and leaves the extra field to extraFields', () => {
		expect(parse({ fields: 'memberId, name,memberId,effectivePermissions,bogus' }).fields).toEqual([
			'memberId',
			'name'
		]);
		expect(parse({ fields: 'effectivePermissions,bogus, ,' }).fields).toBeUndefined();
		expect(parse({ fields: '' }).fields).toBeUndefined();
	});

	it('keeps the extra fields asked for and ignores every other name', () => {
		expect(parse({ extraFields: ' effectivePermissions,memberId,bogus' }).extraFields).toEqual([
			'effectivePermissions'
		]);
		expect(parse({ extraFields: 'memberId' }).extraFields).toBeUndefined();
		expect(parse({ extraFields: '' }).extraFields).toBeUndefined();
	});

	it('validates the name pattern only in regex mode and only when there is one', () => {
		expect(issues(RoomMemberFiltersSchema, { name: '(', nameMatchMode: 'regex' })).toEqual([
			'name: Invalid regular expression pattern'
		]);
		expect(issues(RoomMemberFiltersSchema, { name: '(', nameMatchMode: 'prefix' })).toEqual([]);
		expect(issues(RoomMemberFiltersSchema, { name: '(' })).toEqual([]);
		expect(issues(RoomMemberFiltersSchema, { nameMatchMode: 'regex' })).toEqual([]);
		expect(issues(RoomMemberFiltersSchema, { name: '', nameMatchMode: 'regex' })).toEqual([]);
	});
});

describe('room member field selection', () => {
	it('RoomMemberQueryFieldsSchema reads fields and extraFields', () => {
		expect(
			RoomMemberQueryFieldsSchema.parse({
				fields: 'memberId,effectivePermissions',
				extraFields: 'effectivePermissions'
			})
		).toEqual({
			fields: ['memberId'],
			extraFields: ['effectivePermissions']
		});
		expect(RoomMemberQueryFieldsSchema.parse({})).toEqual({});
	});

	it('RoomMemberHeaderFieldsSchema reads the X-Fields and X-ExtraFields headers', () => {
		expect(
			RoomMemberHeaderFieldsSchema.parse({
				'x-fields': 'memberId,effectivePermissions',
				'x-extrafields': 'effectivePermissions,bogus'
			})
		).toEqual({ 'x-fields': ['memberId'], 'x-extrafields': ['effectivePermissions'] });
		expect(issues(RoomMemberHeaderFieldsSchema, { 'x-extrafields': 5 })).toEqual([
			'x-extrafields: Expected string, received number'
		]);
	});

	describe('mergeMemberHeaderFieldsIntoQuery', () => {
		const merge = (headers: Record<string, unknown>, query: Record<string, unknown>) => {
			mergeMemberHeaderFieldsIntoQuery(headers, query);
			return query;
		};

		it('adds the fields of the headers to those of the query, once each', () => {
			expect(merge({ 'x-fields': 'name,memberId,bogus' }, { fields: ' memberId ,, roomId' })).toEqual({
				fields: 'memberId,roomId,name'
			});
			expect(merge({ 'x-extrafields': 'effectivePermissions' }, { extraFields: 'x, ,' })).toEqual({
				extraFields: 'x,effectivePermissions'
			});
		});

		it('sets the fields when the query has none', () => {
			expect(merge({ 'x-fields': 'memberId' }, {})).toEqual({ fields: 'memberId' });
			expect(merge({ 'x-extrafields': 'effectivePermissions' }, {})).toEqual({
				extraFields: 'effectivePermissions'
			});
			expect(
				merge(
					{ 'x-fields': 'memberId', 'x-extrafields': 'effectivePermissions' },
					{ fields: ['x'], extraFields: 7 }
				)
			).toEqual({ fields: 'memberId', extraFields: 'effectivePermissions' });
		});

		it('leaves the query alone when the headers name no usable field', () => {
			expect(merge({ 'x-fields': 'bogus', 'x-extrafields': 'memberId' }, { fields: 'name' })).toEqual({
				fields: 'name'
			});
			expect(merge({}, { fields: 'name' })).toEqual({ fields: 'name' });
		});

		it('ignores both headers when either one is not a string', () => {
			expect(merge({ 'x-fields': 5, 'x-extrafields': 'effectivePermissions' }, {})).toEqual({});
			expect(merge({ 'x-fields': 'memberId', 'x-extrafields': ['x'] }, {})).toEqual({});
		});
	});
});

describe('BulkDeleteRoomMembersReqSchema', () => {
	const memberIds = (value: unknown) => BulkDeleteRoomMembersReqSchema.parse({ memberIds: value }).memberIds;

	it('reads a comma-separated list, trimming each id and dropping the empty entries', () => {
		expect(memberIds(' a ,, b,')).toEqual(['a', 'b']);
	});

	it.each([
		['an empty string', ''],
		['only separators', ' , ,'],
		['a missing list', undefined],
		['an array', ['a']],
		['a number', 5]
	])('rejects %s as having no member id', (_label, value) => {
		expect(issues(BulkDeleteRoomMembersReqSchema, { memberIds: value })).toEqual([
			'memberIds: At least one memberId is required'
		]);
	});
});
