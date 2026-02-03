import { container } from '../config/dependency-injector.config.js';
import { MEET_ENV } from '../environment.js';
import { BaseUrlService } from '../services/base-url.service.js';
import { getBasePath } from './html-injection.utils.js';

/**
 * Returns the base URL for the application, including the configured base path.
 *
 * If the global `BASE_URL` variable is defined, it returns its value,
 * ensuring there is no trailing slash and removing default ports (443 for HTTPS, 80 for HTTP).
 * Otherwise, it retrieves the base URL from the `HttpContextService` instance.
 *
 * The configured BASE_PATH is appended to the URL (without trailing slash).
 *
 * @returns {string} The base URL as a string (e.g., 'https://example.com/meet').
 */
export const getBaseUrl = (): string => {
	let hostUrl: string;

	if (MEET_ENV.BASE_URL) {
		hostUrl = MEET_ENV.BASE_URL.endsWith('/') ? MEET_ENV.BASE_URL.slice(0, -1) : MEET_ENV.BASE_URL;

		// Remove default port 443 for HTTPS URLs
		if (hostUrl.startsWith('https://') && hostUrl.includes(':443')) {
			hostUrl = hostUrl.replace(':443', '');
		}

		// Remove default port 80 for HTTP URLs
		if (hostUrl.startsWith('http://') && hostUrl.includes(':80')) {
			hostUrl = hostUrl.replace(':80', '');
		}
	} else {
		const baseUrlService = container.get(BaseUrlService);
		hostUrl = baseUrlService.getBaseUrl();
	}

	// Append the base path (without trailing slash)
	const basePath = getBasePath();

	if (basePath === '/') {
		return hostUrl;
	}

	// Remove trailing slash from base path for the final URL
	return `${hostUrl}${basePath.slice(0, -1)}`;
};
