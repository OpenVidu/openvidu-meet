import { z } from 'zod';

export const LoginReqSchema = z.object({
	username: z.string().min(4, 'Username must be at least 4 characters long'),
	password: z.string().min(4, 'Password must be at least 4 characters long')
});
