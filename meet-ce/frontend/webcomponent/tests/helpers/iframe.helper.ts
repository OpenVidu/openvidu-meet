import { expect, FrameLocator, Locator, Page } from '@playwright/test';

// ─── Shadow-DOM / iframe boundary crossing ──────────────────────────────────
//
// The OpenVidu Meet WebComponent renders its UI inside an <iframe> within a
// Shadow DOM. These helpers expose Playwright `FrameLocator` / `Locator`
// objects so tests can use the standard web-first assertion API directly
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_COMPONENT_SELECTOR = 'openvidu-meet';
const DEFAULT_IFRAME_SELECTOR = 'iframe';

/**
 * Returns the `FrameLocator` for the iframe rendered inside the web component's
 * Shadow DOM. `FrameLocator` is lazy; actions performed through it auto-wait
 * for the iframe to be present.
 */
export const inIframe = (
	page: Page,
	componentSelector: string = DEFAULT_COMPONENT_SELECTOR,
	iframeSelector: string = DEFAULT_IFRAME_SELECTOR
): FrameLocator => page.frameLocator(`${componentSelector} >>> ${iframeSelector}`);

/**
 * Convenience wrapper: returns a `Locator` for `selector` inside the web
 * component's iframe.
 */
export const iframeLocator = (page: Page, selector: string): Locator => inIframe(page).locator(selector);

/**
 * Asserts that the targeted iframe element becomes visible within `timeout`,
 * then returns the same locator so callers can chain further actions.
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
 * Waits until the parent page navigates to a URL starting with
 * {@link expectedUrlPrefix}. Used to assert `leave-redirect-url` navigations:
 * in WebComponent (embedded) mode, the redirect happens on `window.top`, so
 * the parent page URL changes — the iframe `src` is not updated.
 */
export const waitForPageRedirect = async (
	page: Page,
	expectedUrlPrefix: string,
	timeout = 10_000
): Promise<void> => {
	await page.waitForURL((url) => url.toString().startsWith(expectedUrlPrefix), { timeout });
};
