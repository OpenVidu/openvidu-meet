import {
	MeetRoomMemberFilters,
	MeetRoomMemberOptions,
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberTokenOptions
} from '@openvidu-meet/typings';
import { z } from 'zod';

const RoomMemberRoleSchema: z.ZodType<MeetRoomMemberRole> = z.nativeEnum(MeetRoomMemberRole);

export const MeetPermissionsSchema: z.ZodType<MeetRoomMemberPermissions> = z.object({
	canRecord: z.boolean(),
	canRetrieveRecordings: z.boolean(),
	canDeleteRecordings: z.boolean(),
	canJoinMeeting: z.boolean(),
	canShareAccessLinks: z.boolean(),
	canMakeModerator: z.boolean(),
	canKickParticipants: z.boolean(),
	canEndMeeting: z.boolean(),
	canPublishVideo: z.boolean(),
	canPublishAudio: z.boolean(),
	canShareScreen: z.boolean(),
	canReadChat: z.boolean(),
	canWriteChat: z.boolean(),
	canChangeVirtualBackground: z.boolean()
});

export const PartialMeetPermissionsSchema: z.ZodType<Partial<MeetRoomMemberPermissions>> = z.object({
	canRecord: z.boolean().optional(),
	canRetrieveRecordings: z.boolean().optional(),
	canDeleteRecordings: z.boolean().optional(),
	canJoinMeeting: z.boolean().optional(),
	canShareAccessLinks: z.boolean().optional(),
	canMakeModerator: z.boolean().optional(),
	canKickParticipants: z.boolean().optional(),
	canEndMeeting: z.boolean().optional(),
	canPublishVideo: z.boolean().optional(),
	canPublishAudio: z.boolean().optional(),
	canShareScreen: z.boolean().optional(),
	canReadChat: z.boolean().optional(),
	canWriteChat: z.boolean().optional(),
	canChangeVirtualBackground: z.boolean().optional()
});

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

export const RoomMemberFiltersSchema: z.ZodType<MeetRoomMemberFilters> = z.object({
	name: z.string().optional(),
	fields: z.string().optional(),
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
	nextPageToken: z.string().optional()
});

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

export const RoomMemberTokenOptionsSchema: z.ZodType<MeetRoomMemberTokenOptions> = z
	.object({
		secret: z.string().optional(),
		grantJoinMeetingPermission: z.boolean().optional().default(false),
		participantName: z.string().optional(),
		participantIdentity: z.string().optional()
	})
	.refine(
		(data) => {
			// If grantJoinMeetingPermission is true, participantName must be provided
			return !data.grantJoinMeetingPermission || data.participantName;
		},
		{
			message: 'participantName is required when grantJoinMeetingPermission is true',
			path: ['participantName']
		}
	);

export const RoomMemberTokenMetadataSchema: z.ZodType<MeetRoomMemberTokenMetadata> = z.object({
	livekitUrl: z.string().url('LiveKit URL must be a valid URL'),
	roomId: z.string(),
	baseRole: RoomMemberRoleSchema,
	customPermissions: PartialMeetPermissionsSchema.optional(),
	effectivePermissions: MeetPermissionsSchema
});
