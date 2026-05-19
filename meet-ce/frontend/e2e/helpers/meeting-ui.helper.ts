import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { Browser, chromium, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { createRoomMember } from './meet-api.helper';

export type MeetingParticipantJoinConfig = {
	name: string;
	audioEnabled?: boolean;
	videoEnabled?: boolean;
	baseRole?: MeetRoomMemberRole;
	headless?: boolean;
	audioFile?: string;
	screenShare?: boolean;
};

export type BrowserFakeParticipantOptions = {
	audioFile?: string;
	enableAudio?: boolean;
	enableVideo?: boolean;
	screenShare?: boolean;
	baseRole?: MeetRoomMemberRole;
};

export type JoinedNamedParticipants = {
	pageA: Page;
	pages: Page[];
	byName: Record<string, Page>;
	addParticipant: (config: MeetingParticipantJoinConfig) => Promise<Page>;
	removeParticipant: (name: string) => Promise<void>;
	removeAllParticipants: () => Promise<void>;
};

export type JoinParticipantsNamedConfig = {
	roomId: string;
	participants: MeetingParticipantJoinConfig[];
	mode?: 'parallel' | 'sequential';
	skipInitialRemoteCountCheck?: boolean;
};

type BrowserFakeParticipant = {
	context: BrowserContext;
	page: Page;
	userDataDir: string;
};

const AUDIO_ASSETS_DIR = path.resolve(__dirname, '../assets/audio');
const DEFAULT_HEADLESS_AUDIO_FILE = 'continuous_speech.wav';
const browserFakeParticipants = new Map<string, BrowserFakeParticipant>();

const getBrowserFakeParticipantKey = (roomId: string, identity: string): string => {
	return `${roomId}-${identity}`;
};

const resolveAudioFilePath = (audioFile?: string): string | undefined => {
	if (!audioFile) {
		return undefined;
	}

	const audioFilePath = path.isAbsolute(audioFile) ? audioFile : path.resolve(AUDIO_ASSETS_DIR, audioFile);

	if (!existsSync(audioFilePath)) {
		throw new Error(`Audio file not found: ${audioFilePath}`);
	}

	return audioFilePath;
};

const syncParticipantCollections = (pagesByName: Record<string, Page>, pages: Page[]): void => {
	pages.splice(0, pages.length, ...Object.values(pagesByName));
};

const clickIfReady = async (locator: Locator, timeoutMs = 2_000): Promise<boolean> => {
	try {
		await locator.click({ timeout: timeoutMs });
		return true;
	} catch {
		return false;
	}
};

const completeLobbyIfPresent = async (page: Page): Promise<void> => {
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
};

const clickJoinIfPrejoinVisible = async (page: Page): Promise<boolean> => {
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
};

const openMoreOptionsMenu = async (page: Page): Promise<void> => {
	const moreOptionsButton = page.locator('#more-options-btn');
	await expect(moreOptionsButton).toBeVisible();

	if (!(await clickIfReady(moreOptionsButton, 5_000))) {
		await moreOptionsButton.click({ force: true });
	}

	await expect(page.locator('.mat-mdc-menu-content')).toBeVisible();
};

const clickControlButton = async (page: Page, selector: string, timeoutMs = 5_000): Promise<void> => {
	const button = page.locator(selector);
	await expect(button).toBeVisible({ timeout: timeoutMs });

	if (!(await clickIfReady(button, timeoutMs))) {
		await button.click({ force: true, timeout: timeoutMs });
	}
};

const toggleRemoteParticipantMute = async (page: Page, remoteStreamSelector = '.OV_stream.remote'): Promise<void> => {
	await hoverStream(page, remoteStreamSelector);
	const muteButton = page.locator(`${remoteStreamSelector} #mute-btn`).first();
	await expect(muteButton).toBeVisible();
	await muteButton.click();
};

export async function joinParticipants(
	browser: Browser,
	accessUrl: string,
	numParticipants: number
): Promise<{ pageA: Page; pages: Page[] }>;
export async function joinParticipants(
	browser: Browser,
	config: JoinParticipantsNamedConfig
): Promise<JoinedNamedParticipants>;

export async function joinParticipants(
	browser: Browser,
	accessUrlOrConfig: string | JoinParticipantsNamedConfig,
	numParticipants?: number
): Promise<{ pageA: Page; pages: Page[] } | JoinedNamedParticipants> {
	if (typeof accessUrlOrConfig === 'string') {
		if (!numParticipants || numParticipants < 1) {
			throw new Error('Number of participants must be at least 1');
		}

		const pages = await Promise.all(Array.from({ length: numParticipants }, () => browser.newPage()));

		await Promise.all(pages.map((page) => openMeeting(page, accessUrlOrConfig)));
		await Promise.all(pages.map((page) => waitForRemoteStream(page, numParticipants - 1)));

		return { pageA: pages[0], pages };
	}

	const mode = accessUrlOrConfig.mode ?? 'sequential';
	const skipInitialRemoteCountCheck = accessUrlOrConfig.skipInitialRemoteCountCheck ?? true;
	const byName: Record<string, Page> = {};
	const pages: Page[] = [];
	const headlessParticipantNames = new Set<string>();

	const addParticipant = async (config: MeetingParticipantJoinConfig): Promise<Page> => {
		const page = await joinParticipant(browser, accessUrlOrConfig.roomId, config);

		byName[config.name] = page;

		if (config.headless) {
			headlessParticipantNames.add(config.name);
		} else {
			headlessParticipantNames.delete(config.name);
		}

		syncParticipantCollections(byName, pages);

		return page;
	};

	const removeParticipant = async (name: string): Promise<void> => {
		const participantPage = byName[name];

		if (!participantPage) {
			return;
		}

		if (headlessParticipantNames.has(name)) {
			await disconnectFakeParticipant(accessUrlOrConfig.roomId, name);
		} else {
			try {
				await leaveMeeting(participantPage);
			} catch {
				// Ignore cleanup failures.
			}

			try {
				await participantPage.close();
			} catch {
				// Ignore cleanup failures.
			}
		}

		delete byName[name];
		headlessParticipantNames.delete(name);
		syncParticipantCollections(byName, pages);
	};

	const removeAllParticipants = async (): Promise<void> => {
		await Promise.all(Object.keys(byName).map((name) => removeParticipant(name)));
	};

	const pagesByName =
		mode === 'parallel'
			? await Promise.all(
					accessUrlOrConfig.participants.map(
						async (participant) =>
							[
								participant.name,
								await joinParticipant(browser, accessUrlOrConfig.roomId, participant)
							] as const
					)
				)
			: await (async () => {
					const joinedPages: Array<readonly [string, Page]> = [];

					for (const participant of accessUrlOrConfig.participants) {
						joinedPages.push([
							participant.name,
							await joinParticipant(browser, accessUrlOrConfig.roomId, participant)
						] as const);
					}

					return joinedPages;
				})();

	for (const [name, page] of pagesByName) {
		byName[name] = page;
	}

	for (const participant of accessUrlOrConfig.participants) {
		if (participant.headless) {
			headlessParticipantNames.add(participant.name);
		}
	}

	syncParticipantCollections(byName, pages);

	const pageA =
		accessUrlOrConfig.participants
			.map((participant) => byName[participant.name])
			.find((page) => page !== undefined) ?? pages[0];

	if (!skipInitialRemoteCountCheck) {
		await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(Math.max(0, pages.length - 1), {
			timeout: 20_000
		});
	}

	return {
		pageA,
		pages,
		byName,
		addParticipant,
		removeParticipant,
		removeAllParticipants
	};
}

const joinHeadlessParticipant = async (roomId: string, config: MeetingParticipantJoinConfig): Promise<Page> => {
	const {
		name,
		audioFile,
		audioEnabled = true,
		videoEnabled = true,
		screenShare = false,
		baseRole = MeetRoomMemberRole.MODERATOR
	} = config;
	const key = getBrowserFakeParticipantKey(roomId, name);
	const audioFilePath = resolveAudioFilePath(audioFile ?? DEFAULT_HEADLESS_AUDIO_FILE);

	await disconnectFakeParticipant(roomId, name);

	const chromeArgs = [
		'--use-fake-ui-for-media-stream',
		'--use-fake-device-for-media-stream',
		'--allow-file-access-from-files',
		'--no-sandbox',
		'--disable-setuid-sandbox',
		'--disable-gpu',
		'--disable-dev-shm-usage'
	];

	if (audioFilePath) {
		chromeArgs.push(`--use-file-for-fake-audio-capture=${audioFilePath}`);
	}

	const userDataDir = `/tmp/playwright-fake-participant-${name}-${Date.now()}`;
	const context = await chromium.launchPersistentContext(userDataDir, {
		headless: true,
		args: chromeArgs,
		ignoreHTTPSErrors: true,
		bypassCSP: true
	});
	const page = context.pages()[0] || (await context.newPage());
	const member = await createRoomMember(roomId, {
		name,
		baseRole
	});

	browserFakeParticipants.set(key, { context, page, userDataDir });

	try {
		await joinFromPrejoinWithMediaState(page, member.accessUrl, {
			audioEnabled,
			videoEnabled
		});

		if (screenShare) {
			await startScreensharing(page);
		}

		return page;
	} catch (error) {
		await disconnectFakeParticipant(roomId, name);
		throw error;
	}
};

const joinParticipant = async (
	browser: Browser,
	roomId: string,
	config: MeetingParticipantJoinConfig
): Promise<Page> => {
	if (config.headless) {
		return await joinHeadlessParticipant(roomId, config);
	}

	return await joinParticipantInternal(browser, roomId, config);
};

export const joinFakeParticipant = async (
	roomId: string,
	identity: string,
	options: BrowserFakeParticipantOptions = {}
): Promise<Page> => {
	return await joinHeadlessParticipant(roomId, {
		name: identity,
		headless: true,
		audioFile: options.audioFile,
		audioEnabled: options.enableAudio,
		videoEnabled: options.enableVideo,
		screenShare: options.screenShare,
		baseRole: options.baseRole ?? MeetRoomMemberRole.SPEAKER
	});
};

export const disconnectFakeParticipant = async (roomId: string, identity: string): Promise<void> => {
	const key = getBrowserFakeParticipantKey(roomId, identity);
	const participant = browserFakeParticipants.get(key);

	if (!participant) {
		return;
	}

	try {
		await participant.page.close();
	} catch {
		// Ignore cleanup failures.
	}

	try {
		await participant.context.close();
	} catch {
		// Ignore cleanup failures.
	}

	rmSync(participant.userDataDir, { force: true, recursive: true });
	browserFakeParticipants.delete(key);
};

export const disconnectAllBrowserFakeParticipants = async (): Promise<void> => {
	const participants = [...browserFakeParticipants.entries()];

	for (const [key, participant] of participants) {
		try {
			await participant.page.close();
		} catch {
			// Ignore cleanup failures.
		}

		try {
			await participant.context.close();
		} catch {
			// Ignore cleanup failures.
		}

		rmSync(participant.userDataDir, { force: true, recursive: true });
		browserFakeParticipants.delete(key);
	}
};

const joinParticipantInternal = async (
	browser: Browser,
	roomId: string,
	config: MeetingParticipantJoinConfig
): Promise<Page> => {
	const {
		name,
		audioEnabled = false,
		videoEnabled = true,
		baseRole = MeetRoomMemberRole.MODERATOR,
		screenShare = false
	} = config;
	const member = await createRoomMember(roomId, {
		name,
		baseRole
	});
	const page = await browser.newPage();

	await joinFromPrejoinWithMediaState(page, member.accessUrl, { audioEnabled, videoEnabled });

	if (screenShare) {
		await startScreensharing(page);
	}

	return page;
};

export const getVisibleRemoteParticipantNames = async (page: Page): Promise<string[]> => {
	return await page.evaluate(() => {
		const names = Array.from(document.querySelectorAll('.OV_stream_video.remote'))
			.filter((stream) => {
				const element = stream as HTMLElement;
				const rect = element.getBoundingClientRect();
				const style = window.getComputedStyle(element);

				return (
					rect.width > 0 &&
					rect.height > 0 &&
					style.display !== 'none' &&
					style.visibility !== 'hidden' &&
					style.opacity !== '0' &&
					!element.classList.contains('no-size')
				);
			})
			.map((stream) => stream.querySelector('#participant-name-container')?.textContent?.trim() ?? '')
			.filter((name) => name.length > 0);

		return [...new Set(names)];
	});
};

export const waitForVisibleRemoteParticipants = async (
	page: Page,
	options: { includes?: string[]; excludes?: string[]; count?: number },
	timeout = 20_000
): Promise<void> => {
	await expect
		.poll(
			async () => {
				const names = await getVisibleRemoteParticipantNames(page);

				return {
					matchesCount: options.count === undefined || names.length === options.count,
					matchesIncludes: (options.includes ?? []).every((name) => names.includes(name)),
					matchesExcludes: (options.excludes ?? []).every((name) => !names.includes(name))
				};
			},
			{ timeout }
		)
		.toEqual({
			matchesCount: true,
			matchesIncludes: true,
			matchesExcludes: true
		});
};

export const openMeeting = async (page: Page, accessUrl: string, timeoutMs = 45_000): Promise<void> => {
	for (let attempt = 0; attempt < 2; attempt += 1) {
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
	}

	await expect(page.locator('#layout-container')).toBeVisible({ timeout: timeoutMs });
	await expect(page.locator('#media-buttons-container')).toBeVisible({ timeout: timeoutMs });
};

export const openPrejoin = async (page: Page, accessUrl: string, timeoutMs = 45_000): Promise<void> => {
	for (let attempt = 0; attempt < 2; attempt += 1) {
		await page.goto(accessUrl, { waitUntil: 'domcontentloaded' });

		const prejoinDeadline = Date.now() + timeoutMs;

		while (Date.now() < prejoinDeadline) {
			if (await page.locator('#prejoin-container').isVisible()) {
				return;
			}

			await completeLobbyIfPresent(page);
			await page.waitForTimeout(100); // Use expect.poll in next assertion
		}
	}

	await expect(page.locator('#prejoin-container')).toBeVisible({ timeout: timeoutMs });
};

export const toggleChatPanel = async (page: Page, action: 'open' | 'close' = 'open'): Promise<void> => {
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
};

export const sendChatMessage = async (page: Page, message: string): Promise<void> => {
	await page.locator('#chat-input').fill(message);
	await page.locator('#send-btn').click();
};

export const expectChatMessageCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('.message')).toHaveCount(count);
};

export const expectFirstMessageSender = async (page: Page, senderName: string): Promise<void> => {
	await expect(page.locator('.participant-name-container > p').first()).toContainText(senderName);
};

export const expectChatLinkCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('.chat-message a')).toHaveCount(count);
};

export const expectChatMessageTextAt = async (page: Page, index: number, text: string): Promise<void> => {
	await expect(page.locator('.chat-message').nth(index)).toContainText(text);
};

export const expectChatLinkHrefContains = async (
	page: Page,
	index: number,
	expectedHrefPart: string
): Promise<void> => {
	await expect(page.locator('.chat-message a').nth(index)).toHaveAttribute('href', new RegExp(expectedHrefPart));
};

export const expectSnackbarNotification = async (page: Page): Promise<void> => {
	await expect(page.locator('.snackbarNotification')).toBeVisible();
};

export const toggleParticipantsPanel = async (page: Page): Promise<void> => {
	await page.locator('#participants-panel-btn').click();
};

export const toggleActivitiesPanel = async (page: Page): Promise<void> => {
	await page.locator('#activities-panel-btn').click();
};

export const openSettingsPanel = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await page.locator('#toolbar-settings-btn').click();
	await expect(page.locator('.sidenav-menu')).toBeVisible();
};

/**
 * Opens the layout settings panel by clicking more-options and grid-layout-settings buttons
 */
export const openLayoutSettingsPanel = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);

	const gridLayoutSettingsButton = page.locator('#grid-layout-settings-btn');
	await expect(gridLayoutSettingsButton).toBeVisible();

	if (!(await clickIfReady(gridLayoutSettingsButton, 5_000))) {
		await gridLayoutSettingsButton.click({ force: true });
	}

	await expect(page.locator('#settings-container')).toBeVisible();
};

export const closeSettingsPanel = async (page: Page): Promise<void> => {
	await page.locator('.panel-close-button').click();
	await expectHidden(page, '#settings-container');
};

export const expectVisible = async (page: Page, selector: string): Promise<void> => {
	await expect(page.locator(selector)).toBeVisible();
};

export const expectHidden = async (page: Page, selector: string): Promise<void> => {
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
};

export const installClipboardCapture = async (page: Page): Promise<void> => {
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
};

export const getCopiedText = async (page: Page): Promise<string> => {
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
};

export const expectCopiedUrl = async (page: Page, timeoutMs = 5_000): Promise<void> => {
	await expect.poll(async () => await getCopiedText(page), { timeout: timeoutMs }).toMatch(/^https?:\/\//);
};

export const openPrejoinBackgroundsPanel = async (page: Page): Promise<void> => {
	await page.locator('#backgrounds-button').click();
	await expect(page.locator('#background-effects-container')).toBeVisible();
};

export const closePrejoinBackgroundsPanel = async (page: Page): Promise<void> => {
	await page.locator('#backgrounds-button').click();
	await expect(page.locator('#background-effects-container')).toHaveCount(0);
};

export const setPrejoinCameraStatus = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await togglePrejoinCamera(page, timeoutMs);
};

export const togglePrejoinCamera = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await clickControlButton(page, '#camera-button', timeoutMs);
};

export const openRoomBackgroundsPanel = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await page.locator('#virtual-bg-btn:visible').click();
	await expect(page.locator('#background-effects-container')).toBeVisible();
};

export const closeRoomBackgroundsPanel = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await page.locator('#virtual-bg-btn:visible').click();
	await expect(page.locator('#background-effects-container')).toHaveCount(0);
};

export const applyBackgroundEffect = async (page: Page, effectId: string, timeoutMs = 10_000): Promise<void> => {
	await page.locator(`#effect-${effectId}`).click();
	await expect
		.poll(async () => (await page.locator(`.OV_stream`).count()) > 0, { timeout: timeoutMs })
		.toBeTruthy()
		.catch(() => Promise.resolve());
};

export const captureVideoElementScreenshot = async (page: Page): Promise<Buffer> => {
	const videoLocator = page.locator('.OV_video-element').first();

	for (let attempt = 0; attempt < 3; attempt += 1) {
		await expect(videoLocator).toBeVisible({ timeout: 5_000 });

		try {
			return await videoLocator.screenshot();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const isDetached = message.includes('Element is not attached to the DOM');

			if (!isDetached || attempt === 2) {
				throw error;
			}

			await page.waitForTimeout(150);
		}
	}

	throw new Error('Unable to capture video screenshot after retries');
};

export const expectSignificantImageDifference = (
	beforePngBuffer: Buffer,
	afterPngBuffer: Buffer,
	options?: { threshold?: number; minDiffPixels?: number }
): void => {
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
};

export const startScreensharing = async (page: Page): Promise<void> => {
	await page.locator('#screenshare-btn').click();
};

export const stopScreensharing = async (page: Page, timeoutMs = 10_000): Promise<void> => {
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
};

export const toggleCamera = async (page: Page): Promise<void> => {
	await clickControlButton(page, '#camera-btn');
};

export const toggleMicrophone = async (page: Page): Promise<void> => {
	await clickControlButton(page, '#mic-btn');
};

export const speakFor = async (page: Page, durationMs: number): Promise<void> => {
	await toggleMicrophone(page);
	await page.waitForTimeout(durationMs);
	await toggleMicrophone(page);
};

export const leaveMeeting = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await page.locator('#leave-btn').click();

	if (await page.locator('#leave-option').isVisible()) {
		await page.locator('#leave-option').click();
	}

	await expect.poll(async () => await page.locator('#layout-container').count(), { timeout: timeoutMs }).toBe(0);
};

export const expectVideoCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('video')).toHaveCount(count);
};

export const expectPinnedStreamCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('.OV_big .OV_stream')).toHaveCount(count);
};

export async function expectScreenTypeCount(page: Page, count: number): Promise<void> {
	await expect(page.locator('.screen-source')).toHaveCount(count);
}

export const getPinnedStreamCount = async (page: Page): Promise<number> => {
	return await page.locator('.OV_big .OV_stream').count();
};

export const toggleStreamPin = async (page: Page, selector: string, timeoutMs = 10_000): Promise<void> => {
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
};

export const unpinCurrentPinnedStream = async (page: Page, timeoutMs = 10_000): Promise<void> => {
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
};

export async function getScreenSourceTracks(
	page: Page
): Promise<Array<{ kind: string; enabled: boolean; id: string; label: string }>> {
	return await page.evaluate(() => {
		const video = document.querySelector('.screen-source') as HTMLVideoElement | null;

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
export const expectStreamCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('.OV_publisher .OV_stream')).toHaveCount(count);
};

/**
 * Expects a specific number of screen share streams to be present
 */
export const expectScreenShareCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('.OV_screen')).toHaveCount(count);
};

/**
 * Expects a specific number of local video and audio elements to be present
 */
export const expectLocalStreamCount = async (page: Page, counts: { video?: number; audio?: number }): Promise<void> => {
	if (counts.video !== undefined) {
		await expect(page.locator('.OV_stream.local .OV_video-element')).toHaveCount(counts.video);
		await expect(page.locator('video')).toHaveCount(counts.video);
	}

	if (counts.audio !== undefined) {
		await expect(page.locator('.OV_stream.local .OV_audio-element')).toHaveCount(counts.audio);
		await expect(page.locator('audio')).toHaveCount(counts.audio);
	}
};

/**
 * Joins a meeting from prejoin by clicking join button and waiting for layout
 */
export const joinFromPrejoin = async (page: Page, accessUrl: string): Promise<void> => {
	await joinFromPrejoinWithMediaState(page, accessUrl);
};

/**
 * Waits for a participant's remote stream to appear and be visible
 */
export const waitForRemoteStream = async (
	page: Page,
	count = 1,
	options?: { requireAudioTracks?: boolean }
): Promise<void> => {
	await expect
		.poll(
			async () =>
				await page.evaluate((requireAudioTracks) => {
					const remoteStreams = Array.from(document.querySelectorAll('.OV_stream.remote')) as HTMLElement[];
					const visibleRemoteStreams = remoteStreams.filter((stream) => {
						const rect = stream.getBoundingClientRect();
						const style = window.getComputedStyle(stream);
						return (
							rect.width > 0 &&
							rect.height > 0 &&
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							style.opacity !== '0' &&
							!stream.classList.contains('no-size')
						);
					});

					const playableRemoteVideos = visibleRemoteStreams.filter((stream) => {
						const video = stream.querySelector('video') as HTMLVideoElement | null;

						if (
							!video ||
							!video.srcObject ||
							video.paused ||
							video.readyState < 2 ||
							video.videoWidth <= 0
						) {
							return false;
						}

						const mediaStream = video.srcObject as MediaStream;
						const liveVideoTracks = mediaStream
							.getVideoTracks()
							.filter((track) => track.readyState === 'live');
						const liveAudioTracks = mediaStream
							.getAudioTracks()
							.filter((track) => track.readyState === 'live');

						return liveVideoTracks.length > 0 && (!requireAudioTracks || liveAudioTracks.length > 0);
					});

					return {
						visibleRemoteStreams: visibleRemoteStreams.length,
						playableRemoteVideos: playableRemoteVideos.length
					};
				}, options?.requireAudioTracks ?? false),
			{ timeout: 15_000 }
		)
		.toEqual({ visibleRemoteStreams: count, playableRemoteVideos: count });
};

/**
 * Gets all audio elements on the page (local + remote participants)
 */
export const getAudioElementCount = async (page: Page): Promise<number> => {
	return await page.locator('audio').count();
};

/**
 * Expects no-size class to be removed from a stream element (video should be visible)
 */
export const expectStreamVideoVisible = async (page: Page, selector = '.OV_stream.local'): Promise<void> => {
	const stream = page.locator(selector);
	const classes = await stream.getAttribute('class');
	expect(classes).not.toContain('no-size');
};

/**
 * Checks if local participant has only audio tracks (no video)
 */
export const expectLocalParticipantAudioOnly = async (page: Page): Promise<void> => {
	const videoElements = await page.locator('.OV_stream.local .OV_video-element').count();
	expect(videoElements).toBe(0);
	const audioElements = await page.locator('.OV_stream.local .OV_audio-element').count();
	expect(audioElements).toBeGreaterThan(0);
};

/**
 * Checks if no streams are being played
 */
export const expectNoStreamsPlaying = async (page: Page): Promise<void> => {
	await expect(page.locator('.OV_stream .OV_video-element')).toHaveCount(0);
	await expect(page.locator('.OV_stream .OV_audio-element')).toHaveCount(0);
};

/**
 * Toggles microphone in prejoin (companion to togglePrejoinCamera)
 */
export const togglePrejoinMicrophone = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await clickControlButton(page, '#microphone-button', timeoutMs);
};

/**
 * Hovers over a stream element to reveal controls
 */
export const hoverStream = async (page: Page, selector = '.OV_stream_video.local'): Promise<void> => {
	const locator = page.locator(selector).first();
	await locator.hover();
};

/**
 * Gets the bounding box of an element
 */
export const getElementBoundingBox = async (
	page: Page,
	selector: string
): Promise<{ x: number; y: number; width: number; height: number } | null> => {
	const locator = page.locator(selector).first();

	if ((await locator.count()) === 0) {
		return null;
	}

	await locator.waitFor({ state: 'visible', timeout: 5_000 });
	const box = await locator.boundingBox();

	if (!box) {
		return null;
	}

	return {
		x: box.x,
		y: box.y,
		width: box.width,
		height: box.height
	};
};

/**
 * Minimizes the local video stream
 */
export const minimizeStream = async (page: Page): Promise<void> => {
	await hoverStream(page, '.OV_publisher .OV_stream_video.local');
	await expect(page.locator('#minimize-btn')).toBeVisible();
	await page.locator('#minimize-btn').click();
};

/**
 * Maximizes (restores) the local video stream
 */
export const maximizeStream = async (page: Page): Promise<void> => {
	await hoverStream(page, '.local_participant .OV_stream_video.local');
	// Current UI toggles minimize/maximize with the same control id.
	await expect(page.locator('#minimize-btn')).toBeVisible();
	await page.locator('#minimize-btn').click();
};

/**
 * Drags a stream element to a new position
 */
export const dragStream = async (page: Page, selector: string, targetX: number, targetY: number): Promise<void> => {
	const element =
		selector === '.local_participant'
			? page.locator('.local_participant:has(.OV_stream_video.local)').first()
			: page.locator(selector).first();

	await element.waitFor({ state: 'visible', timeout: 5_000 });
	const box = await element.boundingBox();

	if (!box) {
		throw new Error('Element not found for dragging');
	}

	await element.hover();
	await page.mouse.down();
	await page.mouse.move(targetX, targetY, { steps: 10 });
	await page.mouse.up();
};

/**
 * Checks if video is currently enabled in prejoin by inspecting the camera toggle state
 */
export const isPrejoinVideoEnabled = async (page: Page): Promise<boolean> => {
	const cameraButton = page.locator('#camera-button');

	await expect(cameraButton).toBeVisible({ timeout: 10_000 });

	if ((await cameraButton.count()) === 0) {
		return false;
	}

	return await cameraButton.evaluate((element) => element.classList.contains('device-enabled'));
};

/**
 * Checks if audio is currently enabled in prejoin by inspecting the microphone toggle state
 */
export const isPrejoinAudioEnabled = async (page: Page): Promise<boolean> => {
	const microphoneButton = page.locator('#microphone-button');

	await expect(microphoneButton).toBeVisible();

	if ((await microphoneButton.count()) === 0) {
		return false;
	}

	return await microphoneButton.evaluate((element) => element.classList.contains('device-enabled'));
};

/**
 * Ensures video is in the desired state in prejoin before joining
 * If current state doesn't match desired, toggles the camera button
 */
export const ensurePrejoinVideoState = async (page: Page, enabled: boolean, timeoutMs = 10_000): Promise<void> => {
	const currentlyEnabled = await isPrejoinVideoEnabled(page);

	if (currentlyEnabled !== enabled) {
		await setPrejoinCameraStatus(page);
		await expect
			.poll(async () => (await isPrejoinVideoEnabled(page)) !== currentlyEnabled, { timeout: timeoutMs })
			.toBeTruthy()
			.catch(() => Promise.resolve());
	}
};

/**
 * Ensures audio is in the desired state in prejoin before joining
 * Note: Audio state detection is limited in UI - this toggles if needed
 */
export const ensurePrejoinAudioState = async (page: Page, enabled: boolean, timeoutMs = 10_000): Promise<void> => {
	const currentlyEnabled = await isPrejoinAudioEnabled(page);

	if (currentlyEnabled !== enabled) {
		await togglePrejoinMicrophone(page);
		await expect
			.poll(async () => (await isPrejoinAudioEnabled(page)) !== currentlyEnabled, { timeout: timeoutMs })
			.toBeTruthy()
			.catch(() => Promise.resolve());
	}
};

/**
 * Joins a meeting from prejoin with specific media states
 * Handles both video and audio state configuration before joining
 */
export const joinFromPrejoinWithMediaState = async (
	page: Page,
	accessUrl: string,
	options?: { videoEnabled?: boolean; audioEnabled?: boolean }
): Promise<void> => {
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
	await expect(page.locator('.OV_stream.local')).toBeVisible();
};

export const muteRemoteParticipant = async (page: Page, remoteStreamSelector = '.OV_stream.remote'): Promise<void> => {
	await toggleRemoteParticipantMute(page, remoteStreamSelector);
};

export const unmuteRemoteParticipant = async (
	page: Page,
	remoteStreamSelector = '.OV_stream.remote'
): Promise<void> => {
	await toggleRemoteParticipantMute(page, remoteStreamSelector);
};
