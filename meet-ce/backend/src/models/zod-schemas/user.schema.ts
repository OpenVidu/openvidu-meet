import { MeetUserFilters, MeetUserOptions, MeetUserRole } from '@openvidu-meet/typings';
import { z } from 'zod';

export const UserOptionsSchema: z.ZodType<MeetUserOptions> = z.object({
	userId: z
		.string()
		.min(5, 'userId must be at least 5 characters long')
		.max(20, 'userId cannot exceed 20 characters')
		.regex(/^[a-z0-9_]+$/, 'userId must contain only lowercase letters, numbers, and underscores'),
	name: z.string().min(1, 'name is required and cannot be empty').max(50, 'name cannot exceed 50 characters'),
	role: z.nativeEnum(MeetUserRole),
	password: z.string().min(5, 'password must be at least 5 characters long')
});

export const UserFiltersSchema: z.ZodType<MeetUserFilters> = z.object({
	userId: z.string().optional(),
	name: z.string().optional(),
	role: z.nativeEnum(MeetUserRole).optional(),
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
	sortField: z.enum(['name', 'registrationDate']).optional().default('registrationDate'),
	sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
});

export const BulkDeleteUsersReqSchema = z.object({
	userIds: z.preprocess(
		(arg) => {
			if (typeof arg === 'string') {
				// If the argument is a string, it is expected to be a comma-separated list of user IDs.
				return arg
					.split(',')
					.map((s) => s.trim())
					.filter((s) => s !== '');
			}

			return [];
		},
		z.array(z.string()).min(1, {
			message: 'At least one userId is required'
		})
	)
});

export const ChangePasswordReqSchema = z.object({
	currentPassword: z.string(),
	newPassword: z.string().min(5, 'New password must be at least 5 characters long')
});

export const ResetUserPasswordReqSchema = z.object({
	newPassword: z.string().min(5, 'New password must be at least 5 characters long')
});

export const UpdateUserRoleReqSchema = z.object({
	role: z.nativeEnum(MeetUserRole)
});
