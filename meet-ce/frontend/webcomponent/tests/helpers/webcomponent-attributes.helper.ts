import { WebComponentProperty } from '@openvidu-meet/typings';
import { expect, type Page } from '@playwright/test';
import { MEET_TESTAPP_URL, MEET_WEBCOMPONENT_SRC } from '../config';
import { iframeLocator } from './iframe.helper';

// ─── Custom <openvidu-meet> page setup ──────────────────────────────────────
//
// These helpers render the `<openvidu-meet>` web component on a blank page
// with arbitrary attributes, so tests can exercise individual attributes from
// `WebComponentProperty` (room-url, recording-url, participant-name, e2ee-key,
// show-only-recordings, show-recording, leave-redirect-url) without depending
// on the testapp's fixed room/join flow.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attribute map for `<openvidu-meet>`. Keys must be valid `WebComponentProperty`
 * values; values must be serializable as HTML attributes.
 */
export type WebComponentAttributes = Partial<Record<WebComponentProperty, string | boolean | number>>;

const renderAttributes = (attributes: WebComponentAttributes): string =>
	Object.entries(attributes)
		.filter(([, value]) => value !== undefined && value !== null)
		.map(([key, value]) => `${key}="${String(value).replace(/"/g, '&quot;')}"`)
		.join(' ');

/**
 * Renders the `<openvidu-meet>` web component on a blank page hosted on the
 * testapp origin with the given attributes, and waits for the component to be
 * attached.
 *
 * Implementation detail: we first navigate to the testapp URL to establish
 * the correct origin, then replace the document with custom HTML that loads
 * the webcomponent script from {@link MEET_WEBCOMPONENT_SRC}.
 */
export const openWebcomponentWithAttributes = async (
	page: Page,
	attributes: WebComponentAttributes
): Promise<void> => {
	await page.goto(MEET_TESTAPP_URL);

	const html = `<!DOCTYPE html>
<html>
	<head>
		<meta charset="UTF-8" />
		<title>WebComponent Attributes Test</title>
		<script src="${MEET_WEBCOMPONENT_SRC}"></script>
		<style>
			html, body { margin: 0; padding: 0; height: 100%; width: 100%; }
			openvidu-meet { display: block; height: 100vh; width: 100vw; }
		</style>
	</head>
	<body>
		<openvidu-meet ${renderAttributes(attributes)}></openvidu-meet>
	</body>
</html>`;

	await page.setContent(html, { waitUntil: 'load' });
	await expect(page.locator('openvidu-meet')).toBeAttached();
	await expect(iframeLocator(page, 'body')).toBeAttached();
};
