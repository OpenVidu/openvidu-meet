import { expect, Locator, Page } from '@playwright/test';

// ─── Web Component / Shadow-DOM boundary crossing ───────────────────────────
//
// The OpenVidu Meet WebComponent is an Angular Elements custom element that
// renders its UI inside an open Shadow DOM root (`ViewEncapsulation.ShadowDom`
// on the App component). Playwright's CSS engine pierces open shadow roots
// transparently, so descendant queries through the host locator find shadow
// children directly.
//
// Function names are intentionally kept (`inIframe`, `iframeLocator`,
// `expectVisibleInIframe`) so legacy test files don't need to change — the
// "iframe" in the names is a leftover from the previous iframe-based
// architecture and now refers to the WC boundary in general.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_COMPONENT_SELECTOR = 'openvidu-meet';

/**
 * Returns a `Locator` scoped to the `<openvidu-meet>` host element. Any
 * descendant query made through this locator pierces the open Shadow DOM
 * automatically — Playwright handles this without an explicit `>>>` combinator.
 */
export const inIframe = (page: Page, componentSelector: string = DEFAULT_COMPONENT_SELECTOR): Locator =>
	page.locator(componentSelector);

/**
 * Returns a `Locator` for `selector` resolved inside the web component
 * (Shadow DOM is pierced).
 */
export const iframeLocator = (page: Page, selector: string): Locator => inIframe(page).locator(selector);

/**
 * Asserts that the targeted element inside the web component becomes visible
 * within `timeout`, then returns the same locator so callers can chain.
 */
export const expectVisibleInIframe = async (
	page: Page,
	selector: string,
	options: { timeout?: number } = {}
): Promise<Locator> => {
	const locator = iframeLocator(page, selector);
	await expect(locator).toBeVisible({ timeout: options.timeout });
	return locator;
};

/**
 * Waits until the page URL changes to one that starts with
 * {@link expectedUrlPrefix}. Used to assert `leave-redirect-url` navigations:
 * the Angular Elements WC runs in the host's window, so the redirect happens
 * on `window.location.href` and the page URL changes directly.
 */
export const waitForPageRedirect = async (
	page: Page,
	expectedUrlPrefix: string,
	timeout = 10_000
): Promise<void> => {
	await page.waitForURL((url) => url.toString().startsWith(expectedUrlPrefix), { timeout });
};
