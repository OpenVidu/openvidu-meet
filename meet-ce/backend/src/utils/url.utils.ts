import { container } from '../config/dependency-injector.config.js';
import { MEET_BASE_URL } from '../environment.js';
import { BaseUrlService } from '../services/base-url.service.js';

/**
 * Returns the base URL for the application.
 *
 * If the global `MEET_BASE_URL` variable is defined, it returns its value,
 * ensuring there is no trailing slash and removing default ports (443 for HTTPS, 80 for HTTP).
 * Otherwise, it retrieves the base URL from the `HttpContextService` instance.
 *
 * @returns {string} The base URL as a string.
 */
export const getBaseUrl = (): string => {
	if (MEET_BASE_URL) {
		let baseUrl = MEET_BASE_URL.endsWith('/') ? MEET_BASE_URL.slice(0, -1) : MEET_BASE_URL;

		// Remove default port 443 for HTTPS URLs
		if (baseUrl.startsWith('https://') && baseUrl.includes(':443')) {
			baseUrl = baseUrl.replace(':443', '');
		}

		// Remove default port 80 for HTTP URLs
		if (baseUrl.startsWith('http://') && baseUrl.includes(':80')) {
			baseUrl = baseUrl.replace(':80', '');
		}

		return baseUrl;
	}

	const baseUrlService = container.get(BaseUrlService);
	return baseUrlService.getBaseUrl();
};
