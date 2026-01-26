import { z } from 'zod';

export const LoginReqSchema = z.object({
	userId: z.string().min(4, 'User ID must be at least 4 characters long'),
	password: z.string().min(4, 'Password must be at least 4 characters long')
});
