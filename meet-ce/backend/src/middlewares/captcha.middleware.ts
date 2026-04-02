import { MeetRoomMemberTokenOptions } from '@openvidu-meet/typings';
import { NextFunction, Request, Response } from 'express';
import { container } from '../config/dependency-injector.config.js';
import { handleError } from '../models/error.model.js';
import { CaptchaService } from '../services/captcha.service.js';

export const validateGuestCaptcha = async (req: Request, res: Response, next: NextFunction) => {
	const captchaService = container.get(CaptchaService);

	if (!captchaService.isGuestCaptchaEnabled()) {
		return next();
	}

	const tokenOptions = req.body as MeetRoomMemberTokenOptions;
	if (!tokenOptions.grantJoinMeetingPermission) {
		return next();
	}

	try {
		await captchaService.validateGuestCaptcha(tokenOptions.captchaToken, req.headers['x-forwarded-for'] || req.ip);
		return next();
	} catch (error) {
		return handleError(res, error, 'validating captcha');
	}
};
