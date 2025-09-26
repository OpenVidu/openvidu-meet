import { container } from '../config/dependency-injector.config.js';
import { MEET_BASE_URL } from '../environment.js';
import { HttpContextService } from '../services/http-context.service.js';

/**
 * Returns the base URL for the application.
 *
 * If the global `MEET_BASE_URL` variable is defined, it returns its value,
 * ensuring there is no trailing slash. Otherwise, it retrieves the base URL
 * from the `HttpContextService` instance.
 *
 * @returns {string} The base URL as a string.
 */
export const getBaseUrl = (): string => {
	if (MEET_BASE_URL) {
		return MEET_BASE_URL.endsWith('/') ? MEET_BASE_URL.slice(0, -1) : MEET_BASE_URL;
	}

	const httpContextService = container.get(HttpContextService);
	return httpContextService.getBaseUrl();
};
