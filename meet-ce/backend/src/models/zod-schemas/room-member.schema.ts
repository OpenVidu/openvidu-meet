import type {
	MeetRoomMemberExtraField,
	MeetRoomMemberField,
	MeetRoomMemberOptions,
	MeetRoomMemberPermissions,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberTokenOptions
} from '@openvidu-meet/typings';
import {
	findPermissionAliasConflicts,
	MEET_LEGACY_PERMISSION_KEYS,
	MEET_PERMISSION_KEYS,
	MEET_ROOM_MEMBER_EXTRA_FIELDS,
	MEET_ROOM_MEMBER_FIELDS,
	MEET_ROOM_MEMBER_SORT_FIELDS,
	MeetRoomMemberRole,
	MeetRoomMemberType,
	MeetRoomMemberUIBadge,
	normalizePermissions,
	SortOrder,
	TextMatchMode
} from '@openvidu-meet/typings';
import { z } from 'zod';

/**
 * Shared fields validation schema for RoomMember entity
 * Validates and transforms comma-separated string to typed array
 * IMPORTANT: Only allows BASE fields (non-extra fields) in the 'fields' parameter.
 * Any extra fields included in 'fields' will be automatically filtered out.
 * Extra fields MUST be requested via the 'extraFields' parameter.
 */
const fieldsSchema = z
	.string()
	.optional()
	.transform((value) => {
		if (!value) return undefined;

		const requested = value
			.split(',')
			.map((field) => field.trim())
			.filter((field) => field !== '');

		// Filter: only keep valid BASE fields (exclude extra fields)
		const validBaseFields = requested.filter(
			(field) =>
				MEET_ROOM_MEMBER_FIELDS.includes(field as MeetRoomMemberField) &&
				!MEET_ROOM_MEMBER_EXTRA_FIELDS.includes(field as MeetRoomMemberExtraField)
		) as MeetRoomMemberField[];

		const unique = Array.from(new Set(validBaseFields));

		return unique.length > 0 ? unique : undefined;
	});

/**
 * Shared extraFields validation schema for RoomMember entity.
 * Validates and transforms comma-separated string to a typed array of MeetRoomMemberExtraField.
 */
const extraFieldsSchema = z
	.string()
	.optional()
	.transform((value) => {
		if (!value) return undefined;

		const requested = value.split(',').map((p) => p.trim());
		const valid = requested.filter((p) =>
			MEET_ROOM_MEMBER_EXTRA_FIELDS.includes(p as MeetRoomMemberExtraField)
		) as MeetRoomMemberExtraField[];

		return valid.length > 0 ? valid : undefined;
	});

const RoomMemberRoleSchema: z.ZodType<MeetRoomMemberRole> = z.enum(MeetRoomMemberRole);

// Both permission schemas accept any mix of canonical and legacy (`can*`) key spellings, derived
// from MEET_PERMISSION_ALIASES so a future alias is a typings change alone. Every key is optional at
// the shape level: requiredness ("all 16 canonical keys defined after normalization") only applies
// to the full schema and is enforced in its superRefine, where the legacy spelling of a key can
// stand in for the canonical one. The legacy branch is removed in 3.12.0.
const dualNamingPermissionShape = (): Record<string, z.ZodOptional<z.ZodBoolean>> => {
	const shape: Record<string, z.ZodOptional<z.ZodBoolean>> = {};

	for (const key of [...MEET_LEGACY_PERMISSION_KEYS, ...MEET_PERMISSION_KEYS]) {
		shape[key] = z.boolean().optional();
	}

	return shape;
};

// A legacy key sent together with a canonical key of its group and a contradicting value is a 422:
// the caller is asking for two different things at once, and any silent precedence rule would
// discard one of them (see MEET_PERMISSION_ALIASES).
const addPermissionConflictIssues = (input: Record<string, unknown>, ctx: z.RefinementCtx): void => {
	for (const conflict of findPermissionAliasConflicts(input)) {
		ctx.addIssue({
			code: 'custom',
			path: [conflict.legacyKey],
			message:
				`Conflicting values for deprecated permission '${conflict.legacyKey}' (${conflict.legacyValue}) ` +
				`and its replacement '${conflict.canonicalKey}' (${conflict.canonicalValue}); send only one spelling`
		});
	}
};

export const MeetPermissionsSchema: z.ZodType<MeetRoomMemberPermissions> = z
	.object(dualNamingPermissionShape())
	.superRefine((input, ctx) => {
		addPermissionConflictIssues(input, ctx);

		// Completeness: every canonical key must be defined once legacy spellings are expanded.
		const normalized = normalizePermissions(input);

		for (const key of MEET_PERMISSION_KEYS) {
			if (typeof normalized[key] !== 'boolean') {
				ctx.addIssue({
					code: 'custom',
					path: [key],
					message: `Missing permission '${key}'`
				});
			}
		}
	})
	.transform((input) => normalizePermissions(input) as MeetRoomMemberPermissions);

export const PartialMeetPermissionsSchema: z.ZodType<Partial<MeetRoomMemberPermissions>> = z
	.object(dualNamingPermissionShape())
	.superRefine(addPermissionConflictIssues)
	.transform((input) => normalizePermissions(input));

export const RoomMemberOptionsSchema: z.ZodType<MeetRoomMemberOptions> = z
	.object({
		userId: z
			.string()
			.regex(/^[a-z0-9_]+$/, 'userId must contain only lowercase letters, numbers, and underscores')
			.optional(),
		name: z.string().min(1, 'name cannot be empty').max(50, 'name cannot exceed 50 characters').optional(),
		baseRole: RoomMemberRoleSchema,
		customPermissions: PartialMeetPermissionsSchema.optional()
	})
	.refine(
		(data) => {
			// Either userId or name must be provided, but not both
			return (data.userId && !data.name) || (!data.userId && data.name);
		},
		{
			message: 'Either userId or name must be provided, but not both',
			path: ['userId']
		}
	);

export const RoomMemberFiltersSchema = z
	.object({
		name: z.string().optional(),
		nameMatchMode: z.enum(TextMatchMode).optional(),
		nameCaseInsensitive: z.preprocess((arg) => {
			if (typeof arg === 'string') {
				if (arg.toLowerCase() === 'true') return true;

				if (arg.toLowerCase() === 'false') return false;
			}

			return arg;
		}, z.boolean().optional().default(false)),
		baseRole: z.enum(MeetRoomMemberRole).optional(),
		type: z.enum(MeetRoomMemberType).optional(),
		fields: fieldsSchema,
		extraFields: extraFieldsSchema,
		maxItems: z.coerce
			.number()
			.positive('maxItems must be a positive number')
			.transform((val) => {
				// Convert the value to a number
				const intVal = Math.floor(val);
				// Ensure it's not greater than 100
				return intVal > 100 ? 100 : intVal;
			})
			.default(10),
		nextPageToken: z.string().optional(),
		sortField: z.enum(MEET_ROOM_MEMBER_SORT_FIELDS).optional().default('membershipDate'),
		sortOrder: z.enum(SortOrder).optional().default(SortOrder.DESC)
	})
	.superRefine((data, ctx) => {
		if (data.nameMatchMode === TextMatchMode.REGEX && data.name) {
			try {
				new RegExp(String(data.name));
			} catch {
				ctx.addIssue({
					code: 'custom',
					path: ['name'],
					message: 'Invalid regular expression pattern'
				});
			}
		}
	});

/**
 * Schema for validating fields/extraFields query params on single-member operations
 * (get/create/update), where no list filters/pagination apply.
 */
export const RoomMemberQueryFieldsSchema = z.object({
	fields: fieldsSchema,
	extraFields: extraFieldsSchema
});

/**
 * Schema for validating X-Fields and X-ExtraFields headers on room member operations.
 */
export const RoomMemberHeaderFieldsSchema = z.object({
	'x-fields': fieldsSchema,
	'x-extrafields': extraFieldsSchema
});

/**
 * Merges validated X-Fields / X-ExtraFields header values into query params (union, deduplicated),
 * so controllers can read field selection from req.query regardless of how the client supplied it.
 *
 * @param headers - The request headers object
 * @param query - The current query params object (will be mutated)
 */
export function mergeMemberHeaderFieldsIntoQuery(
	headers: Record<string, unknown>,
	query: Record<string, unknown>
): void {
	const headerResult = RoomMemberHeaderFieldsSchema.safeParse(headers);

	if (!headerResult.success) {
		// If headers are invalid, skip merging (they'll be ignored)
		return;
	}

	const headerFields = headerResult.data['x-fields'];
	const headerExtraFields = headerResult.data['x-extrafields'];

	if (headerFields) {
		const existingFields =
			typeof query.fields === 'string'
				? query.fields
						.split(',')
						.map((f: string) => f.trim())
						.filter((f: string) => f !== '')
				: [];
		query.fields = Array.from(new Set([...existingFields, ...headerFields])).join(',');
	}

	if (headerExtraFields) {
		const existingExtraFields =
			typeof query.extraFields === 'string'
				? query.extraFields
						.split(',')
						.map((f: string) => f.trim())
						.filter((f: string) => f !== '')
				: [];
		query.extraFields = Array.from(new Set([...existingExtraFields, ...headerExtraFields])).join(',');
	}
}

export const BulkDeleteRoomMembersReqSchema = z.object({
	memberIds: z.preprocess(
		(arg) => {
			if (typeof arg === 'string') {
				// If the argument is a string, it is expected to be a comma-separated list of member IDs.
				return arg
					.split(',')
					.map((s) => s.trim())
					.filter((s) => s !== '');
			}

			return [];
		},
		z.array(z.string()).min(1, {
			message: 'At least one memberId is required'
		})
	)
});

export const UpdateRoomMemberReqSchema = z.object({
	baseRole: RoomMemberRoleSchema.optional(),
	customPermissions: PartialMeetPermissionsSchema.optional()
});

export const RoomMemberTokenOptionsSchema: z.ZodType<MeetRoomMemberTokenOptions> = z.object({
	secret: z.string().optional(),
	joinMeeting: z.boolean().optional().default(false),
	participantName: z.string().optional()
});

export const RoomMemberTokenMetadataSchema: z.ZodType<MeetRoomMemberTokenMetadata> = z.object({
	iat: z.number(),
	roomId: z.string(),
	memberId: z.string().optional(),
	userId: z.string().optional(),
	permissions: MeetPermissionsSchema,
	badge: z.enum(MeetRoomMemberUIBadge),
	isPromotedModerator: z.boolean().optional(),
	livekitUrl: z.url('LiveKit URL must be a valid URL').optional()
});
