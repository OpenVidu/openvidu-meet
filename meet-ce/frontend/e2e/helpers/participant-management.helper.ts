import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { Browser, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import { ensurePrejoinAudioState, ensurePrejoinVideoState, startScreensharing } from './media-controls.helper';
import { createRoomMember } from './meet-api.helper';
import { leaveMeeting, openMeeting, openPrejoin } from './meeting-navigation.helper';
import { waitForRemoteStream } from './stream.helper';

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Internal state ─────────────────────────────────────────────────────────

const AUDIO_ASSETS_DIR = path.resolve(__dirname, '../assets/audio');
const DEFAULT_HEADLESS_AUDIO_FILE = 'continuous_speech.wav';
const browserFakeParticipants = new Map<string, BrowserFakeParticipant>();

const getBrowserFakeParticipantKey = (roomId: string, identity: string): string => {
	return `${roomId}-${identity}`;
};

const resolveAudioFilePath = (audioFile: string): string => {
	const audioFilePath = path.isAbsolute(audioFile) ? audioFile : path.resolve(AUDIO_ASSETS_DIR, audioFile);

	if (!existsSync(audioFilePath)) {
		throw new Error(`Audio file not found: ${audioFilePath}`);
	}

	return audioFilePath;
};

const syncParticipantCollections = (pagesByName: Record<string, Page>, pages: Page[]): void => {
	pages.splice(0, pages.length, ...Object.values(pagesByName));
};

// ─── Prejoin → join with media state ────────────────────────────────────────

/**
 * Opens the prejoin screen, toggles camera/microphone to the desired state,
 * then clicks join and waits for the local stream to appear.
 */
export const joinFromPrejoinWithMediaState = async (
	page: Page,
	accessUrl: string,
	options?: { videoEnabled?: boolean; audioEnabled?: boolean }
): Promise<void> => {
	const { videoEnabled, audioEnabled } = options ?? {};

	await openPrejoin(page, accessUrl);

	if (videoEnabled !== undefined) {
		await ensurePrejoinVideoState(page, videoEnabled);
	}

	if (audioEnabled !== undefined) {
		await ensurePrejoinAudioState(page, audioEnabled);
	}

	await page.locator('#join-button').click();
	await expect(page.locator('#layout-container')).toBeVisible();
	await expect(page.locator('.OV_stream.local')).toBeVisible();
};

// ─── Headless (fake-device) participants ────────────────────────────────────

const joinHeadlessParticipant = async (roomId: string, config: MeetingParticipantJoinConfig): Promise<Page> => {
	const {
		name,
		audioFile,
		audioEnabled = true,
		videoEnabled = true,
		screenShare = false,
		baseRole = MeetRoomMemberRole.MODERATOR
	} = config;
	const audioFilePath = resolveAudioFilePath(audioFile ?? DEFAULT_HEADLESS_AUDIO_FILE);

	await disconnectFakeParticipant(roomId, name);

	const chromeArgs = [
		'--use-fake-ui-for-media-stream',
		'--use-fake-device-for-media-stream',
		'--allow-file-access-from-files',
		'--no-sandbox',
		'--disable-setuid-sandbox',
		'--disable-gpu',
		'--disable-dev-shm-usage',
		`--use-file-for-fake-audio-capture=${audioFilePath}`
	];

	const userDataDir = `/tmp/playwright-fake-participant-${name}-${Date.now()}`;
	const context = await chromium.launchPersistentContext(userDataDir, {
		headless: true,
		args: chromeArgs,
		ignoreHTTPSErrors: true,
		bypassCSP: true
	});
	const page = context.pages()[0] || (await context.newPage());
	const member = await createRoomMember(roomId, { name, baseRole });

	browserFakeParticipants.set(getBrowserFakeParticipantKey(roomId, name), { context, page, userDataDir });

	try {
		await joinFromPrejoinWithMediaState(page, member.accessUrl, { audioEnabled, videoEnabled });

		if (screenShare) {
			await startScreensharing(page);
		}

		return page;
	} catch (error) {
		await disconnectFakeParticipant(roomId, name);
		throw error;
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
	const member = await createRoomMember(roomId, { name, baseRole });
	const page = await browser.newPage();

	await joinFromPrejoinWithMediaState(page, member.accessUrl, { audioEnabled, videoEnabled });

	if (screenShare) {
		await startScreensharing(page);
	}

	return page;
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

// ─── Public participant helpers ─────────────────────────────────────────────

/**
 * Launches a headless Chromium instance with fake media devices and joins the
 * room as a "bot" participant. Returns the page for further interaction.
 */
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

/**
 * Gracefully disconnects a previously-created fake participant and cleans up
 * the temporary user-data directory.
 */
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

/**
 * Disconnects every fake participant that was created during the test run.
 */
export const disconnectAllBrowserFakeParticipants = async (): Promise<void> => {
	const participants = [...browserFakeParticipants.entries()];

	for (const [, participant] of participants) {
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
	}

	browserFakeParticipants.clear();
};

// ─── Multi-participant orchestration ────────────────────────────────────────

/**
 * Opens the meeting for a fixed number of anonymous participants (simple overload)
 * or for a set of named participants with fine-grained control (config overload).
 */
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
	// ── Simple overload: N anonymous participants via accessUrl ──
	if (typeof accessUrlOrConfig === 'string') {
		if (!numParticipants || numParticipants < 1) {
			throw new Error('Number of participants must be at least 1');
		}

		const pages = await Promise.all(Array.from({ length: numParticipants }, () => browser.newPage()));

		await Promise.all(pages.map((page) => openMeeting(page, accessUrlOrConfig)));
		await Promise.all(pages.map((page) => waitForRemoteStream(page, numParticipants - 1)));

		return { pageA: pages[0], pages };
	}

	// ── Named-participant overload ──
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

	return { pageA, pages, byName, addParticipant, removeParticipant, removeAllParticipants };
}
