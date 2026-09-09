import { describe, expect, it } from '@jest/globals';
import { TextMatchMode } from '@openvidu-meet/typings';
import type { z } from 'zod';
import { RecordingFiltersSchema } from '../../../src/models/zod-schemas/recording.schema.js';
import { RoomMemberFiltersSchema } from '../../../src/models/zod-schemas/room-member.schema.js';
import { RoomFiltersSchema } from '../../../src/models/zod-schemas/room.schema.js';
import { UserFiltersSchema } from '../../../src/models/zod-schemas/user.schema.js';

const issueFor = (schema: z.ZodType, input: Record<string, unknown>, field: string): string | undefined => {
	const result = schema.safeParse(input);

	if (result.success) {
		return undefined;
	}

	return result.error.issues.find((issue) => issue.path.join('.') === field)?.message;
};

describe.each([
	['rooms', RoomFiltersSchema as z.ZodType, 'roomName', 'roomNameMatchMode'],
	['recordings', RecordingFiltersSchema as z.ZodType, 'roomName', 'roomNameMatchMode'],
	['room members', RoomMemberFiltersSchema as z.ZodType, 'name', 'nameMatchMode'],
	['users', UserFiltersSchema as z.ZodType, 'name', 'nameMatchMode']
])('%s list filter in regex mode', (_domain, schema, field, modeField) => {
	const withPattern = (pattern: string) => ({ [field]: pattern, [modeField]: TextMatchMode.REGEX });

	it('accepts a pattern the datastore can evaluate', () => {
		expect(issueFor(schema, withPattern('^team-.*'), field)).toBeUndefined();
	});

	it('rejects a quantifier above the PCRE ceiling MongoDB compiles the pattern with', () => {
		expect(issueFor(schema, withPattern('a{1000000}'), field)).toBe(
			'Regular expression quantifiers cannot exceed 65535'
		);
	});

	it('rejects a pattern longer than any name it could match', () => {
		expect(issueFor(schema, withPattern('a'.repeat(101)), field)).toBe(
			'Regular expression pattern cannot exceed 100 characters'
		);
	});

	it('rejects a pattern that does not compile', () => {
		expect(issueFor(schema, withPattern('('), field)).toBe('Invalid regular expression pattern');
	});
});
