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
 * Counts the pixels that differ between two PNG buffers using pixelmatch.
 * Throws if the two images have different dimensions.
 */
const imageDiffPixels = (before: Buffer, after: Buffer, threshold: number): number => {
	const img1 = PNG.sync.read(before);
	const img2 = PNG.sync.read(after);
	const { width, height } = img1;

	if (img2.width !== width || img2.height !== height) {
		throw new Error(`Image dimensions differ: ${width}x${height} vs ${img2.width}x${img2.height}`);
	}

	const diff = new PNG({ width, height });
	return pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold });
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
	expect(imageDiffPixels(before, after, threshold)).toBeGreaterThan(minDiffPixels);
};

/**
 * Re-screenshots `selector` inside the web component until it differs from the
 * `before` baseline by more than `minDiffPixels` (or until `timeout` elapses).
 *
 * Use for GPU/canvas effects like virtual backgrounds that have no DOM "applied"
 * signal and render after a variable number of frames: a single snapshot taken
 * at a fixed delay races the renderer and yields false negatives under load.
 * Polling lets the assertion pass as soon as the effect actually paints, while
 * still failing (after the timeout) if the effect never produces a change.
 */
export const expectSignificantImageDifferenceEventually = async (
	page: Page,
	selector: string,
	before: Buffer,
	options: { threshold?: number; minDiffPixels?: number; timeout?: number } = {}
): Promise<void> => {
	const { threshold = 0.4, minDiffPixels = 500, timeout = 15_000 } = options;

	await expect(async () => {
		const after = await iframeLocator(page, selector).screenshot();
		expect(imageDiffPixels(before, after, threshold)).toBeGreaterThan(minDiffPixels);
	}).toPass({ timeout });
};
