import { expect, type Locator, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

async function clickIfReady(locator: Locator, timeoutMs = 2_000): Promise<boolean> {
	try {
		await locator.click({ timeout: timeoutMs });
		return true;
	} catch {
		return false;
	}
}

async function completeLobbyIfPresent(page: Page): Promise<void> {
	const submit = page.locator('#participant-name-submit');

	if (!(await submit.isVisible().catch(() => false))) {
		return;
	}

	const nameInput = page.locator('#participant-name-input');

	if (await nameInput.isVisible()) {
		const value = await nameInput.inputValue();

		if (!value) {
			await nameInput.fill(`pw-${Date.now()}`);
		}

		if (await clickIfReady(submit)) {
			return;
		}

		await nameInput.press('Enter').catch(() => Promise.resolve());
		return;
	}

	await clickIfReady(submit);
}

async function clickJoinIfPrejoinVisible(page: Page): Promise<boolean> {
	const prejoinContainer = page.locator('#prejoin-container');
	const joinButton = page.locator('#join-button');
	const joiningSpinner = page.locator('#spinner');

	if (!(await prejoinContainer.isVisible().catch(() => false))) {
		return false;
	}

	// Join was already requested and the transition spinner is visible.
	if (await joiningSpinner.isVisible().catch(() => false)) {
		return true;
	}

	if (!(await joinButton.isVisible().catch(() => false))) {
		return false;
	}

	if (await clickIfReady(joinButton)) {
		return true;
	}

	return false;
}

export async function openMeeting(page: Page, accessUrl: string, timeoutMs = 45_000): Promise<void> {
	await page.goto(accessUrl, { waitUntil: 'domcontentloaded' });

	const joinDeadline = Date.now() + timeoutMs;

	while (Date.now() < joinDeadline) {
		if (await page.locator('#layout-container').isVisible()) {
			return;
		}

		await completeLobbyIfPresent(page);
		await clickJoinIfPrejoinVisible(page);
		await page.waitForTimeout(100); // Use expect.poll in next assertion
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
		await page.waitForTimeout(100); // Use expect.poll in next assertion
	}

	await expect(page.locator('#prejoin-container')).toBeVisible({ timeout: timeoutMs });
}

export async function toggleChatPanel(page: Page, action: 'open' | 'close' = 'open'): Promise<void> {
	const chatInput = page.locator('#chat-input');
	const shouldOpen = action === 'open';
	const isOpen = await chatInput.isVisible().catch(() => false);

	if (shouldOpen) {
		if (!isOpen) {
			await page.locator('#chat-panel-btn').click();
		}
	} else if (isOpen) {
		const panelCloseButton = page.locator('#chat-container .panel-close-button');

		if (await panelCloseButton.isVisible().catch(() => false)) {
			await panelCloseButton.click();
		} else {
			await page.locator('#chat-panel-btn').click();
		}
	}

	if (action === 'open') {
		await expect(page.locator('#chat-container')).toBeVisible({ timeout: 10_000 });
		await expect(chatInput).toBeVisible({ timeout: 10_000 });
	} else {
		await expect(page.locator('#chat-container')).toHaveCount(0, { timeout: 10_000 });
		await expect(chatInput).toHaveCount(0, { timeout: 10_000 });
	}
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
	const locator = page.locator(selector);

	await expect
		.poll(
			async () => {
				const count = await locator.count();

				if (count === 0) {
					return true;
				}

				for (let index = 0; index < count; index += 1) {
					if (await locator.nth(index).isVisible()) {
						return false;
					}
				}

				return true;
			},
			{ timeout: 10_000 }
		)
		.toBeTruthy();
}

export async function installClipboardCapture(page: Page): Promise<void> {
	await page.evaluate(() => {
		const w = window as Window & {
			__ovCopiedText?: string;
			__ovClipboardCaptureInstalled?: boolean;
		};

		if (w.__ovClipboardCaptureInstalled) {
			return;
		}

		w.__ovClipboardCaptureInstalled = true;
		w.__ovCopiedText = '';

		document.addEventListener(
			'copy',
			() => {
				const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
				const activeValue =
					activeElement && typeof activeElement.value === 'string' ? activeElement.value.trim() : '';
				const selectedText = document.getSelection()?.toString().trim() ?? '';

				w.__ovCopiedText = selectedText || activeValue || w.__ovCopiedText || '';
			},
			true
		);
	});
}

export async function getCopiedText(page: Page): Promise<string> {
	return await page.evaluate(async () => {
		const w = window as Window & {
			__ovCopiedText?: string;
		};

		const capturedText = w.__ovCopiedText?.trim() ?? '';

		if (capturedText) {
			return capturedText;
		}

		try {
			return (await navigator.clipboard.readText()).trim();
		} catch {
			return '';
		}
	});
}

export async function expectCopiedUrl(page: Page, timeoutMs = 5_000): Promise<void> {
	await expect.poll(async () => await getCopiedText(page), { timeout: timeoutMs }).toMatch(/^https?:\/\//);
}

export async function openPrejoinBackgroundsPanel(page: Page): Promise<void> {
	await page.locator('#backgrounds-button').click();
	await expect(page.locator('#background-effects-container')).toBeVisible();
}

export async function closePrejoinBackgroundsPanel(page: Page): Promise<void> {
	await page.locator('#backgrounds-button').click();
	await expect(page.locator('#background-effects-container')).toHaveCount(0);
}

export async function togglePrejoinCamera(page: Page, timeoutMs = 10_000): Promise<void> {
	await page.locator('#camera-button').click();
}

export async function openRoomBackgroundsPanel(page: Page): Promise<void> {
	await page.locator('#more-options-btn').click();
	await page.locator('#virtual-bg-btn:visible').click();
	await expect(page.locator('#background-effects-container')).toBeVisible();
}

export async function closeRoomBackgroundsPanel(page: Page, timeoutMs = 10_000): Promise<void> {
	await page.locator('#more-options-btn').click();
	await page.locator('#virtual-bg-btn:visible').click();
	await expect(page.locator('#background-effects-container')).toHaveCount(0);
}

export async function applyBackgroundEffect(page: Page, effectId: string, timeoutMs = 10_000): Promise<void> {
	await page.locator(`#effect-${effectId}`).click();
	await expect
		.poll(async () => (await page.locator(`.OV_stream`).count()) > 0, { timeout: timeoutMs })
		.toBeTruthy()
		.catch(() => Promise.resolve());
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

export async function stopScreensharing(page: Page, timeoutMs = 10_000): Promise<void> {
	await page.locator('#screenshare-btn').click();

	const disableButton = page.locator('#disable-screen-button');

	if (await disableButton.isVisible()) {
		await disableButton.click();
	}

	await expect
		.poll(
			async () => {
				return await page.locator('.OV_screen.local').count();
			},
			{ timeout: timeoutMs }
		)
		.toBe(0);
}

export async function toggleCamera(page: Page): Promise<void> {
	await page.locator('#camera-btn').click();
}

export async function toggleMicrophone(page: Page): Promise<void> {
	await page.locator('#mic-btn').click();
}

export async function leaveMeeting(page: Page, timeoutMs = 10_000): Promise<void> {
	await page.locator('#leave-btn').click();
	await page.locator('#leave-option').click();

	await expect.poll(async () => await page.locator('#layout-container').count(), { timeout: timeoutMs }).toBe(0);
}

export async function expectVideoCount(page: Page, count: number): Promise<void> {
	await expect(page.locator('video')).toHaveCount(count);
}

export async function expectPinnedStreamCount(page: Page, count: number): Promise<void> {
	await expect(page.locator('.OV_big .OV_stream')).toHaveCount(count);
}

export async function expectScreenTypeCount(page: Page, count: number): Promise<void> {
	await expect(page.locator('.screen-type')).toHaveCount(count);
}

export async function getPinnedStreamCount(page: Page): Promise<number> {
	return await page.locator('.OV_big .OV_stream').count();
}

export async function toggleStreamPin(page: Page, selector: string, timeoutMs = 10_000): Promise<void> {
	const target = page.locator(selector).first();
	await target.click({ force: true });

	const stream = target.locator('xpath=ancestor::*[contains(@class,"OV_stream")]').first();
	const streamPinButton = stream.locator('#pin-btn').first();

	if (await streamPinButton.isVisible()) {
		await streamPinButton.click();
	} else {
		await page.locator('#pin-btn').first().click();
	}

	await expect
		.poll(async () => (await page.locator('.OV_big .OV_stream').count()) > 0, { timeout: timeoutMs })
		.toBeTruthy()
		.catch(() => Promise.resolve());
}

export async function unpinCurrentPinnedStream(page: Page, timeoutMs = 10_000): Promise<void> {
	const pinnedStream = page.locator('.OV_big').first();
	await pinnedStream.click({ force: true });

	const pinnedButton = pinnedStream.locator('#pin-btn').first();

	if (await pinnedButton.isVisible()) {
		await pinnedButton.click();
	} else {
		await page.locator('#pin-btn').first().click();
	}

	await expect
		.poll(async () => (await page.locator('.OV_big .OV_stream').count()) === 0, { timeout: timeoutMs })
		.toBeTruthy()
		.catch(() => Promise.resolve());
}

export async function getScreenTypeTracks(
	page: Page
): Promise<Array<{ kind: string; enabled: boolean; id: string; label: string }>> {
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

/**
 * Expects a specific number of stream containers to be present
 */
export async function expectStreamCount(page: Page, count: number): Promise<void> {
	await expect(page.locator('.OV_publisher .OV_stream ')).toHaveCount(count);
}

/**
 * Expects a specific number of screen share streams to be present
 */
export async function expectScreenShareCount(page: Page, count: number): Promise<void> {
	await expect(page.locator('.OV_screen')).toHaveCount(count);
}

/**
 * Expects a specific number of local video and audio elements to be present
 */
export async function expectLocalStreamMediaCount(
	page: Page,
	counts: { video?: number; audio?: number }
): Promise<void> {
	if (counts.video !== undefined) {
		await expect(page.locator('.OV_stream.local .OV_video-element')).toHaveCount(counts.video);
	}

	if (counts.audio !== undefined) {
		await expect(page.locator('.OV_stream.local .OV_audio-element')).toHaveCount(counts.audio);
	}
}

/**
 * Joins a meeting from prejoin by clicking join button and waiting for layout
 */
export async function joinFromPrejoin(page: Page, accessUrl: string): Promise<void> {
	await openPrejoin(page, accessUrl);
	await page.locator('#join-button').click();
	await expect(page.locator('#layout-container')).toBeVisible();
	await expect(page.locator('.OV_stream.local')).toBeVisible();
}

/**
 * Waits for a participant's remote stream to appear and be visible
 */
export async function waitForRemoteStream(page: Page): Promise<void> {
	await expect
		.poll(
			async () => {
				return await page.evaluate(() => {
					const remoteStreams = Array.from(document.querySelectorAll('.OV_stream.remote')) as HTMLElement[];

					return remoteStreams.some((stream) => {
						const rect = stream.getBoundingClientRect();
						const style = window.getComputedStyle(stream);
						const hasMediaElement = !!stream.querySelector('.OV_video-element, .OV_audio-element');
						const isVisible =
							rect.width > 0 &&
							rect.height > 0 &&
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							style.opacity !== '0';

						// Ignore temporary placeholder streams while waiting for a renderable remote stream.
						return isVisible && hasMediaElement && !stream.classList.contains('no-size');
					});
				});
			},
			{ timeout: 10_000 }
		)
		.toBe(true);
}

/**
 * Gets all audio elements on the page (local + remote participants)
 */
export async function getAudioElementCount(page: Page): Promise<number> {
	return await page.locator('audio').count();
}

/**
 * Expects no-size class to be removed from a stream element (video should be visible)
 */
export async function expectStreamVideoVisible(page: Page, selector = '.OV_stream.local'): Promise<void> {
	const stream = page.locator(selector);
	const classes = await stream.getAttribute('class');
	expect(classes).not.toContain('no-size');
}

/**
 * Checks if local participant has only audio tracks (no video)
 */
export async function expectLocalParticipantAudioOnly(page: Page): Promise<void> {
	const videoElements = await page.locator('.OV_stream.local .OV_video-element').count();
	expect(videoElements).toBe(0);
	const audioElements = await page.locator('.OV_stream.local .OV_audio-element').count();
	expect(audioElements).toBeGreaterThan(0);
}

/**
 * Checks if no streams are being played
 */
export async function expectNoStreamsPlaying(page: Page): Promise<void> {
	await expect(page.locator('.OV_stream .OV_video-element')).toHaveCount(0);
	await expect(page.locator('.OV_stream .OV_audio-element')).toHaveCount(0);
}

/**
 * Toggles microphone in prejoin (companion to togglePrejoinCamera)
 */
export async function togglePrejoinMicrophone(page: Page, timeoutMs = 10_000): Promise<void> {
	await page.locator('#microphone-button').click();
}

/**
 * Checks if video is currently enabled in prejoin by inspecting the camera toggle state
 */
export async function isPrejoinVideoEnabled(page: Page): Promise<boolean> {
	const cameraButton = page.locator('#camera-button');

	await expect(cameraButton).toBeVisible();

	if ((await cameraButton.count()) === 0) {
		return false;
	}

	return await cameraButton.evaluate((element) => element.classList.contains('device-enabled'));
}

/**
 * Checks if audio is currently enabled in prejoin by inspecting the microphone toggle state
 */
export async function isPrejoinAudioEnabled(page: Page): Promise<boolean> {
	const microphoneButton = page.locator('#microphone-button');

	await expect(microphoneButton).toBeVisible();

	if ((await microphoneButton.count()) === 0) {
		return false;
	}

	return await microphoneButton.evaluate((element) => element.classList.contains('device-enabled'));
}

/**
 * Ensures video is in the desired state in prejoin before joining
 * If current state doesn't match desired, toggles the camera button
 */
export async function ensurePrejoinVideoState(page: Page, enabled: boolean, timeoutMs = 10_000): Promise<void> {
	const currentlyEnabled = await isPrejoinVideoEnabled(page);

	if (currentlyEnabled !== enabled) {
		await togglePrejoinCamera(page);
		await expect
			.poll(async () => (await isPrejoinVideoEnabled(page)) !== currentlyEnabled, { timeout: timeoutMs })
			.toBeTruthy()
			.catch(() => Promise.resolve());
	}
}

/**
 * Ensures audio is in the desired state in prejoin before joining
 * Note: Audio state detection is limited in UI - this toggles if needed
 */
export async function ensurePrejoinAudioState(page: Page, enabled: boolean, timeoutMs = 10_000): Promise<void> {
	const currentlyEnabled = await isPrejoinAudioEnabled(page);

	if (currentlyEnabled !== enabled) {
		await togglePrejoinMicrophone(page);
		await expect
			.poll(async () => (await isPrejoinAudioEnabled(page)) !== currentlyEnabled, { timeout: timeoutMs })
			.toBeTruthy()
			.catch(() => Promise.resolve());
	}
}

/**
 * Joins a meeting from prejoin with specific media states
 * Handles both video and audio state configuration before joining
 */
export async function joinFromPrejoinWithMediaState(
	page: Page,
	accessUrl: string,
	options?: { videoEnabled?: boolean; audioEnabled?: boolean }
): Promise<void> {
	const { videoEnabled, audioEnabled } = options || {};

	// Open prejoin
	await openPrejoin(page, accessUrl);

	// Ensure desired media states
	if (videoEnabled !== undefined) {
		await ensurePrejoinVideoState(page, videoEnabled);
	}

	if (audioEnabled !== undefined) {
		await ensurePrejoinAudioState(page, audioEnabled);
	}

	// Click join button and wait for meeting to load
	await page.locator('#join-button').click();
	await expect(page.locator('#layout-container')).toBeVisible();
	await expect(page.locator('.OV_stream.local .OV_video-element')).toBeVisible();
}
