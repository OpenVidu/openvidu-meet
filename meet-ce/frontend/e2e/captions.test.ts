import { expect, test, type Page } from '@playwright/test';
import {
	enableCaptions,
	getCaptionsButton,
	getCaptionsButtonIcon,
	joinSpeechAgent,
	mockCaptionsBackend,
	type SpeechAgent
} from './helpers/captions.helper';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';
import { getElementBoundingBox } from './helpers/ui-utils.helper';

const ASSISTANTS_ROUTE = '**/internal-api/*/ai/assistants';
const CAPTION = '.captions-container .caption-item';

test.describe('Captions E2E Tests', () => {
	const createdRoomIds: string[] = [];
	const agents: SpeechAgent[] = [];

	const createCaptionsRoom = async (enabled = true) => {
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl(
			{ config: { captions: { enabled } } },
			'speaker'
		);
		createdRoomIds.push(room.roomId);
		return { roomId: room.roomId, accessUrl };
	};

	const gridBottomGap = async (page: Page): Promise<number> => {
		const layout = (await getElementBoundingBox(page, '#layout-container'))!;
		const grid = (await getElementBoundingBox(page, '#layout'))!;
		return layout.y + layout.height - (grid.y + grid.height);
	};

	test.afterEach(async () => {
		await Promise.all(agents.splice(0).map((agent) => agent.leave()));
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should hide captions button when captions are disabled in room config', async ({ page }) => {
		const { accessUrl } = await createCaptionsRoom(false);

		await openMeeting(page, accessUrl);
		await expect(page.locator('#captions-button')).toHaveCount(0);
	});

	test('should show the captions button disabled, with a note, when the deployment has captions off', async ({
		page
	}) => {
		await mockCaptionsBackend(page, { deploymentEnabled: false });
		const { accessUrl } = await createCaptionsRoom();

		await openMeeting(page, accessUrl);
		await expect(getCaptionsButton(page)).toBeDisabled();
		await expect(getCaptionsButtonIcon(page)).toHaveText('subtitles_off');

		await getCaptionsButton(page).hover();
		await expect(page.locator('.mat-mdc-tooltip')).toHaveText('Live captions are disabled by admin');
	});

	test('should let a participant without moderation permissions turn captions on and off', async ({ page }) => {
		await mockCaptionsBackend(page);
		const { accessUrl } = await createCaptionsRoom();
		await openMeeting(page, accessUrl);
		const fullHeightGap = await gridBottomGap(page);

		await enableCaptions(page);
		await expect(getCaptionsButton(page)).toHaveClass(/active/);
		await expect.poll(() => gridBottomGap(page)).toBeGreaterThan(fullHeightGap + 50);

		let answerStop!: () => void;
		const stopAnswered = new Promise<void>((resolve) => (answerStop = resolve));
		await page.route(`${ASSISTANTS_ROUTE}/*`, async (route) => {
			await stopAnswered;
			await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
		});

		// The button ignores clicks for half a second after each toggle.
		await expect(async () => {
			await getCaptionsButton(page).click();
			await expect(page.locator('.captions-container')).toHaveCount(0, { timeout: 100 });
		}).toPass();
		await expect(getCaptionsButton(page)).not.toHaveClass(/active/);
		await expect.poll(() => gridBottomGap(page)).toBeLessThan(fullHeightGap + 2);
		answerStop();
	});

	test('should leave captions off when the server refuses to start them', async ({ page }) => {
		await mockCaptionsBackend(page);
		await page.route(ASSISTANTS_ROUTE, (route) =>
			route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"refused"}' })
		);
		const { accessUrl } = await createCaptionsRoom();
		await openMeeting(page, accessUrl);

		const refused = page.waitForResponse((response) => response.url().endsWith('/ai/assistants'));
		await getCaptionsButton(page).click();
		await refused;

		await expect(page.locator('.captions-container')).toHaveCount(0);
		await expect(getCaptionsButton(page)).not.toHaveClass(/active/);
	});

	test('should ignore a second click while captions are still turning on', async ({ page }) => {
		await mockCaptionsBackend(page);
		let starts = 0;
		await page.route(ASSISTANTS_ROUTE, async (route) => {
			starts++;
			await new Promise((resolve) => setTimeout(resolve, 1000));
			await route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ id: 'e2e-fake-captions-assistant', status: 'active' })
			});
		});
		const { accessUrl } = await createCaptionsRoom();
		await openMeeting(page, accessUrl);

		await getCaptionsButton(page).click();
		await getCaptionsButton(page).click();

		await expect(page.locator('.captions-container')).toBeVisible();
		await expect(getCaptionsButton(page)).toHaveClass(/active/);
		expect(starts).toBe(1);
	});

	test('should show what is said only to the participants who turned captions on', async ({ page, browser }) => {
		const { roomId, accessUrl } = await createCaptionsRoom();
		const other = await browser.newPage();

		try {
			await mockCaptionsBackend(page);
			await mockCaptionsBackend(other);
			await openMeeting(page, accessUrl, { name: 'Alice' });
			await openMeeting(other, accessUrl, { name: 'Bob' });
			const agent = await joinSpeechAgent(browser, roomId, 'Speaker', [page, other]);
			agents.push(agent);

			await enableCaptions(page);
			await agent.transcribe('hello from the meeting');

			await expect(page.locator(CAPTION)).toHaveCount(1);
			await expect(page.locator(`${CAPTION} .caption-speaker`)).toHaveText('Speaker:');
			await expect(page.locator(CAPTION)).toContainText('hello from the meeting');
			await expect(other.locator('.captions-container')).toHaveCount(0);

			await enableCaptions(other);
			await agent.transcribe('now for both');

			await expect(other.locator(CAPTION)).toHaveCount(1);
			await expect(other.locator(CAPTION)).toContainText('now for both');
			await expect(page.locator(CAPTION).last()).toContainText('now for both');
		} finally {
			await other.close();
		}
	});

	test('should update a caption in place while it is transcribed', async ({ page, browser }) => {
		const { roomId, accessUrl } = await createCaptionsRoom();
		await mockCaptionsBackend(page);
		await openMeeting(page, accessUrl);
		const agent = await joinSpeechAgent(browser, roomId, 'Speaker', [page]);
		agents.push(agent);
		await enableCaptions(page);

		await agent.transcribe('the quick', { final: false });
		await expect(page.locator(`${CAPTION}.caption-interim`)).toContainText('the quick');

		await agent.transcribe('the quick brown', { final: false });
		await agent.transcribe('the quick brown fox');

		await expect(page.locator(`${CAPTION}.caption-final`)).toContainText('the quick brown fox');
		await expect(page.locator(CAPTION)).toHaveCount(1);
	});
});
