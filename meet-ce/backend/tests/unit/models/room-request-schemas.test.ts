import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import ms from 'ms';
import type { z } from 'zod';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import { configureZodErrorMessages } from '../../../src/config/zod-config.js';
import {
	SecurityConfigSchema,
	RoomsAppearanceConfigSchema
} from '../../../src/models/zod-schemas/global-config.schema.js';
import { nonEmptySanitizedRoomId, RoomIdParamSchema } from '../../../src/models/zod-schemas/room-id.schema.js';
import {
	BulkDeleteRoomsReqSchema,
	DeleteRoomReqSchema,
	mergeHeaderFieldsIntoQuery,
	RoomFiltersSchema,
	RoomHeaderFieldsSchema,
	RoomOptionsSchema,
	RoomQueryFieldsSchema,
	UpdateRoomAccessReqSchema,
	UpdateRoomConfigReqSchema,
	UpdateRoomRolesReqSchema,
	UpdateRoomStatusReqSchema
} from '../../../src/models/zod-schemas/room.schema.js';

const issues = (schema: z.ZodType, input: unknown): string[] => {
	const result = schema.safeParse(input);

	if (result.success) {
		return [];
	}

	return result.error.issues.map(({ path, message }) =>
		path.length > 0 ? `${path.join('.')}: ${message}` : message
	);
};

const parseRoom = (input: Record<string, unknown> = {}) =>
	RoomOptionsSchema.parse(input) as unknown as Record<string, any>;

const configIssues = (config: unknown) => issues(RoomOptionsSchema, { config });

beforeAll(() => {
	configureZodErrorMessages();
});

afterEach(() => {
	jest.restoreAllMocks();
});

describe('RoomIdParamSchema', () => {
	it('strips every character a room id cannot hold', () => {
		expect(RoomIdParamSchema.parse('Room_1-a b!/é')).toBe('Room_1-ab');
	});

	it('accepts a room id of exactly 100 characters and rejects one more', () => {
		expect(RoomIdParamSchema.parse('a'.repeat(100))).toBe('a'.repeat(100));
		expect(issues(RoomIdParamSchema, 'a'.repeat(101))).toEqual(['roomId cannot exceed 100 characters']);
	});

	it('measures the length before sanitizing', () => {
		expect(issues(RoomIdParamSchema, `${'a'.repeat(99)}!!`)).toEqual(['roomId cannot exceed 100 characters']);
	});

	it('rejects an empty id and an id that sanitizes to nothing', () => {
		expect(issues(RoomIdParamSchema, '')).toEqual(['roomId is required and cannot be empty']);
		expect(issues(RoomIdParamSchema, '!! ??')).toEqual(['roomId cannot be empty after sanitization']);
	});

	it('names the field it was given in the messages', () => {
		const schema = nonEmptySanitizedRoomId('parentId');

		expect(issues(schema, '')).toEqual(['parentId is required and cannot be empty']);
		expect(issues(schema, 'a'.repeat(101))).toEqual(['parentId cannot exceed 100 characters']);
		expect(issues(schema, '!')).toEqual(['parentId cannot be empty after sanitization']);
	});
});

describe('RoomOptionsSchema defaults', () => {
	it('fills every default when the body is empty', () => {
		expect(parseRoom()).toEqual({
			roomName: 'Room',
			autoDeletionPolicy: { withMeeting: 'when_meeting_ends', withRecordings: 'close' },
			config: {
				recording: { enabled: true, layout: 'grid', encoding: 'H264_720P_30' },
				broadcast: { enabled: false, destinations: [], layout: 'grid', encoding: 'H264_720P_30' },
				chat: { enabled: true },
				virtualBackground: { enabled: true },
				e2ee: { enabled: false },
				captions: { enabled: true },
				raiseHand: { enabled: true },
				reactions: { enabled: true },
				initialAudioActive: true,
				initialVideoActive: true
			},
			access: {
				anonymous: { moderator: { enabled: true }, speaker: { enabled: true }, recording: { enabled: true } },
				user: { enabled: false }
			}
		});
	});

	it('fills every config default when the config is empty', () => {
		expect(parseRoom({ config: {} }).config).toEqual(parseRoom().config);
	});

	it('does not share the default objects between two parses', () => {
		const first = parseRoom({ config: {} });
		first.config.chat.enabled = false;
		first.config.recording.layout = 'speaker';

		expect(parseRoom({ config: {} }).config.chat).toEqual({ enabled: true });
		expect(parseRoom({ config: {} }).config.recording.layout).toBe('grid');
	});

	it('completes a recording config that only says whether it is enabled', () => {
		expect(parseRoom({ config: { recording: { enabled: false } } }).config.recording).toEqual({
			enabled: false,
			layout: 'grid',
			encoding: 'H264_720P_30'
		});
	});

	it('keeps the layout and the encoding a recording config names', () => {
		const recording = {
			enabled: true,
			autoStart: 'when_moderator_joins',
			layout: 'speaker',
			encoding: 'H264_1080P_60'
		};

		expect(parseRoom({ config: { recording } }).config.recording).toEqual(recording);
	});

	it('completes a broadcast config that only says whether it is enabled', () => {
		expect(parseRoom({ config: { broadcast: { enabled: true } } }).config.broadcast).toEqual({
			enabled: true,
			destinations: [],
			layout: 'grid',
			encoding: 'H264_720P_30'
		});
	});

	it('completes a broadcast config that names no switch', () => {
		expect(parseRoom({ config: { broadcast: { layout: 'speaker' } } }).config.broadcast).toEqual({
			enabled: false,
			destinations: [],
			layout: 'speaker',
			encoding: 'H264_720P_30'
		});
	});

	it('keeps the broadcast destinations, layout and encoding it names', () => {
		const broadcast = {
			enabled: true,
			destinations: [{ name: 'Studio', url: 'rtmp://mtx/live/key' }],
			layout: 'single-speaker',
			encoding: 'H264_1080P_30'
		};

		expect(parseRoom({ config: { broadcast } }).config.broadcast).toEqual(broadcast);
	});

	it.each(['chat', 'virtualBackground', 'e2ee', 'captions', 'raiseHand', 'reactions'])(
		'requires the %s switch when its config is present',
		(feature) => {
			expect(configIssues({ [feature]: {} })).toEqual([`config.${feature}.enabled: Required`]);
			expect(configIssues({ [feature]: { enabled: 'yes' } })).toEqual([
				`config.${feature}.enabled: Expected boolean, received string`
			]);
		}
	);

	it('requires the recording switch when the recording config is present', () => {
		expect(configIssues({ recording: { layout: 'grid' } })).toEqual(['config.recording.enabled: Required']);
	});

	it('keeps a feature switch off when the body turns it off', () => {
		const config = parseRoom({
			config: {
				chat: { enabled: false },
				virtualBackground: { enabled: false },
				captions: { enabled: false },
				raiseHand: { enabled: false },
				reactions: { enabled: false }
			}
		}).config;

		expect(config).toMatchObject({
			chat: { enabled: false },
			virtualBackground: { enabled: false },
			captions: { enabled: false },
			raiseHand: { enabled: false },
			reactions: { enabled: false }
		});
	});
});

describe('RoomOptionsSchema config', () => {
	describe('meeting limits', () => {
		const { MEETING_MAX_PARTICIPANTS_LIMIT: maxParticipants, MEETING_MAX_DURATION_MINUTES_LIMIT: maxDuration } =
			INTERNAL_CONFIG;

		it('leaves the limits unset when the body omits them', () => {
			const config = parseRoom({ config: {} }).config;

			expect(config).not.toHaveProperty('maxParticipants');
			expect(config).not.toHaveProperty('maxDurationMinutes');
		});

		it('accepts the limits at both ends of their range', () => {
			expect(parseRoom({ config: { maxParticipants: 1 } }).config.maxParticipants).toBe(1);
			expect(parseRoom({ config: { maxParticipants: maxParticipants } }).config.maxParticipants).toBe(30);
			expect(parseRoom({ config: { maxDurationMinutes: 1 } }).config.maxDurationMinutes).toBe(1);
			expect(parseRoom({ config: { maxDurationMinutes: maxDuration } }).config.maxDurationMinutes).toBe(1440);
		});

		it('keeps null as the explicit no-limit value', () => {
			const config = parseRoom({ config: { maxParticipants: null, maxDurationMinutes: null } }).config;

			expect(config.maxParticipants).toBeNull();
			expect(config.maxDurationMinutes).toBeNull();
		});

		it('rejects a participant limit outside its range', () => {
			expect(configIssues({ maxParticipants: 0 })).toEqual([
				'config.maxParticipants: Must allow at least one participant'
			]);
			expect(configIssues({ maxParticipants: -3 })).toEqual([
				'config.maxParticipants: Must allow at least one participant'
			]);
			expect(configIssues({ maxParticipants: maxParticipants + 1 })).toEqual([
				`config.maxParticipants: Must not exceed ${maxParticipants} participants`
			]);
		});

		it('rejects a duration limit outside its range', () => {
			expect(configIssues({ maxDurationMinutes: 0 })).toEqual([
				'config.maxDurationMinutes: Must last at least one minute'
			]);
			expect(configIssues({ maxDurationMinutes: maxDuration + 1 })).toEqual([
				`config.maxDurationMinutes: Must not exceed ${maxDuration} minutes`
			]);
		});

		it('rejects a limit that is not an integer or not a number', () => {
			expect(configIssues({ maxParticipants: 2.5 })).toEqual(['config.maxParticipants: Must be an integer']);
			expect(configIssues({ maxDurationMinutes: 2.5 })).toEqual([
				'config.maxDurationMinutes: Must be an integer'
			]);
			expect(configIssues({ maxParticipants: '5' })).toEqual(['config.maxParticipants: Must be a number']);
			expect(configIssues({ maxDurationMinutes: '5' })).toEqual(['config.maxDurationMinutes: Must be a number']);
		});
	});

	describe('initial media state', () => {
		it('defaults to on and keeps an explicit off', () => {
			expect(parseRoom({ config: {} }).config).toMatchObject({
				initialAudioActive: true,
				initialVideoActive: true
			});
			expect(
				parseRoom({ config: { initialAudioActive: false, initialVideoActive: false } }).config
			).toMatchObject({
				initialAudioActive: false,
				initialVideoActive: false
			});
			expect(parseRoom({ config: { initialAudioActive: false } }).config).toMatchObject({
				initialAudioActive: false,
				initialVideoActive: true
			});
		});

		it('rejects a value that is not a boolean', () => {
			expect(configIssues({ initialAudioActive: 'false' })).toEqual([
				'config.initialAudioActive: Must be a boolean'
			]);
			expect(configIssues({ initialVideoActive: 0 })).toEqual(['config.initialVideoActive: Must be a boolean']);
		});
	});

	describe('end-to-end encryption', () => {
		it('turns off recording, broadcast and captions, which cannot work on encrypted media', () => {
			const config = parseRoom({
				config: {
					e2ee: { enabled: true },
					recording: { enabled: true },
					broadcast: { enabled: true },
					captions: { enabled: true },
					chat: { enabled: true }
				}
			}).config;

			expect(config.e2ee).toEqual({ enabled: true });
			expect(config.recording).toEqual({ enabled: false, layout: 'grid', encoding: 'H264_720P_30' });
			expect(config.broadcast).toMatchObject({ enabled: false });
			expect(config.captions).toEqual({ enabled: false });
			expect(config.chat).toEqual({ enabled: true });
		});

		it('turns off the features that are on by default', () => {
			const config = parseRoom({ config: { e2ee: { enabled: true } } }).config;

			expect(config.recording.enabled).toBe(false);
			expect(config.captions.enabled).toBe(false);
		});

		it('leaves the features alone when it is off', () => {
			const config = parseRoom({ config: { e2ee: { enabled: false } } }).config;

			expect(config.recording.enabled).toBe(true);
			expect(config.captions.enabled).toBe(true);
		});
	});
});

describe('RoomOptionsSchema roomName and autoDeletionDate', () => {
	it('accepts a name of exactly 50 characters', () => {
		expect(parseRoom({ roomName: 'a'.repeat(50) }).roomName).toBe('a'.repeat(50));
	});

	it('rejects a name over 50 characters with its message', () => {
		expect(issues(RoomOptionsSchema, { roomName: 'a'.repeat(51) })).toEqual([
			'roomName: roomName cannot exceed 50 characters'
		]);
	});

	it('rejects a name that is not a string', () => {
		expect(issues(RoomOptionsSchema, { roomName: 5 })).toEqual(['roomName: Expected string, received number']);
	});

	describe('autoDeletionDate', () => {
		const now = 1_800_000_000_000;
		const dateIssues = (autoDeletionDate: unknown) =>
			issues(RoomOptionsSchema, { autoDeletionDate }).filter((issue) => issue.startsWith('autoDeletionDate'));

		it('accepts a date exactly one hour ahead and rejects one millisecond less', () => {
			jest.spyOn(Date, 'now').mockReturnValue(now);

			expect(dateIssues(now + ms(INTERNAL_CONFIG.MIN_ROOM_AUTO_DELETE_DURATION))).toEqual([]);
			expect(dateIssues(now + ms(INTERNAL_CONFIG.MIN_ROOM_AUTO_DELETE_DURATION) - 1)).toEqual([
				'autoDeletionDate: autoDeletionDate must be at least 1h in the future'
			]);
		});

		it('keeps the date as given', () => {
			expect(parseRoom({ autoDeletionDate: Date.now() + ms('2h') }).autoDeletionDate).toBeGreaterThan(Date.now());
			expect(parseRoom({}).autoDeletionDate).toBeUndefined();
		});

		it('rejects a date that is not positive', () => {
			expect(dateIssues(0)).toContain('autoDeletionDate: autoDeletionDate must be a positive integer');
			expect(dateIssues(-1)).toContain('autoDeletionDate: autoDeletionDate must be a positive integer');
		});

		it('rejects a date that is not a number', () => {
			expect(dateIssues('tomorrow')).toEqual(['autoDeletionDate: Expected number, received string']);
		});
	});
});

describe('RoomOptionsSchema autoDeletionPolicy', () => {
	const policy = (value: unknown) => issues(RoomOptionsSchema, { autoDeletionPolicy: value });

	it('completes a policy that names only one side', () => {
		expect(parseRoom({ autoDeletionPolicy: { withMeeting: 'force' } }).autoDeletionPolicy).toEqual({
			withMeeting: 'force',
			withRecordings: 'close'
		});
		expect(parseRoom({ autoDeletionPolicy: { withRecordings: 'force' } }).autoDeletionPolicy).toEqual({
			withMeeting: 'when_meeting_ends',
			withRecordings: 'force'
		});
		expect(parseRoom({ autoDeletionPolicy: {} }).autoDeletionPolicy).toEqual({
			withMeeting: 'when_meeting_ends',
			withRecordings: 'close'
		});
	});

	it('rejects the fail policy, which only deletions by request can use', () => {
		expect(policy({ withMeeting: 'fail' })).toEqual([
			'autoDeletionPolicy.withMeeting: FAIL policy is not allowed for withMeeting auto-deletion policy'
		]);
		expect(policy({ withRecordings: 'fail' })).toEqual([
			'autoDeletionPolicy.withRecordings: FAIL policy is not allowed for withRecordings auto-deletion policy'
		]);
		expect(policy({ withMeeting: 'fail', withRecordings: 'fail' })).toHaveLength(2);
	});

	it('rejects a policy that does not exist', () => {
		expect(policy({ withMeeting: 'never' })).toEqual([
			"autoDeletionPolicy.withMeeting: Invalid enum value. Expected 'force' | 'when_meeting_ends' | 'fail', received 'never'"
		]);
		expect(policy({ withRecordings: 'never' })).toEqual([
			"autoDeletionPolicy.withRecordings: Invalid enum value. Expected 'force' | 'close' | 'fail', received 'never'"
		]);
	});
});

describe('RoomOptionsSchema roles and access', () => {
	it('leaves the roles unset when the body omits them', () => {
		expect(parseRoom()).not.toHaveProperty('roles');
	});

	it('normalizes the permissions of a role to the current names, without completing them', () => {
		expect(
			parseRoom({
				roles: {
					moderator: { permissions: { canRecord: true } },
					speaker: { permissions: { chatWrite: false } }
				}
			}).roles
		).toEqual({
			moderator: { permissions: { recordingControl: true } },
			speaker: { permissions: { chatWrite: false } }
		});
	});

	it('rejects the two spellings of one permission that disagree', () => {
		expect(
			issues(RoomOptionsSchema, {
				roles: { speaker: { permissions: { canRecord: true, recordingControl: false } } }
			})
		).toEqual([
			"roles.speaker.permissions.canRecord: Conflicting values for deprecated permission 'canRecord' (true) and its replacement 'recordingControl' (false); send only one spelling"
		]);
	});

	it('keeps the access an anonymous or a user entry names', () => {
		const access = {
			anonymous: { moderator: { enabled: false }, recording: { enabled: false } },
			user: { enabled: true }
		};

		expect(parseRoom({ access }).access).toEqual(access);
	});

	it('rejects an access switch that is not a boolean', () => {
		expect(issues(RoomOptionsSchema, { access: { user: { enabled: 'yes' } } })).toEqual([
			'access.user.enabled: Expected boolean, received string'
		]);
		expect(issues(RoomOptionsSchema, { access: { anonymous: { speaker: { enabled: 1 } } } })).toEqual([
			'access.anonymous.speaker.enabled: Expected boolean, received number'
		]);
		expect(issues(RoomOptionsSchema, { access: { anonymous: { moderator: {} } } })).toEqual([
			'access.anonymous.moderator.enabled: Required'
		]);
	});
});

describe('room update schemas', () => {
	it('UpdateRoomConfigReqSchema requires the config', () => {
		expect(issues(UpdateRoomConfigReqSchema, {})).toEqual(['config: Required']);
	});

	it('UpdateRoomConfigReqSchema fills no default, so a missing key keeps its stored value', () => {
		expect(UpdateRoomConfigReqSchema.parse({ config: {} })).toEqual({ config: {} });
		expect(
			UpdateRoomConfigReqSchema.parse({ config: { chat: { enabled: false }, maxParticipants: null } })
		).toEqual({
			config: { chat: { enabled: false }, maxParticipants: null }
		});
		expect(UpdateRoomConfigReqSchema.parse({ config: { recording: { enabled: true } } })).toEqual({
			config: { recording: { enabled: true } }
		});
		expect(UpdateRoomConfigReqSchema.parse({ config: { broadcast: { enabled: true } } })).toEqual({
			config: { broadcast: { enabled: true } }
		});
	});

	it('UpdateRoomConfigReqSchema applies the limits of the creation', () => {
		expect(issues(UpdateRoomConfigReqSchema, { config: { maxParticipants: 31 } })).toEqual([
			'config.maxParticipants: Must not exceed 30 participants'
		]);
		expect(issues(UpdateRoomConfigReqSchema, { config: { maxDurationMinutes: 1441 } })).toEqual([
			'config.maxDurationMinutes: Must not exceed 1440 minutes'
		]);
		expect(issues(UpdateRoomConfigReqSchema, { config: { initialAudioActive: 'x' } })).toEqual([
			'config.initialAudioActive: Must be a boolean'
		]);
		expect(issues(UpdateRoomConfigReqSchema, { config: { recording: { layout: 'grid' } } })).toEqual([
			'config.recording.enabled: Required'
		]);
	});

	it('UpdateRoomConfigReqSchema turns off what end-to-end encryption excludes, only where it is on', () => {
		expect(
			UpdateRoomConfigReqSchema.parse({
				config: {
					e2ee: { enabled: true },
					recording: { enabled: true },
					broadcast: { enabled: true },
					captions: { enabled: true }
				}
			})
		).toEqual({
			config: {
				e2ee: { enabled: true },
				recording: { enabled: false },
				broadcast: { enabled: false },
				captions: { enabled: false }
			}
		});
		expect(UpdateRoomConfigReqSchema.parse({ config: { e2ee: { enabled: true } } })).toEqual({
			config: { e2ee: { enabled: true } }
		});
		expect(UpdateRoomConfigReqSchema.parse({ config: { recording: { enabled: true } } })).toEqual({
			config: { recording: { enabled: true } }
		});
	});

	it('UpdateRoomRolesReqSchema normalizes the permissions it is given', () => {
		expect(UpdateRoomRolesReqSchema.parse({ roles: {} })).toEqual({ roles: {} });
		expect(
			UpdateRoomRolesReqSchema.parse({
				roles: { moderator: { permissions: { canRetrieveRecordings: false } } }
			})
		).toEqual({
			roles: {
				moderator: { permissions: { recordingList: false, recordingPlay: false, recordingDownload: false } }
			}
		});
		expect(issues(UpdateRoomRolesReqSchema, {})).toEqual(['roles: Required']);
		expect(issues(UpdateRoomRolesReqSchema, { roles: { moderator: {} } })).toEqual([
			'roles.moderator.permissions: Required'
		]);
		expect(issues(UpdateRoomRolesReqSchema, { roles: { speaker: { permissions: { chatRead: 'yes' } } } })).toEqual([
			'roles.speaker.permissions.chatRead: Expected boolean, received string'
		]);
	});

	it('UpdateRoomAccessReqSchema keeps the access it is given', () => {
		const access = { anonymous: { speaker: { enabled: true } }, user: { enabled: false } };

		expect(UpdateRoomAccessReqSchema.parse({ access })).toEqual({ access });
		expect(UpdateRoomAccessReqSchema.parse({ access: {} })).toEqual({ access: {} });
		expect(issues(UpdateRoomAccessReqSchema, {})).toEqual(['access: Required']);
	});

	it('UpdateRoomStatusReqSchema accepts only open and closed', () => {
		expect(UpdateRoomStatusReqSchema.parse({ status: 'open' })).toEqual({ status: 'open' });
		expect(UpdateRoomStatusReqSchema.parse({ status: 'closed' })).toEqual({ status: 'closed' });
		expect(issues(UpdateRoomStatusReqSchema, { status: 'active_meeting' })).toEqual([
			"status: Invalid enum value. Expected 'open' | 'closed', received 'active_meeting'"
		]);
		expect(issues(UpdateRoomStatusReqSchema, {})).toEqual(['status: Required']);
	});
});

describe('RoomFiltersSchema', () => {
	const parse = (input: Record<string, unknown>) => RoomFiltersSchema.parse(input);

	it('fills the defaults when nothing is filtered', () => {
		expect(parse({})).toEqual({
			roomNameCaseInsensitive: false,
			maxItems: 10,
			sortField: 'creationDate',
			sortOrder: 'desc'
		});
	});

	it('keeps the filters as given', () => {
		expect(
			parse({
				roomName: 'Standup',
				roomNameMatchMode: 'prefix',
				owner: 'alice',
				member: 'bob',
				status: 'active_meeting',
				nextPageToken: 'token',
				sortField: 'autoDeletionDate',
				sortOrder: 'asc'
			})
		).toEqual({
			roomName: 'Standup',
			roomNameMatchMode: 'prefix',
			roomNameCaseInsensitive: false,
			owner: 'alice',
			member: 'bob',
			status: 'active_meeting',
			nextPageToken: 'token',
			maxItems: 10,
			sortField: 'autoDeletionDate',
			sortOrder: 'asc'
		});
	});

	it('rejects an empty owner or member', () => {
		expect(issues(RoomFiltersSchema, { owner: '' })).toEqual(['owner: owner cannot be empty']);
		expect(issues(RoomFiltersSchema, { member: '' })).toEqual(['member: member cannot be empty']);
	});

	it.each([
		['true', true],
		['TRUE', true],
		['false', false],
		['False', false],
		[true, true],
		[false, false]
	])('reads userAccess %p as %p', (value, expected) => {
		expect(parse({ userAccess: value }).userAccess).toBe(expected);
	});

	it('leaves userAccess unset when it is not asked for, and rejects a value that is not a boolean', () => {
		expect(parse({})).not.toHaveProperty('userAccess');
		expect(issues(RoomFiltersSchema, { userAccess: 'yes' })).toEqual([
			'userAccess: Expected boolean, received string'
		]);
	});

	it.each([
		['true', true],
		['TRUE', true],
		['false', false],
		[true, true]
	])('reads roomNameCaseInsensitive %p as %p', (value, expected) => {
		expect(parse({ roomNameCaseInsensitive: value }).roomNameCaseInsensitive).toBe(expected);
	});

	it('rejects a roomNameCaseInsensitive that is neither true nor false', () => {
		expect(issues(RoomFiltersSchema, { roomNameCaseInsensitive: 'yes' })).toEqual([
			'roomNameCaseInsensitive: Expected boolean, received string'
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
		expect(issues(RoomFiltersSchema, { maxItems: value })).toEqual([
			'maxItems: maxItems must be a positive number'
		]);
	});

	it('rejects a status, a sort field and a match mode that do not exist', () => {
		expect(issues(RoomFiltersSchema, { status: 'gone' })).toEqual([
			"status: Invalid enum value. Expected 'open' | 'active_meeting' | 'closed', received 'gone'"
		]);
		expect(issues(RoomFiltersSchema, { sortField: 'owner' })).toEqual([
			"sortField: Invalid enum value. Expected 'creationDate' | 'roomName' | 'autoDeletionDate', received 'owner'"
		]);
		expect(issues(RoomFiltersSchema, { sortOrder: 'up' })).toEqual([
			"sortOrder: Invalid enum value. Expected 'asc' | 'desc', received 'up'"
		]);
		expect(issues(RoomFiltersSchema, { roomNameMatchMode: 'fuzzy' })).toEqual([
			"roomNameMatchMode: Invalid enum value. Expected 'exact' | 'prefix' | 'partial' | 'regex', received 'fuzzy'"
		]);
	});

	it('keeps the base fields asked for, once each, and leaves the extra fields to extraFields', () => {
		expect(parse({ fields: 'roomId, roomName,roomId,config,roles,bogus' }).fields).toEqual(['roomId', 'roomName']);
		expect(parse({ fields: 'config,roles,bogus, ,' }).fields).toBeUndefined();
		expect(parse({ fields: '' }).fields).toBeUndefined();
	});

	it('keeps the extra fields asked for and ignores every other name', () => {
		expect(parse({ extraFields: 'config, roles,roomId,bogus' }).extraFields).toEqual(['config', 'roles']);
		expect(parse({ extraFields: 'roomId' }).extraFields).toBeUndefined();
		expect(parse({ extraFields: '' }).extraFields).toBeUndefined();
	});

	it('validates the roomName pattern only in regex mode and only when there is one', () => {
		expect(issues(RoomFiltersSchema, { roomName: '(', roomNameMatchMode: 'regex' })).toEqual([
			'roomName: Invalid regular expression pattern'
		]);
		expect(issues(RoomFiltersSchema, { roomName: '(', roomNameMatchMode: 'partial' })).toEqual([]);
		expect(issues(RoomFiltersSchema, { roomName: '(' })).toEqual([]);
		expect(issues(RoomFiltersSchema, { roomNameMatchMode: 'regex' })).toEqual([]);
		expect(issues(RoomFiltersSchema, { roomName: '', roomNameMatchMode: 'regex' })).toEqual([]);
	});
});

describe('room field selection', () => {
	it('RoomQueryFieldsSchema reads fields and extraFields', () => {
		expect(RoomQueryFieldsSchema.parse({ fields: 'roomId,config', extraFields: 'config,roomId' })).toEqual({
			fields: ['roomId'],
			extraFields: ['config']
		});
		expect(RoomQueryFieldsSchema.parse({})).toEqual({});
	});

	it('RoomHeaderFieldsSchema reads the X-Fields and X-ExtraFields headers', () => {
		expect(RoomHeaderFieldsSchema.parse({ 'x-fields': 'roomId,config', 'x-extrafields': 'roles,bogus' })).toEqual({
			'x-fields': ['roomId'],
			'x-extrafields': ['roles']
		});
		expect(issues(RoomHeaderFieldsSchema, { 'x-fields': 5 })).toEqual([
			'x-fields: Expected string, received number'
		]);
	});

	describe('mergeHeaderFieldsIntoQuery', () => {
		const merge = (headers: Record<string, unknown>, query: Record<string, unknown>) => {
			mergeHeaderFieldsIntoQuery(headers, query);
			return query;
		};

		it('adds the fields of the headers to those of the query, once each', () => {
			expect(merge({ 'x-fields': 'roomName,roomId,bogus' }, { fields: ' roomId ,, owner' })).toEqual({
				fields: 'roomId,owner,roomName'
			});
			expect(merge({ 'x-extrafields': 'roles,config' }, { extraFields: 'config, ,' })).toEqual({
				extraFields: 'config,roles'
			});
		});

		it('sets the fields when the query has none', () => {
			expect(merge({ 'x-fields': 'roomId' }, {})).toEqual({ fields: 'roomId' });
			expect(merge({ 'x-extrafields': 'config' }, {})).toEqual({ extraFields: 'config' });
			expect(
				merge({ 'x-fields': 'roomId', 'x-extrafields': 'config' }, { fields: ['x'], extraFields: 7 })
			).toEqual({
				fields: 'roomId',
				extraFields: 'config'
			});
		});

		it('leaves the query alone when the headers name no usable field', () => {
			expect(merge({ 'x-fields': 'bogus', 'x-extrafields': 'roomId' }, { fields: 'owner' })).toEqual({
				fields: 'owner'
			});
			expect(merge({}, { fields: 'owner' })).toEqual({ fields: 'owner' });
		});

		it('ignores both headers when either one is not a string', () => {
			expect(merge({ 'x-fields': 5, 'x-extrafields': 'config' }, {})).toEqual({});
			expect(merge({ 'x-fields': 'roomId', 'x-extrafields': ['config'] }, {})).toEqual({});
		});
	});
});

describe('room deletion schemas', () => {
	it('DeleteRoomReqSchema refuses to force anything by default', () => {
		expect(DeleteRoomReqSchema.parse({})).toEqual({ withMeeting: 'fail', withRecordings: 'fail' });
	});

	it('DeleteRoomReqSchema keeps the policies and fields it is given', () => {
		expect(
			DeleteRoomReqSchema.parse({
				withMeeting: 'force',
				withRecordings: 'close',
				fields: 'roomId',
				extraFields: 'config'
			})
		).toEqual({ withMeeting: 'force', withRecordings: 'close', fields: ['roomId'], extraFields: ['config'] });
		expect(DeleteRoomReqSchema.parse({ withMeeting: 'when_meeting_ends' }).withMeeting).toBe('when_meeting_ends');
	});

	it('DeleteRoomReqSchema rejects a policy that does not exist', () => {
		expect(issues(DeleteRoomReqSchema, { withMeeting: 'never' })).toEqual([
			"withMeeting: Invalid enum value. Expected 'force' | 'when_meeting_ends' | 'fail', received 'never'"
		]);
		expect(issues(DeleteRoomReqSchema, { withRecordings: 'when_meeting_ends' })).toEqual([
			"withRecordings: Invalid enum value. Expected 'force' | 'close' | 'fail', received 'when_meeting_ends'"
		]);
	});

	describe('BulkDeleteRoomsReqSchema', () => {
		const roomIds = (value: unknown) => BulkDeleteRoomsReqSchema.parse({ roomIds: value }).roomIds;

		it('reads a comma-separated list, trimming each id and dropping the empty entries', () => {
			expect(roomIds(' a ,, b,')).toEqual(['a', 'b']);
		});

		it('sanitizes each id and keeps the ones that stay distinct once', () => {
			expect(roomIds('ro om!1,room1,room-2')).toEqual(['room1', 'room-2']);
		});

		it('drops an id that sanitizes to nothing', () => {
			expect(roomIds('!!!,a')).toEqual(['a']);
		});

		it('reads an array, in which every entry is an id', () => {
			expect(roomIds(['a', 'b!', '', 'a', 5])).toEqual(['a', 'b', '5']);
		});

		it.each([
			['null', null],
			['an object', { roomId: 'a' }],
			['a boolean', true]
		])('refuses an array entry that is %s instead of reading it as an id', (_case, entry) => {
			expect(BulkDeleteRoomsReqSchema.safeParse({ roomIds: ['a', entry] }).success).toBe(false);
		});

		it.each([
			['an empty string', ''],
			['only separators', ' , ,'],
			['ids that sanitize to nothing', '!!,??'],
			['a missing list', undefined],
			['an empty array', []],
			['a number', 5]
		])('rejects %s as having no room id', (_label, value) => {
			expect(issues(BulkDeleteRoomsReqSchema, { roomIds: value })).toEqual([
				'roomIds: At least one valid roomId is required after sanitization'
			]);
		});

		it('refuses to force anything by default and keeps the policies and fields it is given', () => {
			expect(BulkDeleteRoomsReqSchema.parse({ roomIds: 'a' })).toEqual({
				roomIds: ['a'],
				withMeeting: 'fail',
				withRecordings: 'fail'
			});
			expect(
				BulkDeleteRoomsReqSchema.parse({
					roomIds: 'a',
					withMeeting: 'force',
					withRecordings: 'force',
					fields: 'roomId,config',
					extraFields: 'config'
				})
			).toEqual({
				roomIds: ['a'],
				withMeeting: 'force',
				withRecordings: 'force',
				fields: ['roomId'],
				extraFields: ['config']
			});
			expect(issues(BulkDeleteRoomsReqSchema, { roomIds: 'a', withMeeting: 'never' })).toEqual([
				"withMeeting: Invalid enum value. Expected 'force' | 'when_meeting_ends' | 'fail', received 'never'"
			]);
			expect(issues(BulkDeleteRoomsReqSchema, { roomIds: 'a', withRecordings: 'never' })).toEqual([
				"withRecordings: Invalid enum value. Expected 'force' | 'close' | 'fail', received 'never'"
			]);
		});
	});
});

describe('RoomsAppearanceConfigSchema', () => {
	const theme = (overrides: Record<string, unknown> = {}) => ({
		name: 'brand',
		enabled: true,
		baseTheme: 'dark',
		...overrides
	});
	const appearance = (...themes: unknown[]) => ({ appearance: { themes } });
	const colorKeys = ['backgroundColor', 'primaryColor', 'secondaryColor', 'accentColor', 'surfaceColor'];

	it('accepts exactly one theme and keeps it as given', () => {
		const input = appearance(theme({ primaryColor: '#112233', surfaceColor: '#fff8' }));

		expect(RoomsAppearanceConfigSchema.parse(input)).toEqual(input);
	});

	it('rejects no theme and more than one', () => {
		expect(issues(RoomsAppearanceConfigSchema, appearance())).toEqual([
			'appearance.themes: There must be exactly one theme defined'
		]);
		expect(issues(RoomsAppearanceConfigSchema, appearance(theme(), theme({ name: 'other' })))).toEqual([
			'appearance.themes: There must be exactly one theme defined'
		]);
		expect(issues(RoomsAppearanceConfigSchema, {})).toEqual(['appearance: Required']);
	});

	it('accepts a theme name of 1 to 50 letters, digits, hyphens and underscores', () => {
		for (const name of ['a', 'a'.repeat(50), 'Brand_2-x']) {
			expect(issues(RoomsAppearanceConfigSchema, appearance(theme({ name })))).toEqual([]);
		}
	});

	it('rejects a theme name that is empty, too long or holds other characters', () => {
		expect(issues(RoomsAppearanceConfigSchema, appearance(theme({ name: '' })))).toContain(
			'appearance.themes.0.name: Theme name cannot be empty'
		);
		expect(issues(RoomsAppearanceConfigSchema, appearance(theme({ name: 'a'.repeat(51) })))).toEqual([
			'appearance.themes.0.name: Theme name cannot exceed 50 characters'
		]);

		for (const name of ['my theme', 'brand!', 'marcaña', '-a b']) {
			expect(issues(RoomsAppearanceConfigSchema, appearance(theme({ name })))).toEqual([
				'appearance.themes.0.name: Theme name can only contain letters, numbers, hyphens and underscores'
			]);
		}
	});

	it('requires the switch and a base theme that exists', () => {
		expect(issues(RoomsAppearanceConfigSchema, appearance({ name: 'brand' }))).toEqual([
			'appearance.themes.0.enabled: Required',
			'appearance.themes.0.baseTheme: Required'
		]);
		expect(issues(RoomsAppearanceConfigSchema, appearance(theme({ baseTheme: 'blue', enabled: 'yes' })))).toEqual([
			'appearance.themes.0.enabled: Expected boolean, received string',
			"appearance.themes.0.baseTheme: Invalid enum value. Expected 'light' | 'dark', received 'blue'"
		]);
	});

	describe.each(colorKeys)('%s', (key) => {
		const colorIssues = (color: unknown) =>
			issues(RoomsAppearanceConfigSchema, appearance(theme({ [key]: color })));

		it.each(['#fff', '#ffff', '#ffffff', '#ffffffff', '#AbC123', '#00000000'])('accepts %s', (color) => {
			expect(colorIssues(color)).toEqual([]);
		});

		it.each([
			'fff',
			'#ff',
			'#fffff',
			'#fffffff',
			'#fffffffff',
			'#ggg',
			'x#fff',
			'#fffx',
			'#fff ',
			' #fff',
			'',
			'red'
		])('rejects %p', (color) => {
			expect(colorIssues(color)).toEqual([
				`appearance.themes.0.${key}: Must be a valid hex color code (with or without alpha)`
			]);
		});

		it('is optional', () => {
			expect(colorIssues(undefined)).toEqual([]);
		});
	});
});

describe('SecurityConfigSchema', () => {
	const provider = { provider: 'github', clientId: 'id', clientSecret: 'secret', redirectUri: 'https://app/cb' };

	it('accepts the OAuth providers it is given, none included', () => {
		expect(SecurityConfigSchema.parse({ authentication: { oauthProviders: [provider] } })).toEqual({
			authentication: { oauthProviders: [provider] }
		});
		expect(SecurityConfigSchema.parse({ authentication: { oauthProviders: [] } })).toEqual({
			authentication: { oauthProviders: [] }
		});
	});

	it('requires the authentication, the provider list and every provider field', () => {
		expect(issues(SecurityConfigSchema, {})).toEqual(['authentication: Required']);
		expect(issues(SecurityConfigSchema, { authentication: {} })).toEqual([
			'authentication.oauthProviders: Required'
		]);
		expect(issues(SecurityConfigSchema, { authentication: { oauthProviders: [{}] } })).toEqual([
			'authentication.oauthProviders.0.provider: Required',
			'authentication.oauthProviders.0.clientId: Required',
			'authentication.oauthProviders.0.clientSecret: Required',
			'authentication.oauthProviders.0.redirectUri: Required'
		]);
	});

	it('rejects a provider that is not supported', () => {
		expect(
			issues(SecurityConfigSchema, { authentication: { oauthProviders: [{ ...provider, provider: 'okta' }] } })
		).toEqual([
			"authentication.oauthProviders.0.provider: Invalid enum value. Expected 'google' | 'github', received 'okta'"
		]);
	});
});
