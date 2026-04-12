import { expect, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

async function completeLobbyIfPresent(page: Page): Promise<void> {
	const submit = page.locator('#participant-name-submit');

	if (!(await submit.isVisible())) {
		return;
	}

	const nameInput = page.locator('#participant-name-input');

	if (await nameInput.isVisible()) {
		const value = await nameInput.inputValue();

		if (!value) {
			await nameInput.fill(`pw-${Date.now()}`);
		}
	}

	await submit.click();
}

async function skipPrejoinIfRequested(page: Page): Promise<void> {
	const currentUrl = new URL(page.url());
	const shouldSkipPrejoin = currentUrl.searchParams.get('prejoin') === 'false';

	if (!shouldSkipPrejoin) {
		return;
	}

	const prejoinJoinButton = page.locator('#join-button');

	if (await prejoinJoinButton.isVisible()) {
		await prejoinJoinButton.click();
	}
}

export async function openMeeting(page: Page, accessUrl: string, timeoutMs = 45_000): Promise<void> {
	await page.goto(accessUrl, { waitUntil: 'domcontentloaded' });

	const joinDeadline = Date.now() + timeoutMs;

	while (Date.now() < joinDeadline) {
		if (await page.locator('#layout-container').isVisible()) {
			return;
		}

		await completeLobbyIfPresent(page);
		await skipPrejoinIfRequested(page);
		await page.waitForTimeout(500);
	}

	await expect(page.locator('#layout-container')).toBeVisible({ timeout: timeoutMs });
}

export async function openPrejoin(page: Page, accessUrl: string, timeoutMs = 45_000): Promise<void> {
	await page.goto(accessUrl, { waitUntil: 'domcontentloaded' });

	const prejoinDeadline = Date.now() + timeoutMs;

	while (Date.now() < prejoinDeadline) {
		if (await page.locator('#prejoin-container').isVisible()) {
			return;
		}

		await completeLobbyIfPresent(page);
		await page.waitForTimeout(500);
	}

	await expect(page.locator('#prejoin-container')).toBeVisible({ timeout: timeoutMs });
}

export async function openChatPanel(page: Page): Promise<void> {
	await page.locator('#chat-panel-btn').click();
	await expect(page.locator('.sidenav-menu')).toBeVisible();
	await expect(page.locator('#chat-input')).toBeVisible();
}

export async function sendChatMessage(page: Page, message: string): Promise<void> {
	await page.locator('#chat-input').fill(message);
	await page.locator('#send-btn').click();
}

export async function expectChatMessageCount(page: Page, count: number): Promise<void> {
	await expect(page.locator('.message')).toHaveCount(count);
}

export async function expectFirstMessageSender(page: Page, senderName: string): Promise<void> {
	await expect(page.locator('.participant-name-container > p').first()).toContainText(senderName);
}

export async function expectChatLinkCount(page: Page, count: number): Promise<void> {
	await expect(page.locator('.chat-message a')).toHaveCount(count);
}

export async function expectChatMessageTextAt(page: Page, index: number, text: string): Promise<void> {
	await expect(page.locator('.chat-message').nth(index)).toContainText(text);
}

export async function expectChatLinkHrefContains(page: Page, index: number, expectedHrefPart: string): Promise<void> {
	await expect(page.locator('.chat-message a').nth(index)).toHaveAttribute('href', new RegExp(expectedHrefPart));
}

export async function expectSnackbarNotification(page: Page): Promise<void> {
	await expect(page.locator('.snackbarNotification')).toBeVisible();
}

export async function toggleParticipantsPanel(page: Page): Promise<void> {
	await page.locator('#participants-panel-btn').click();
}

export async function toggleActivitiesPanel(page: Page): Promise<void> {
	await page.locator('#activities-panel-btn').click();
}

export async function openSettingsPanel(page: Page): Promise<void> {
	await page.locator('#more-options-btn').click();
	await expect(page.locator('.mat-mdc-menu-content')).toBeVisible();
	await page.locator('#toolbar-settings-btn').click();
	await expect(page.locator('.sidenav-menu')).toBeVisible();
}

export async function expectVisible(page: Page, selector: string): Promise<void> {
	await expect(page.locator(selector)).toBeVisible();
}

export async function expectHidden(page: Page, selector: string): Promise<void> {
	await expect(page.locator(selector)).toHaveCount(0);
}

export async function openPrejoinBackgroundsPanel(page: Page): Promise<void> {
	await page.locator('#backgrounds-button').click();
	await expect(page.locator('#background-effects-container')).toBeVisible();
}

export async function closePrejoinBackgroundsPanel(page: Page): Promise<void> {
	await page.locator('#backgrounds-button').click();
	await expect(page.locator('#background-effects-container')).toHaveCount(0);
}

export async function togglePrejoinCamera(page: Page): Promise<void> {
	await page.locator('#camera-button').click();
}

export async function openRoomBackgroundsPanel(page: Page): Promise<void> {
	await page.locator('#more-options-btn').click();
	await page.locator('#virtual-bg-btn:visible').click();
	await expect(page.locator('#background-effects-container')).toBeVisible();
}

export async function closeRoomBackgroundsPanel(page: Page): Promise<void> {
	await page.locator('#more-options-btn').click();
	await page.locator('#virtual-bg-btn:visible').click();
	await expect(page.locator('#background-effects-container')).toHaveCount(0);
}

export async function applyBackgroundEffect(page: Page, effectId: string): Promise<void> {
	await page.locator(`#effect-${effectId}`).click();
	await page.waitForTimeout(1000);
}

export async function captureVideoElementScreenshot(page: Page): Promise<Buffer> {
	return await page.locator('.OV_video-element').first().screenshot();
}

export function expectSignificantImageDifference(
	beforePngBuffer: Buffer,
	afterPngBuffer: Buffer,
	options?: { threshold?: number; minDiffPixels?: number }
): void {
	const beforeImg = PNG.sync.read(beforePngBuffer);
	const afterImg = PNG.sync.read(afterPngBuffer);
	const width = Math.min(beforeImg.width, afterImg.width);
	const height = Math.min(beforeImg.height, afterImg.height);
	const normalizedBefore = new PNG({ width, height });
	const normalizedAfter = new PNG({ width, height });
	PNG.bitblt(beforeImg, normalizedBefore, 0, 0, width, height, 0, 0);
	PNG.bitblt(afterImg, normalizedAfter, 0, 0, width, height, 0, 0);
	const diff = new PNG({ width, height });

	const numDiffPixels = pixelmatch(normalizedBefore.data, normalizedAfter.data, diff.data, width, height, {
		threshold: options?.threshold ?? 0.4
	});

	expect(numDiffPixels).toBeGreaterThan(options?.minDiffPixels ?? 500);
}

export async function startScreensharing(page: Page): Promise<void> {
	await page.locator('#screenshare-btn').click();
}

export async function stopScreensharing(page: Page): Promise<void> {
	await page.locator('#screenshare-btn').click();
	const disableButton = page.locator('#disable-screen-button');

	if (await disableButton.isVisible()) {
		await disableButton.click();
	}

	await page.waitForTimeout(500);
}

export async function toggleCamera(page: Page): Promise<void> {
	await page.locator('#camera-btn').click();
}

export async function toggleMicrophone(page: Page): Promise<void> {
	await page.locator('#mic-btn').click();
}

export async function expectVideoCount(page: Page, count: number): Promise<void> {
	await expect(page.locator('video')).toHaveCount(count);
}

export async function expectPinnedStreamCount(page: Page, count: number): Promise<void> {
	await expect(page.locator('.OV_big')).toHaveCount(count);
}

export async function expectScreenTypeCount(page: Page, count: number): Promise<void> {
	await expect(page.locator('.screen-type')).toHaveCount(count);
}

export async function getPinnedStreamCount(page: Page): Promise<number> {
	return await page.locator('.OV_big').count();
}

export async function toggleStreamPin(page: Page, selector: string): Promise<void> {
	const target = page.locator(selector).first();
	await target.click({ force: true });

	const stream = target.locator('xpath=ancestor::*[contains(@class,"OV_stream")]').first();
	const streamPinButton = stream.locator('#pin-btn').first();

	if (await streamPinButton.isVisible()) {
		await streamPinButton.click();
	} else {
		await page.locator('#pin-btn').first().click();
	}

	await page.waitForTimeout(300);
}

export async function unpinCurrentPinnedStream(page: Page): Promise<void> {
	const pinnedStream = page.locator('.OV_big').first();
	await pinnedStream.click({ force: true });

	const pinnedButton = pinnedStream.locator('#pin-btn').first();

	if (await pinnedButton.isVisible()) {
		await pinnedButton.click();
	} else {
		await page.locator('#pin-btn').first().click();
	}

	await page.waitForTimeout(300);
}

export async function getScreenTypeTracks(page: Page): Promise<Array<{ kind: string; enabled: boolean; id: string; label: string }>> {
	return await page.evaluate(() => {
		const video = document.querySelector('.screen-type') as HTMLVideoElement | null;

		if (!video || !video.srcObject) {
			return [];
		}

		const stream = video.srcObject as MediaStream;

		return stream.getTracks().map((track: MediaStreamTrack) => ({
			kind: track.kind,
			enabled: track.enabled,
			id: track.id,
			label: track.label
		}));
	});
}
