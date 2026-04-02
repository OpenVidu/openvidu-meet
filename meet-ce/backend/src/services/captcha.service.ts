import { GuestCaptchaConfig } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MEET_ENV } from '../environment.js';
import {
	errorCaptchaNotConfigured,
	errorCaptchaTokenRequired,
	errorCaptchaValidationFailed,
	internalError
} from '../models/error.model.js';
import { LoggerService } from './logger.service.js';

interface RecaptchaVerifyResponse {
	success: boolean;
	'h-score'?: number;
	action?: string;
	'error-codes'?: string[];
}

@injectable()
export class CaptchaService {
	constructor(@inject(LoggerService) private logger: LoggerService) {}

	isGuestCaptchaEnabled(): boolean {
		return MEET_ENV.GUEST_CAPTCHA_ENABLED.toLowerCase() === 'true';
	}

	getGuestCaptchaConfig(): GuestCaptchaConfig {
		return {
			enabled: this.isGuestCaptchaEnabled(),
			provider: 'recaptcha-v2',
			siteKey: MEET_ENV.GUEST_CAPTCHA_SITE_KEY || undefined
		};
	}

	async validateGuestCaptcha(token?: string, remoteIp?: string | string[]): Promise<void> {
		if (!this.isGuestCaptchaEnabled()) {
			return;
		}

		if (!token) {
			throw errorCaptchaTokenRequired();
		}

		const secret = MEET_ENV.GUEST_CAPTCHA_SECRET_KEY;
		if (!secret) {
			this.logger.error('Captcha secret key is not configured but captcha is enabled');
			throw errorCaptchaNotConfigured();
		}

		const payload = new URLSearchParams();
		payload.append('secret', secret);
		payload.append('response', token);

		const clientIp = this.extractClientIp(remoteIp);
		if (clientIp) {
			payload.append('remoteip', clientIp);
		}

		let response: Awaited<ReturnType<typeof fetch>>;
		try {
			response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: payload.toString()
			});
		} catch (error) {
			this.logger.error('Error calling reCAPTCHA verification endpoint', error);
			throw internalError('verifying captcha token');
		}

		if (!response.ok) {
			this.logger.error(`reCAPTCHA verification responded with HTTP ${response.status}`);
			throw internalError('verifying captcha token');
		}

		const result = (await response.json()) as RecaptchaVerifyResponse;
		if (!result.success) {
			this.logger.warn('Captcha verification failed', result['error-codes']);
			throw errorCaptchaValidationFailed();
		}
	}

	private extractClientIp(remoteIp?: string | string[]): string | undefined {
		if (!remoteIp) {
			return undefined;
		}

		const rawIp = Array.isArray(remoteIp) ? remoteIp[0] : remoteIp;
		const candidate = rawIp.split(',')[0]?.trim();
		return candidate || undefined;
	}
}
