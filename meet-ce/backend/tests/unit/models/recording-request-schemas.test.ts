import { beforeAll, describe, expect, it } from '@jest/globals';
import { MeetRecordingLayout, MeetRecordingStatus, TextMatchMode } from '@openvidu-meet/typings';
import type { z } from 'zod';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { configureZodErrorMessages } from '../../../src/config/zod-config.js';
import {
	BulkDeleteRecordingsReqSchema,
	GetRecordingMediaReqSchema,
	GetRecordingReqSchema,
	GetRecordingUrlReqSchema,
	RecordingFiltersSchema,
	RecordingIdParamSchema,
	RecordingQueryFieldsSchema,
	StartRecordingReqSchema,
	StopRecordingReqSchema
} from '../../../src/models/zod-schemas/recording.schema.js';

const issues = (schema: z.ZodType, input: unknown): string[] => {
	const result = schema.safeParse(input);

	if (result.success) {
		return [];
	}

	return result.error.issues.map(({ path, message }) =>
		path.length > 0 ? `${path.join('.')}: ${message}` : message
	);
};

const recordingId = (roomId = 'room-1') => `${roomId}--EG_abc--uid1`;

beforeAll(() => {
	configureZodErrorMessages();
});

describe('RecordingIdParamSchema', () => {
	const parse = (value: unknown) => RecordingIdParamSchema.parse(value);

	it('accepts an id of the form roomId--EG_xxx--uid and returns it unchanged', () => {
		expect(parse(recordingId())).toBe('room-1--EG_abc--uid1');
	});

	it('trims the surrounding whitespace', () => {
		expect(parse(`  ${recordingId()}\t`)).toBe('room-1--EG_abc--uid1');
	});

	it('strips the characters a room id cannot hold from the room part', () => {
		expect(parse('ro om!/1--EG_abc--uid1')).toBe('room1--EG_abc--uid1');
	});

	it('leaves the other parts as they are', () => {
		expect(parse('room--EG_a b!--ui d')).toBe('room--EG_a b!--ui d');
	});

	it('rejects a room part that is not a valid room id once sanitized', () => {
		expect(issues(RecordingIdParamSchema, '!!!--EG_abc--uid1')).toEqual([
			'recordingId does not follow the expected format'
		]);
		expect(issues(RecordingIdParamSchema, `${'a'.repeat(101)}--EG_abc--uid1`)).toEqual([
			'recordingId does not follow the expected format'
		]);
	});

	it.each(['room--EG_--uid1', 'room--eg_abc--uid1', 'room--EG_abc--', 'room--EG_abc--uid1--extra'])(
		'rejects %j for not following the format',
		(value) => {
			expect(issues(RecordingIdParamSchema, value)).toEqual(['recordingId does not follow the expected format']);
		}
	);

	it('accepts a room part of exactly 100 characters', () => {
		const roomId = 'a'.repeat(100);

		expect(parse(recordingId(roomId))).toBe(`${roomId}--EG_abc--uid1`);
	});

	it('rejects an empty id', () => {
		expect(issues(RecordingIdParamSchema, '')).toEqual(['recordingId is required and cannot be empty']);
	});

	it('rejects an id that is only whitespace', () => {
		expect(issues(RecordingIdParamSchema, '   ')).toEqual(['recordingId cannot be empty after sanitization']);
	});

	it('names the field it was given in the messages', () => {
		expect(issues(RecordingIdParamSchema, 'x')).toEqual(['recordingId does not follow the expected format']);
	});

	it.each([
		['one part', 'room-1'],
		['two parts', 'room-1--EG_abc'],
		['four parts', 'room-1--EG_abc--uid--extra'],
		['an empty room part', '--EG_abc--uid1'],
		['an egress part without the EG_ prefix', 'room-1--XX_abc--uid1'],
		['an egress part that only repeats the prefix', 'room-1--EG_--uid1'],
		['an egress part with the prefix not at the start', 'room-1--xEG_abc--uid1'],
		['an empty uid part', 'room-1--EG_abc--']
	])('rejects an id with %s', (_label, value) => {
		expect(issues(RecordingIdParamSchema, value)).toEqual(['recordingId does not follow the expected format']);
	});

	it('accepts an egress part of one character after the prefix', () => {
		expect(parse('room-1--EG_a--u')).toBe('room-1--EG_a--u');
	});

	it('rejects a value that is not a string', () => {
		expect(issues(RecordingIdParamSchema, 5)).toEqual(['Expected string, received number']);
		expect(issues(RecordingIdParamSchema, undefined)).toEqual(['Required']);
	});
});

describe('StartRecordingReqSchema', () => {
	it('accepts a body naming only the room', () => {
		expect(StartRecordingReqSchema.parse({ roomId: 'room-1' })).toEqual({ roomId: 'room-1' });
	});

	it('sanitizes the room id', () => {
		expect(StartRecordingReqSchema.parse({ roomId: 'ro om!1' })).toEqual({ roomId: 'room1' });
	});

	it('requires the room id', () => {
		expect(issues(StartRecordingReqSchema, {})).toEqual(['roomId: Required']);
		expect(issues(StartRecordingReqSchema, { roomId: '' })).toEqual([
			'roomId: roomId is required and cannot be empty'
		]);
	});

	it('accepts a layout and an encoding preset or options in the config', () => {
		expect(
			StartRecordingReqSchema.parse({
				roomId: 'room-1',
				config: { layout: MeetRecordingLayout.SINGLE_SPEAKER, encoding: 'H264_1080P_60' }
			})
		).toEqual({ roomId: 'room-1', config: { layout: 'single-speaker', encoding: 'H264_1080P_60' } });
		expect(StartRecordingReqSchema.parse({ roomId: 'room-1', config: {} })).toEqual({
			roomId: 'room-1',
			config: {}
		});
	});

	it('rejects a layout that does not exist', () => {
		expect(issues(StartRecordingReqSchema, { roomId: 'room-1', config: { layout: 'mosaic' } })).toEqual([
			"config.layout: Invalid enum value. Expected 'grid' | 'speaker' | 'single-speaker', received 'mosaic'"
		]);
	});

	it('rejects an encoding preset that does not exist', () => {
		expect(issues(StartRecordingReqSchema, { roomId: 'room-1', config: { encoding: 'H264_8K' } })).toEqual([
			expect.stringContaining('Invalid encoding preset. Must be one of: H264_720P_30')
		]);
	});
});

describe('RecordingFiltersSchema', () => {
	const parse = (input: Record<string, unknown>) => RecordingFiltersSchema.parse(input);

	it('fills the defaults when nothing is filtered', () => {
		expect(parse({})).toEqual({
			roomNameCaseInsensitive: false,
			maxItems: 10,
			sortField: 'startDate',
			sortOrder: 'desc'
		});
	});

	it('keeps the text filters and the page token as given', () => {
		expect(
			parse({
				roomId: 'room-1',
				roomName: 'Standup',
				roomNameMatchMode: TextMatchMode.PREFIX,
				status: MeetRecordingStatus.COMPLETE,
				nextPageToken: 'token'
			})
		).toEqual({
			roomId: 'room-1',
			roomName: 'Standup',
			roomNameMatchMode: 'prefix',
			roomNameCaseInsensitive: false,
			status: 'complete',
			nextPageToken: 'token',
			maxItems: 10,
			sortField: 'startDate',
			sortOrder: 'desc'
		});
	});

	it('sanitizes the room id filter', () => {
		expect(parse({ roomId: 'ro om!1' }).roomId).toBe('room1');
	});

	it('rejects an empty room id filter', () => {
		expect(issues(RecordingFiltersSchema, { roomId: '' })).toEqual([
			'roomId: roomId is required and cannot be empty'
		]);
	});

	it.each([
		['true', true],
		['TRUE', true],
		['True', true],
		['false', false],
		['FALSE', false],
		[true, true],
		[false, false]
	])('reads roomNameCaseInsensitive %p as %p', (value, expected) => {
		expect(parse({ roomNameCaseInsensitive: value }).roomNameCaseInsensitive).toBe(expected);
	});

	it('rejects a roomNameCaseInsensitive that is neither true nor false', () => {
		expect(issues(RecordingFiltersSchema, { roomNameCaseInsensitive: 'yes' })).toEqual([
			'roomNameCaseInsensitive: Expected boolean, received string'
		]);
		expect(issues(RecordingFiltersSchema, { roomNameCaseInsensitive: 1 })).toEqual([
			'roomNameCaseInsensitive: Expected boolean, received number'
		]);
	});

	it.each([
		['25', 25],
		[25, 25],
		['1', 1],
		['99.9', 99],
		['0.5', 1],
		['100', 100],
		['101', 100],
		['100.5', 100],
		['5000', 100]
	])('reads maxItems %p as %p', (value, expected) => {
		expect(parse({ maxItems: value }).maxItems).toBe(expected);
	});

	it.each(['0', '-1', '', -5])('rejects maxItems %p as not positive', (value) => {
		expect(issues(RecordingFiltersSchema, { maxItems: value })).toEqual([
			'maxItems: maxItems must be a positive number'
		]);
	});

	it('rejects a maxItems that is not a number', () => {
		expect(issues(RecordingFiltersSchema, { maxItems: 'abc' })).toEqual([
			'maxItems: Expected number, received nan'
		]);
	});

	it('accepts every sort field and both sort orders', () => {
		for (const sortField of ['startDate', 'roomName', 'duration', 'size']) {
			expect(parse({ sortField, sortOrder: 'asc' })).toMatchObject({ sortField, sortOrder: 'asc' });
		}
	});

	it('rejects a sort field, a sort order, a status and a match mode that do not exist', () => {
		expect(issues(RecordingFiltersSchema, { sortField: 'bogus' })).toEqual([
			"sortField: Invalid enum value. Expected 'startDate' | 'roomName' | 'duration' | 'size', received 'bogus'"
		]);
		expect(issues(RecordingFiltersSchema, { sortOrder: 'up' })).toEqual([
			"sortOrder: Invalid enum value. Expected 'asc' | 'desc', received 'up'"
		]);
		expect(issues(RecordingFiltersSchema, { status: 'done' })).toEqual([
			expect.stringMatching(/^status: Invalid enum value\. Expected 'starting' \| 'active'/)
		]);
		expect(issues(RecordingFiltersSchema, { roomNameMatchMode: 'fuzzy' })).toEqual([
			"roomNameMatchMode: Invalid enum value. Expected 'exact' | 'prefix' | 'partial' | 'regex', received 'fuzzy'"
		]);
	});

	it('keeps the recording fields asked for, once each, and ignores any other name', () => {
		expect(parse({ fields: 'status, roomId,status,bogus' }).fields).toEqual(['status', 'roomId']);
		expect(parse({ fields: 'bogus' }).fields).toBeUndefined();
	});

	it('validates the roomName pattern only in regex mode', () => {
		expect(issues(RecordingFiltersSchema, { roomName: '(', roomNameMatchMode: 'regex' })).toEqual([
			'roomName: Invalid regular expression pattern'
		]);
		expect(issues(RecordingFiltersSchema, { roomName: '(', roomNameMatchMode: 'partial' })).toEqual([]);
		expect(issues(RecordingFiltersSchema, { roomName: '(' })).toEqual([]);
	});

	it('does not validate a pattern that is not there in regex mode', () => {
		expect(issues(RecordingFiltersSchema, { roomNameMatchMode: 'regex' })).toEqual([]);
		expect(issues(RecordingFiltersSchema, { roomName: '', roomNameMatchMode: 'regex' })).toEqual([]);
	});
});

describe('BulkDeleteRecordingsReqSchema', () => {
	const max = INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS;
	const ids = (count: number) => Array.from({ length: count }, (_, i) => recordingId(`room-${i}`));
	const parse = (recordingIds: unknown) => BulkDeleteRecordingsReqSchema.parse({ recordingIds }).recordingIds;

	it('reads a comma-separated list, trimming each id and dropping the empty entries', () => {
		expect(parse(` ${recordingId('a')} ,, ${recordingId('b')},`)).toEqual([recordingId('a'), recordingId('b')]);
	});

	it('keeps each id once', () => {
		expect(parse([recordingId('a'), recordingId('a'), recordingId('b')].join(','))).toEqual([
			recordingId('a'),
			recordingId('b')
		]);
	});

	it('sanitizes the room part of every id', () => {
		expect(parse('ro om!1--EG_abc--uid1')).toEqual(['room1--EG_abc--uid1']);
	});

	it('accepts as many ids as one request may delete', () => {
		expect(parse(ids(max).join(','))).toHaveLength(max);
	});

	it('rejects one id more', () => {
		expect(issues(BulkDeleteRecordingsReqSchema, { recordingIds: ids(max + 1).join(',') })).toEqual([
			`recordingIds: recordingIds cannot exceed ${max} items`
		]);
	});

	it.each([
		['an empty string', ''],
		['only separators', ' , ,'],
		['a missing list', undefined],
		['an array', [recordingId()]],
		['a number', 5]
	])('rejects %s as having no recording id', (_label, value) => {
		expect(issues(BulkDeleteRecordingsReqSchema, { recordingIds: value })).toEqual([
			'recordingIds: At least one recordingId is required'
		]);
	});

	it('points at the id that does not follow the format', () => {
		expect(issues(BulkDeleteRecordingsReqSchema, { recordingIds: `${recordingId()},bad` })).toEqual([
			'recordingIds.1: recordingId does not follow the expected format'
		]);
	});
});

describe('recording query, params and header schemas', () => {
	const input = (recordingIdValue: string) => ({ params: { recordingId: recordingIdValue } });

	it('RecordingQueryFieldsSchema keeps the recording fields asked for', () => {
		expect(RecordingQueryFieldsSchema.parse({ fields: 'size,bogus' })).toEqual({ fields: ['size'] });
		expect(RecordingQueryFieldsSchema.parse({})).toEqual({});
	});

	it('GetRecordingReqSchema reads the id, the fields and the recording secret', () => {
		expect(
			GetRecordingReqSchema.parse({
				params: { recordingId: ' ro om!1--EG_abc--uid1 ' },
				query: { fields: 'status', recordingSecret: 's3cret' }
			})
		).toEqual({
			params: { recordingId: 'room1--EG_abc--uid1' },
			query: { fields: ['status'], recordingSecret: 's3cret' }
		});
		expect(issues(GetRecordingReqSchema, { ...input('bad'), query: {} })).toEqual([
			'params.recordingId: recordingId does not follow the expected format'
		]);
		expect(issues(GetRecordingReqSchema, { query: {} })).toEqual(['params: Required']);
		expect(issues(GetRecordingReqSchema, input(recordingId()))).toEqual(['query: Required']);
	});

	it('StopRecordingReqSchema reads the id and the fields', () => {
		expect(
			StopRecordingReqSchema.parse({ params: { recordingId: recordingId() }, query: { fields: 'status,bogus' } })
		).toEqual({ params: { recordingId: recordingId() }, query: { fields: ['status'] } });
		expect(issues(StopRecordingReqSchema, { ...input(''), query: {} })).toEqual([
			'params.recordingId: recordingId is required and cannot be empty'
		]);
		expect(issues(StopRecordingReqSchema, input(recordingId()))).toEqual(['query: Required']);
	});

	describe('GetRecordingMediaReqSchema', () => {
		const withRange = (range: unknown) => ({
			params: { recordingId: recordingId() },
			query: {},
			headers: range === undefined ? {} : { range }
		});

		it.each(['bytes=0-10', 'bytes=0-', 'bytes=1048576-2097151'])('accepts the range %p', (range) => {
			expect(issues(GetRecordingMediaReqSchema, withRange(range))).toEqual([]);
		});

		it.each([
			'xbytes=0-10',
			'bytes=0-10x',
			'bytes=a-1',
			'bytes=0-b',
			'bytes=-10',
			'bytes=0',
			'bytes=0-10,20-30',
			''
		])('rejects the range %p', (range) => {
			expect(issues(GetRecordingMediaReqSchema, withRange(range))).toEqual([
				'headers.range: Invalid range header format. Expected: bytes=start-end'
			]);
		});

		it('does not require a range', () => {
			expect(issues(GetRecordingMediaReqSchema, withRange(undefined))).toEqual([]);
		});

		it('lets the other headers through', () => {
			const parsed = GetRecordingMediaReqSchema.parse({
				params: { recordingId: recordingId() },
				query: { recordingSecret: 's' },
				headers: { range: 'bytes=0-1', accept: 'video/mp4' }
			});

			expect(parsed.headers).toEqual({ range: 'bytes=0-1', accept: 'video/mp4' });
			expect(parsed.query).toEqual({ recordingSecret: 's' });
		});

		it('reads the recording id like the other schemas', () => {
			expect(
				GetRecordingMediaReqSchema.parse({
					params: { recordingId: ' ro om!1--EG_abc--uid1 ' },
					query: {},
					headers: {}
				}).params.recordingId
			).toBe('room1--EG_abc--uid1');
			expect(
				issues(GetRecordingMediaReqSchema, { params: { recordingId: 'bad' }, query: {}, headers: {} })
			).toEqual(['params.recordingId: recordingId does not follow the expected format']);
			expect(issues(GetRecordingMediaReqSchema, { query: {}, headers: {} })).toEqual(['params: Required']);
		});

		it('requires the headers', () => {
			expect(issues(GetRecordingMediaReqSchema, { params: { recordingId: recordingId() }, query: {} })).toEqual([
				'headers: Required'
			]);
		});
	});

	describe('GetRecordingUrlReqSchema', () => {
		const privateAccess = (value: unknown) =>
			GetRecordingUrlReqSchema.parse({ params: { recordingId: recordingId() }, query: { privateAccess: value } })
				.query.privateAccess;

		it.each([
			['true', true],
			['TRUE', true],
			['false', false],
			['anything else', false],
			[true, true],
			[false, false],
			[undefined, false]
		])('reads privateAccess %p as %p', (value, expected) => {
			expect(privateAccess(value)).toBe(expected);
		});

		it('reads the recording id like the other schemas', () => {
			expect(
				GetRecordingUrlReqSchema.parse({ params: { recordingId: ' ro om!1--EG_abc--uid1 ' }, query: {} }).params
					.recordingId
			).toBe('room1--EG_abc--uid1');
			expect(issues(GetRecordingUrlReqSchema, { params: { recordingId: 'bad' }, query: {} })).toEqual([
				'params.recordingId: recordingId does not follow the expected format'
			]);
			expect(issues(GetRecordingUrlReqSchema, { query: {} })).toEqual(['params: Required']);
		});

		it('rejects a privateAccess that is not a string or a boolean', () => {
			expect(
				issues(GetRecordingUrlReqSchema, {
					params: { recordingId: recordingId() },
					query: { privateAccess: 1 }
				})
			).toEqual(['query.privateAccess: Expected boolean, received number']);
		});
	});
});
