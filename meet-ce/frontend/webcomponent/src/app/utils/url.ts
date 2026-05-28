/**
 * Pure URL helpers shared across mode bootstrappers and the App component.
 *
 * Every function tolerates non-URL input and returns `null` rather than
 * throwing, so callers can safely apply them to user-supplied attribute values.
 */

/**
 * Returns the last non-empty path segment of a URL.
 *
 * @example
 * lastPathSegment("https://demo.openvidu.io/room/my-room") → "my-room"
 */
export function lastPathSegment(rawUrl: string): string | null {
	try {
		const segments = new URL(rawUrl).pathname.split('/').filter(Boolean);
		return segments[segments.length - 1] ?? null;
	} catch {
		return null;
	}
}

/**
 * Returns the value of a query parameter from a URL, or `null` if absent or
 * the input is not a valid URL.
 */
export function queryParam(rawUrl: string, name: string): string | null {
	try {
		return new URL(rawUrl).searchParams.get(name);
	} catch {
		return null;
	}
}

/**
 * Computes the server base URL from a full URL by extracting the origin + path
 * prefix up to (but not including) the given marker segment.
 *
 * @example
 * computeServerUrl("http://localhost:6080/meet/room/my-room?secret=abc", "/room/")
 *   → "http://localhost:6080/meet"
 * computeServerUrl("https://demo.openvidu.io/recording/abc--xyz", "/recording/")
 *   → "https://demo.openvidu.io"
 */
export function computeServerUrl(rawUrl: string, marker: string): string | null {
	if (!rawUrl) return null;

	try {
		const parsed = new URL(rawUrl);
		const idx = parsed.pathname.indexOf(marker);
		if (idx === -1) return null;
		return `${parsed.origin}${parsed.pathname.slice(0, idx)}`;
	} catch {
		return null;
	}
}
