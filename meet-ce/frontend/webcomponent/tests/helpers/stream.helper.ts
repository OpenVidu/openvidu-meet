import { expect, Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { iframeLocator } from './iframe.helper';

// ─── Screenshot capture & pixel-diff helpers ────────────────────────────────
//
// These helpers are webcomponent-specific: Chrome's synthetic fake-device
// video produces a bright-green background that VB tests detect via pixel
// analysis.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Captures a screenshot of an element inside the iframe and returns the PNG
 * buffer. Auto-waits for visibility before capture.
 */
export const screenshotIframeElement = async (
	page: Page,
	selector: string,
	options: { timeout?: number } = {}
): Promise<Buffer> => {
	const locator = iframeLocator(page, selector);
	await expect(locator).toBeVisible({ timeout: options.timeout });
	return await locator.screenshot();
};

/**
 * Asserts that two PNG buffers differ by at least `minDiffPixels` pixels using
 * pixelmatch with the given `threshold`.
 */
export const expectSignificantImageDifference = (
	before: Buffer,
	after: Buffer,
	options: { threshold?: number; minDiffPixels?: number } = {}
): void => {
	const { threshold = 0.4, minDiffPixels = 500 } = options;
	const img1 = PNG.sync.read(before);
	const img2 = PNG.sync.read(after);
	const { width, height } = img1;

	if (img2.width !== width || img2.height !== height) {
		throw new Error(`Image dimensions differ: ${width}x${height} vs ${img2.width}x${img2.height}`);
	}

	const diff = new PNG({ width, height });
	const numDiffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold });
	expect(numDiffPixels).toBeGreaterThan(minDiffPixels);
};
