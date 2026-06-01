import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The connection-quality levels exposed by LiveKit's `ConnectionQuality` enum.
 * Values are the raw enum strings the component compares against
 * (`connectionQuality() === 'poor'`, …).
 */
export type ConnectionQualityLevel = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

/** Maps each level to the Material icon the indicator renders for it. */
export const QUALITY_ICON: Record<ConnectionQualityLevel, string> = {
	excellent: 'signal_wifi_4_bar',
	good: 'network_wifi_3_bar',
	poor: 'network_wifi_2_bar',
	lost: 'signal_wifi_off',
	unknown: 'signal_wifi_off'
};

/**
 * Forces the LOCAL participant's connection quality to a fixed value.
 *
 * Connection quality normally only arrives from LiveKit's
 * `RoomEvent.ConnectionQualityChanged`, which is non-deterministic under e2e
 * (real WebRTC over fake media basically always reports "excellent") — so it
 * can't be driven to "poor"/"lost"/"unknown" from the outside. Instead we reach
 * into the Angular component tree through the dev-build debug API (`window.ng`,
 * available because e2e runs the `development` build) and call the public
 * `setConnectionQuality` on the local `ParticipantModel`.
 *
 * After setting the value we replace the model's `setConnectionQuality` with a
 * no-op so any later real `ConnectionQualityChanged` event can't overwrite it,
 * keeping the badge state stable for the rest of the test. The local model is
 * shared by every indicator bound to it, so this drives both the video-tile
 * badge and the participants-panel badge at once.
 */
export const mockLocalConnectionQuality = async (page: Page, quality: ConnectionQualityLevel): Promise<void> => {
	// Wait until the debug API and at least one local indicator are present.
	await page.waitForFunction(
		() => {
			const ng = (window as unknown as { ng?: { getComponent?: (el: Element) => unknown } }).ng;
			if (!ng?.getComponent) {
				return false;
			}
			return Array.from(document.querySelectorAll('ov-connection-quality-indicator')).some((host) => {
				const comp = ng.getComponent!(host) as { participant?: () => { isLocal?: boolean } } | null;
				return comp?.participant?.()?.isLocal === true;
			});
		},
		{ timeout: 10_000 }
	);

	await page.evaluate((q) => {
		const ng = (window as unknown as {
			ng?: { getComponent: (el: Element) => unknown; applyChanges: (cmp: unknown) => void };
		}).ng;
		if (!ng?.getComponent) {
			throw new Error('window.ng debug API is unavailable — e2e must run against the development build.');
		}

		const localHosts = Array.from(document.querySelectorAll('ov-connection-quality-indicator')).filter((host) => {
			const comp = ng.getComponent(host) as { participant?: () => { isLocal?: boolean } } | null;
			return comp?.participant?.()?.isLocal === true;
		});

		const model = (ng.getComponent(localHosts[0]) as { participant: () => {
			setConnectionQuality: (q: string) => void;
		} }).participant();

		model.setConnectionQuality(q);
		// Lock the value so real LiveKit ConnectionQualityChanged events are ignored.
		model.setConnectionQuality = () => {};

		// Flush OnPush change detection on every indicator bound to this model.
		localHosts.forEach((host) => ng.applyChanges(ng.getComponent(host)));
	}, quality);
};

/** Badge locator for the LOCAL participant's video tile. */
export const videoTileQualityBadge = (page: Page): Locator =>
	page.locator('.OV_stream.local #connection-quality-badge');

/** Badge locator for the LOCAL participant's row in the participants panel. */
export const panelQualityBadge = (page: Page): Locator =>
	page.locator('.local-participant-container #connection-quality-badge');

/**
 * Asserts the given badge is visible and carries the CSS class for `quality`
 * (e.g. `quality-poor`). The class is bound directly from the quality value, so
 * it uniquely identifies the rendered level.
 */
export const expectBadgeQuality = async (badge: Locator, quality: ConnectionQualityLevel): Promise<void> => {
	await expect(badge).toBeVisible();
	await expect(badge).toHaveClass(new RegExp(`\\bquality-${quality}\\b`));
};
