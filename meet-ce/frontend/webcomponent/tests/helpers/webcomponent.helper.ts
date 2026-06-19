import { expect, Locator, Page } from '@playwright/test';

// ─── Web Component / Shadow-DOM boundary crossing ───────────────────────────
//
// The OpenVidu Meet WebComponent is an Angular Elements custom element that
// renders its UI directly inside an open Shadow DOM root
// (`ViewEncapsulation.ShadowDom` on the App component) — there is no iframe.
// Playwright's CSS engine pierces open shadow roots transparently, so
// descendant queries through the host locator find shadow children directly.
//
// Scoping every query to the `<openvidu-meet>` host also disambiguates
// WC-internal elements from the testapp's own DOM (e.g. the testapp's
// `#leave-room-btn` control vs. the WC's in-meeting `#leave-btn`).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_COMPONENT_SELECTOR = 'openvidu-meet';

/**
 * Returns a `Locator` scoped to the `<openvidu-meet>` host element. Any
 * descendant query made through this locator pierces the open Shadow DOM
 * automatically — Playwright handles this without an explicit `>>>` combinator.
 */
export const wcHost = (page: Page, componentSelector: string = DEFAULT_COMPONENT_SELECTOR): Locator =>
	page.locator(componentSelector);

/**
 * Returns a `Locator` for `selector` resolved inside the web component
 * (Shadow DOM is pierced).
 */
export const wcLocator = (page: Page, selector: string): Locator => wcHost(page).locator(selector);

// ─── Integration-agnostic locator ───────────────────────────────────────────
//
// The testapp embeds Meet through one of two transports; the meeting UI itself
// is the same SPA either way, only reached differently:
// - webcomponent: rendered inside the `<openvidu-meet>` open Shadow DOM.
// - iframe: rendered inside a cross-document `<iframe>`.
// `meetLocator` hides that difference so the same spec drives both.
// ─────────────────────────────────────────────────────────────────────────────

export type Integration = 'webcomponent' | 'iframe';

/** The integrations the e2e suite runs every command/event spec against. */
export const INTEGRATIONS: readonly Integration[] = ['webcomponent', 'iframe'];

const IFRAME_SELECTOR = '[data-testid="meet-iframe"]';

/**
 * Locator for `selector` inside the active meeting view for the given integration:
 * webcomponent pierces the Shadow DOM; iframe resolves inside the embedded document.
 */
export const meetLocator = (page: Page, integration: Integration, selector: string): Locator =>
	integration === 'iframe' ? page.frameLocator(IFRAME_SELECTOR).locator(selector) : wcLocator(page, selector);

/**
 * Asserts that the targeted element inside the web component becomes visible
 * within `timeout`, then returns the same locator so callers can chain.
 */
export const expectVisibleInWc = async (
	page: Page,
	selector: string,
	options: { timeout?: number } = {}
): Promise<Locator> => {
	const locator = wcLocator(page, selector);
	await expect(locator).toBeVisible({ timeout: options.timeout });
	return locator;
};

/**
 * Waits until the page URL changes to one that starts with
 * {@link expectedUrlPrefix}. Used to assert `leave-redirect-url` navigations:
 * the Angular Elements WC runs in the host's window, so the redirect happens
 * on `window.location.href` and the page URL changes directly.
 */
export const waitForPageRedirect = async (page: Page, expectedUrlPrefix: string, timeout = 10_000): Promise<void> => {
	await page.waitForURL((url) => url.toString().startsWith(expectedUrlPrefix), { timeout });
};
