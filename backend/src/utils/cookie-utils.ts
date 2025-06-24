import { CookieOptions } from 'express';
import ms, { StringValue } from 'ms';
import { MEET_COOKIE_SECURE } from '../environment.js';

export const getCookieOptions = (path: string, expiration: string): CookieOptions => {
	return {
		httpOnly: true,
		secure: MEET_COOKIE_SECURE === 'true',
		sameSite: 'strict',
		maxAge: ms(expiration as StringValue),
		path
	};
};
