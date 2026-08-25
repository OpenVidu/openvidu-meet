import { expect, test } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';
import { toggleParticipantsPanel } from './helpers/panels.helper';

/**
 * The indicator reads differently in the two places it is rendered. On the local video tile it
 * surfaces any quality LiveKit reports, transiently: the badge appears and auto-hides after a short
 * delay (the component's BADGE_TIMEOUT, 3s). On a participants-panel row it is pinned to the corner
 * of the avatar and only speaks up when the connection is actually in trouble, because a healthy
 * connection marked on every row is noise.
 *
 * Under e2e's fake media the quality is consistently "excellent", so that is exactly what these
 * tests can pin down: the tile cycles, and the row stays silent. Neither forces a quality value, so
 * they need no dev-only debug API and no app-side test hooks — they run against the production
 * build CI serves. Trouble itself is not reachable from here; the rule that selects it is covered
 * in the component's spec.
 */
test.describe('Connection Quality Indicator E2E Tests', () => {
	const createdRoomIds: string[] = [];

	let accessUrl: string;

	test.beforeEach(async () => {
		const { room, accessUrl: url } = await createRoomAndGetAnonymousAccessUrl();
		accessUrl = url;
		createdRoomIds.push(room.roomId);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('shows the badge on the local video tile, then auto-hides it', async ({ page }) => {
		await openMeeting(page, accessUrl, { videoEnabled: true, audioEnabled: true });

		const badge = page.locator('.OV_stream.local #connection-quality-badge');
		await expect(badge).toBeVisible({ timeout: 15_000 });
		await expect(badge).toBeHidden({ timeout: 10_000 });
	});

	test('keeps the badge off a participants panel row while the connection is healthy', async ({ page }) => {
		await openMeeting(page, accessUrl, { videoEnabled: true, audioEnabled: true });

		// The tile badge appearing is what makes the row's silence meaningful: it proves LiveKit
		// reported a quality at all, so the row is applying the rule rather than waiting for news.
		await expect(page.locator('.OV_stream.local #connection-quality-badge')).toBeVisible({ timeout: 15_000 });

		await toggleParticipantsPanel(page);

		await expect(page.locator('.local-participant-container #connection-quality-badge')).toHaveCount(0);
	});
});
