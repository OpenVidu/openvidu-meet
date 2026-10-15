import { z } from 'zod';
import { MeetRoomHelper } from '../../helpers/room.helper.js';

export const nonEmptySanitizedRoomId = (fieldName: string) =>
	z
		.string()
		.min(1, { message: `${fieldName} is required and cannot be empty` })
		.max(100, { message: `${fieldName} cannot exceed 100 characters` })
		.transform((value) => MeetRoomHelper.sanitizeRoomId(value))
		.refine((data) => data !== '', {
			message: `${fieldName} cannot be empty after sanitization`
		});
