import { CookieOptions } from 'express';
import ms, { StringValue } from 'ms';

export const getCookieOptions = (path: string, expiration?: string): CookieOptions => {
	return {
		httpOnly: true,
		secure: true,
		sameSite: 'none',
		maxAge: expiration ? ms(expiration as StringValue) : undefined,
		path
	};
};
