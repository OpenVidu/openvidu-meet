import { type Page, type Route } from '@playwright/test';

/**
 * Simulated token-expiry controller for exercising the HTTP interceptor's refresh cascade.
 *
 * The mechanism is a single header-inspecting `page.route` over the Meet API paths. Tokens are not
 * really expired server-side (that would require waiting or shrinking backend TTLs); instead, a
 * *normal* API request is answered with a simulated 401 when the token that would authorize it is
 * marked expired.
 *
 * The 401 rule mirrors the backend's `withAuth` (see auth.middleware.ts), which is **priority
 * short-circuit, not "any valid token wins"**: the highest-priority credential *present* on the
 * request decides, and lower-priority credentials are never consulted. The frontend only ever sends a
 * room member token (RMT) and/or an access token (AT), and the RMT outranks the AT — so when an RMT
 * is present it alone decides (an expired RMT ⇒ 401 even if the AT is still valid); the AT decides
 * only when no RMT is present. This was verified against a live backend: `garbage RMT + valid AT`
 * returns 401, not 200.
 *
 * The mint (`…/members/token`) and access-refresh (`…/auth/refresh`) endpoints are let through so the
 * interceptor's recovery genuinely mints fresh (non-expired) tokens that then pass — with two
 * backend-faithful exceptions: `…/auth/refresh` replies 400 (`errorInvalidRefreshToken`) when its
 * refresh token is expired (forcing logout), and a *user-access* mint (one whose body carries no room
 * `secret`) replies 401 when its access token is expired — so recovery must refresh the access token
 * before it can mint. A *secret-based* mint (anonymous/guest link) authenticates via the room secret,
 * so it succeeds regardless of the access token. Note the frontend also fires a best-effort
 * `…/auth/refresh` before every mint for authenticated users, so `authRefreshCount` alone does not
 * imply a reactive recovery — `blockedCount` (a simulated 401/400 was emitted) is the reliable
 * "the cascade actually engaged" signal.
 *
 * Every simulated failure mirrors the backend's real status + payload: 401 `Invalid token` for an
 * expired access/room-member token, 401 `Unauthorized` when the mint is revoked, 400 `Invalid refresh
 * token` at `/auth/refresh`.
 *
 * Assertions read the counters (`authRefreshCount`, `rmtMintCount`, `blockedCount`) and the resulting
 * view rather than relying on timing, which keeps the tests deterministic under `retries: 0`.
 */
export interface TokenExpiryController {
	/** Snapshots the current access token from storage and marks it expired. */
	expireAccessToken(): Promise<void>;
	/** Snapshots the current refresh token and makes `POST …/auth/refresh` reply 400 while it carries it. */
	expireRefreshToken(): Promise<void>;
	/** Marks the last-seen room member token expired, and arms "expire the next RMT seen". */
	expireRoomMemberToken(): void;
	/** Forces the RMT mint endpoint itself to 401 (room-access-revoked scenario). */
	revokeRoomMemberAccess(): void;
	/** Clears all expiry state. */
	reviveAll(): void;
	/** Removes the route handler. Safe to call in a `finally`/`afterEach`. */
	dispose(): Promise<void>;

	/** Number of `POST …/auth/refresh` requests observed. */
	authRefreshCount(): number;
	/** Number of `POST …/members/token` (mint) requests observed. */
	rmtMintCount(): number;
	/** Number of `POST …/members/token/refresh` (proactive scheduler) requests observed. */
	rmtRefreshCount(): number;
	/** Number of simulated auth-failure responses emitted — 401 or 400 (proves the mock actually engaged). */
	blockedCount(): number;
}

const bearer = (value?: string): string | undefined => value?.replace(/^Bearer\s+/i, '').trim() || undefined;

/** Parses a request body as JSON, returning undefined when it is absent or not JSON. */
const parseBody = (data: string | null): Record<string, unknown> | undefined => {
	if (!data) {
		return undefined;
	}
	try {
		return JSON.parse(data) as Record<string, unknown>;
	} catch {
		return undefined;
	}
};

const API_PATH_MATCHER = /\/(api|internal-api)\/v1\//;

/**
 * Installs the token-expiry route handler on the page and returns a {@link TokenExpiryController}.
 * Call once, after the page is created and before the navigation whose requests should be affected.
 */
export const installTokenExpiryController = async (page: Page): Promise<TokenExpiryController> => {
	const expired = new Set<string>(); // access + RMT values treated as expired
	const refreshExpired = new Set<string>(); // refresh token values treated as expired
	let lastSeenRmt: string | undefined;
	let captureNextRmt = false;
	let rmtMintRevoked = false;

	let authRefreshes = 0;
	let rmtMints = 0;
	let rmtRefreshes = 0;
	let blocked = 0;

	const fulfillError = (route: Route, status: number, error: string, message: string): Promise<void> =>
		route.fulfill({
			status,
			contentType: 'application/json',
			body: JSON.stringify({ error, message })
		});

	const handler = async (route: Route): Promise<void> => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		const headers = request.headers(); // header names are lower-cased

		const access = bearer(headers['authorization']);
		const rmt = bearer(headers['x-room-member-token']);
		const refresh = bearer(headers['x-refresh-token']);
		const skipRecovery = headers['x-ov-skip-auth-recovery'] === 'true';

		if (rmt) {
			lastSeenRmt = rmt;

			if (captureNextRmt) {
				expired.add(rmt);
				captureNextRmt = false;
			}
		}

		// Access-token refresh: only reject (400) when its refresh token is marked expired (logout scenario).
		if (path.endsWith('/auth/refresh')) {
			authRefreshes++;

			if (refresh && refreshExpired.has(refresh)) {
				blocked++;
				return fulfillError(route, 400, 'Refresh Token Error', 'Invalid refresh token');
			}

			return route.continue();
		}

		// RMT mint / proactive refresh endpoints: let recovery genuinely mint fresh tokens.
		if (/\/members\/token\/refresh$/.test(path)) {
			rmtRefreshes++;
			return route.continue();
		}

		if (/\/members\/token$/.test(path)) {
			rmtMints++;

			if (rmtMintRevoked) {
				blocked++;
				return fulfillError(route, 401, 'Authentication Error', 'Unauthorized');
			}

			// A user-access mint (no room secret in the body) authenticates via the access token, so an
			// expired one makes it 401 — recovery must refresh the access token first, then retry the mint.
			// A secret-based mint (anonymous/guest link) authenticates via the room secret and is unaffected.
			const hasSecret = !!parseBody(request.postData())?.secret;
			if (!hasSecret && access && expired.has(access)) {
				blocked++;
				return fulfillError(route, 401, 'Authentication Error', 'Invalid token');
			}

			return route.continue();
		}

		// The profile endpoint is excluded from interceptor recovery, and the logout endpoint must
		// always succeed so a failed refresh can complete logout (clear tokens + redirect to login).
		if (path.endsWith('/users/me') || path.endsWith('/auth/logout')) {
			return route.continue();
		}

		// A normal API request: the credential that authorizes it is the highest-priority one present
		// (RMT outranks AT), matching the backend's short-circuit `withAuth`. 401 it when that deciding
		// credential is expired and the request did not opt out of recovery.
		const deciding = rmt ?? access;
		if (!skipRecovery && deciding && expired.has(deciding)) {
			blocked++;
			return fulfillError(route, 401, 'Authentication Error', 'Invalid token');
		}

		return route.continue();
	};

	await page.route(API_PATH_MATCHER, handler);

	return {
		expireAccessToken: async () => {
			const token = await page.evaluate(() => localStorage.getItem('ovMeet-accessToken'));

			if (token) {
				expired.add(token);
			}
		},
		expireRefreshToken: async () => {
			const token = await page.evaluate(() => localStorage.getItem('ovMeet-refreshToken'));

			if (token) {
				refreshExpired.add(token);
			}
		},
		expireRoomMemberToken: () => {
			// If an RMT has already been observed (e.g. the page has loaded), mark just that value
			// expired so the freshly-minted replacement is not re-expired. Otherwise (armed before
			// navigation) capture the first RMT that appears — the one the triggering request will use.
			if (lastSeenRmt) {
				expired.add(lastSeenRmt);
			} else {
				captureNextRmt = true;
			}
		},
		revokeRoomMemberAccess: () => {
			rmtMintRevoked = true;
		},
		reviveAll: () => {
			expired.clear();
			refreshExpired.clear();
			captureNextRmt = false;
			rmtMintRevoked = false;
		},
		dispose: async () => {
			await page.unroute(API_PATH_MATCHER, handler);
		},
		authRefreshCount: () => authRefreshes,
		rmtMintCount: () => rmtMints,
		rmtRefreshCount: () => rmtRefreshes,
		blockedCount: () => blocked
	};
};
