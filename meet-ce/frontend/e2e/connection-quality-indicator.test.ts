import { expect, test } from '@playwright/test';
import {
	expectBadgeQuality,
	mockLocalConnectionQuality,
	panelQualityBadge,
	videoTileQualityBadge
} from './helpers/connection-quality.helper';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';
import { toggleParticipantsPanel } from './helpers/panels.helper';
import { expectVisible } from './helpers/ui-utils.helper';

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

	test('should show a PINNED poor-quality badge on the video tile AND in the participants panel', async ({
		page
	}) => {
		await openMeeting(page, accessUrl, { videoEnabled: true, audioEnabled: true });

		await mockLocalConnectionQuality(page, 'poor');

		// Video tile badge.
		await expectBadgeQuality(videoTileQualityBadge(page), 'poor');

		// Same model drives the participants-panel badge (rendered with `transparent`).
		await toggleParticipantsPanel(page);
		await expectVisible(page, '.local-participant-container');
		const panelBadge = panelQualityBadge(page);
		await expectBadgeQuality(panelBadge, 'poor');
		await expect(panelBadge).toHaveClass(/\btransparent\b/);
	});

	test('should render the offline icon for LOST connection quality', async ({ page }) => {
		await openMeeting(page, accessUrl, { videoEnabled: true, audioEnabled: true });

		await mockLocalConnectionQuality(page, 'lost');

		const badge = videoTileQualityBadge(page);
		await expectBadgeQuality(badge, 'lost');
		await expect(badge.locator('mat-icon')).toHaveAttribute('data-mat-icon-name', 'signal_wifi_off');
	});

	test('should NOT show the badge while connection quality is UNKNOWN', async ({ page }) => {
		await openMeeting(page, accessUrl, { videoEnabled: true, audioEnabled: true });

		await mockLocalConnectionQuality(page, 'unknown');

		await expect(videoTileQualityBadge(page)).toHaveCount(0);
	});

	test('should show the EXCELLENT badge briefly, then auto-hide it after 3s', async ({ page }) => {
		await openMeeting(page, accessUrl, { videoEnabled: true, audioEnabled: true });

		await mockLocalConnectionQuality(page, 'excellent');

		// Good/excellent quality is only surfaced transiently.
		const badge = videoTileQualityBadge(page);
		await expectBadgeQuality(badge, 'excellent');

		// The component hides good/excellent badges after BADGE_TIMEOUT (3000ms).
		await expect(badge).toBeHidden({ timeout: 6_000 });
	});
});
