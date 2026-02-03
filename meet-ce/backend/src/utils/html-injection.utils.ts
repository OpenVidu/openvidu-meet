import chalk from 'chalk';
import fs from 'fs';
import { MEET_ENV } from '../environment.js';

let cachedHtml: string | null = null;
let configValidated = false;

/**
 * Normalizes the base path to ensure it starts and ends with /
 * @param basePath The base path to normalize
 * @returns Normalized base path (e.g., '/', '/meet/', '/app/path/')
 */
export function normalizeBasePath(basePath: string): string {
	let normalized = basePath.trim();

	// Handle empty string
	if (!normalized) {
		return '/';
	}

	// Ensure it starts with /
	if (!normalized.startsWith('/')) {
		normalized = '/' + normalized;
	}

	// Ensure it ends with /
	if (!normalized.endsWith('/')) {
		normalized = normalized + '/';
	}

	return normalized;
}

/**
 * Validates the BASE_URL and BASE_PATH configuration and warns about potential issues.
 * Only runs once per process.
 */
function validateBasePathConfig(): void {
	if (configValidated) return;

	configValidated = true;

	const baseUrl = MEET_ENV.BASE_URL;
	const basePath = MEET_ENV.BASE_PATH;

	if (baseUrl) {
		try {
			const url = new URL(baseUrl);

			// Check if BASE_URL contains a path (other than just /)
			if (url.pathname && url.pathname !== '/') {
				console.warn(
					chalk.yellow('⚠️  WARNING: MEET_BASE_URL contains a path segment:'),
					chalk.cyan(url.pathname)
				);
				console.warn(
					chalk.yellow(
						'   MEET_BASE_URL should only contain https protocol and host (e.g., https://example.com)'
					)
				);
				console.warn(chalk.yellow('   Use MEET_BASE_PATH for the deployment path (e.g., /meet/)'));

				if (basePath && basePath !== '/') {
					console.warn(
						chalk.red(`   This may cause issues: BASE_URL path "${url.pathname}" + BASE_PATH "${basePath}"`)
					);
				}
			}
		} catch {
			console.warn(chalk.yellow('⚠️  WARNING: MEET_BASE_URL is not a valid URL:'), chalk.cyan(baseUrl));
		}
	}
}

/**
 * Gets the configured base path, normalized
 * @returns The normalized base path from MEET_BASE_PATH environment variable
 */
export function getBasePath(): string {
	validateBasePathConfig();
	return normalizeBasePath(MEET_ENV.BASE_PATH);
}

/**
 * Injects runtime configuration into the index.html
 * - Replaces the <base href="/"> tag with the configured base path
 * - Injects a script with window.__OPENVIDU_MEET_CONFIG__ for frontend access
 *
 * @param htmlPath Path to the index.html file
 * @returns The modified HTML content
 */
export function getInjectedHtml(htmlPath: string): string {
	// In production, cache the result for performance
	if (process.env.NODE_ENV === 'production' && cachedHtml) {
		return cachedHtml;
	}

	const basePath = getBasePath();
	let html = fs.readFileSync(htmlPath, 'utf-8');

	// Replace the base href - handle both possible formats
	html = html.replace(/<base href="[^"]*"\s*\/?>/i, `<base href="${basePath}">`);

	// Inject runtime configuration script before the closing </head> tag
	const configScript = `<script>window.__OPENVIDU_MEET_CONFIG__={basePath:"${basePath}"};</script>`;
	html = html.replace('</head>', `${configScript}\n</head>`);

	if (process.env.NODE_ENV === 'production') {
		cachedHtml = html;
	}

	return html;
}

/**
 * Clears the cached HTML (useful for testing or config changes)
 */
export function clearHtmlCache(): void {
	cachedHtml = null;
}
