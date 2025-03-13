import { CookieOptions } from 'express';
import ms, { StringValue } from 'ms';

export const getCookieOptions = (path: string, expiration: string): CookieOptions => {
	return {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		maxAge: ms(expiration as StringValue),
		path
	};
};
