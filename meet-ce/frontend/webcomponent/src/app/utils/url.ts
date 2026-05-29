/**
 * Returns the last non-empty path segment of a URL.
 * @example lastPathSegment("https://demo.openvidu.io/room/my-room") → "my-room"
 */
export function lastPathSegment(rawUrl: string): string | null {
	try {
		const segments = new URL(rawUrl).pathname.split('/').filter(Boolean);
		return segments[segments.length - 1] ?? null;
	} catch {
		return null;
	}
}

/** Returns the value of a query parameter from a URL, or `null` if absent or invalid. */
export function queryParam(rawUrl: string, name: string): string | null {
	try {
		return new URL(rawUrl).searchParams.get(name);
	} catch {
		return null;
	}
}

/**
 * Extracts the server base URL up to (but not including) the marker segment.
 * @example computeServerUrl("http://localhost:6080/meet/room/my-room", "/room/") → "http://localhost:6080/meet"
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
