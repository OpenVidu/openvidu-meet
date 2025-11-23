import { z } from 'zod';

export const ChangePasswordReqSchema = z.object({
	currentPassword: z.string(),
	newPassword: z.string().min(5, 'New password must be at least 5 characters long')
});
