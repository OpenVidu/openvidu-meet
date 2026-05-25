import { MeetRoomMemberPermissions, MeetRoomMemberRole } from '@openvidu-meet/typings';
import { Browser, chromium, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import { startScreensharing } from './media-controls.helper';
import { createRoomMember } from './meet-api.helper';
import { leaveMeeting, openMeeting } from './meeting-navigation.helper';
import { waitForRemoteStream } from './stream.helper';

// ─── Types ──────────────────────────────────────────────────────────────────

export type JoinParticipantsConfig = {
	/** The room to join. Always required (used as scope key for fake-participant tracking). */
	roomId: string;
	/** When provided, all participants join via this URL (baseRole/customPermissions are ignored). */
	accessUrl?: string;
	/** A list of participant configs or a number (auto-generates names). */
	participants: ParticipantConfig[] | number;
	mode?: 'parallel' | 'sequential';
	skipRemoteStreamCheck?: boolean;
};

export type ParticipantConfig = {
	name: string;
	headless?: boolean;
	videoEnabled?: boolean;
	audioEnabled?: boolean;
	audioFile?: string;
	screenShare?: boolean;
	/** Ignored when accessUrl is provided). */
	baseRole?: MeetRoomMemberRole;
	/** Ignored when accessUrl is provided). */
	customPermissions?: Partial<MeetRoomMemberPermissions>;
};

export type JoinedParticipants = {
	pages: Page[];
	byName: Record<string, Page>;
	addParticipant: (config: ParticipantConfig) => Promise<Page>;
	removeParticipant: (name: string) => Promise<void>;
	removeAllParticipants: () => Promise<void>;
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

// ─── Internal helpers ─────────────────────────────────────────────────────

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

const joinParticipant = async (
	browser: Browser,
	roomId: string,
	config: ParticipantConfig,
	accessUrl?: string
): Promise<Page> => {
	if (config.headless) {
		return await joinHeadlessParticipant(roomId, config, accessUrl);
	}

	return await joinParticipantInternal(browser, roomId, config, accessUrl);
};

/**
 * Joins a non-headless participant to the meeting.
 *
 * - When `accessUrl` is provided the participant navigates directly to it.
 * - Otherwise a room member is created via the API using `roomId`.
 */
const joinParticipantInternal = async (
	browser: Browser,
	roomId: string,
	config: ParticipantConfig,
	accessUrl?: string
): Promise<Page> => {
	const {
		name,
		audioEnabled = false,
		videoEnabled = true,
		screenShare = false,
		baseRole = MeetRoomMemberRole.MODERATOR,
		customPermissions
	} = config;

	const url = accessUrl ?? (await createRoomMember(roomId, { name, baseRole, customPermissions })).accessUrl;
	const page = await browser.newPage();

	await openMeeting(page, url, { ...(accessUrl && { name }), audioEnabled, videoEnabled });

	if (screenShare) {
		await startScreensharing(page);
	}

	return page;
};

/**
 * Launches a headless Chromium with fake media and joins the meeting.
 *
 * - When `accessUrl` is provided the participant navigates directly to it
 *   and sets its display name via the lobby input.
 * - Otherwise a room member is created via the API using `roomId`.
 */
const joinHeadlessParticipant = async (
	roomId: string,
	config: ParticipantConfig,
	accessUrl?: string
): Promise<Page> => {
	const {
		name,
		videoEnabled = true,
		audioEnabled = true,
		audioFile,
		screenShare = false,
		baseRole = MeetRoomMemberRole.MODERATOR,
		customPermissions
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
	browserFakeParticipants.set(getBrowserFakeParticipantKey(roomId, name), { context, page, userDataDir });

	const url = accessUrl ?? (await createRoomMember(roomId, { name, baseRole, customPermissions })).accessUrl;

	try {
		await openMeeting(page, url, { ...(accessUrl && { name }), audioEnabled, videoEnabled });

		if (screenShare) {
			await startScreensharing(page);
		}

		return page;
	} catch (error) {
		await disconnectFakeParticipant(roomId, name);
		throw error;
	}
};

/**
 * Gracefully disconnects a previously-created fake participant and cleans up
 * the temporary user-data directory.
 */
const disconnectFakeParticipant = async (roomId: string, identity: string): Promise<void> => {
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

// ─── Public participant helpers ─────────────────────────────────────────────

/**
 * Opens the meeting for a set of participants and returns pages, a by-name
 * lookup, and helpers for dynamically adding/removing participants.
 *
 * Participants can be specified as a number (auto-generated names) or as an
 * array of {@link ParticipantConfig} objects.
 *
 * - When `accessUrl` is provided every participant navigates to that URL and
 *   fills in the lobby name input. `baseRole` / `customPermissions` are ignored.
 * - Otherwise, a room member is created via the API for each participant.
 *
 * Unless `skipRemoteStreamCheck` is `true`, the function waits until every
 * participant can see the expected number of remote streams (with correct
 * video counts based on each participant's `videoEnabled` flag).
 */
export const joinParticipants = async (
	browser: Browser,
	config: JoinParticipantsConfig
): Promise<JoinedParticipants> => {
	const { roomId, accessUrl, mode = 'parallel', skipRemoteStreamCheck = false } = config;

	// Normalise participants: number → auto-named configs
	const participantConfigs: ParticipantConfig[] =
		typeof config.participants === 'number'
			? Array.from({ length: config.participants }, (_, i) => ({ name: `participant-${i}` }))
			: config.participants;

	const byName: Record<string, Page> = {};
	const pages: Page[] = [];
	const headlessParticipantNames = new Set<string>();

	const addParticipant = async (cfg: ParticipantConfig): Promise<Page> => {
		const page = await joinParticipant(browser, roomId, cfg, accessUrl);
		byName[cfg.name] = page;

		if (cfg.headless) {
			headlessParticipantNames.add(cfg.name);
		} else {
			headlessParticipantNames.delete(cfg.name);
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
			await disconnectFakeParticipant(roomId, name);
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

	// ── Join initial participants ──

	const pagesByName =
		mode === 'parallel'
			? await Promise.all(
					participantConfigs.map(
						async (cfg) => [cfg.name, await joinParticipant(browser, roomId, cfg, accessUrl)] as const
					)
				)
			: await (async () => {
					const joined: Array<readonly [string, Page]> = [];

					for (const cfg of participantConfigs) {
						joined.push([cfg.name, await joinParticipant(browser, roomId, cfg, accessUrl)] as const);
					}

					return joined;
				})();

	for (const [name, page] of pagesByName) {
		byName[name] = page;
	}

	for (const cfg of participantConfigs) {
		if (cfg.headless) {
			headlessParticipantNames.add(cfg.name);
		}
	}

	syncParticipantCollections(byName, pages);

	// ── Wait for remote streams ──

	if (!skipRemoteStreamCheck && pages.length > 1) {
		const videoEnabledCount = participantConfigs.filter((cfg) => cfg.videoEnabled !== false).length;
		const screenShareCount = participantConfigs.filter((cfg) => cfg.screenShare).length;

		await Promise.all(
			pages.map((page, i) => {
				const thisHasVideo = participantConfigs[i]?.videoEnabled !== false;
				const thisHasScreenShare = participantConfigs[i]?.screenShare === true;
				const remoteScreenShareCount = screenShareCount - (thisHasScreenShare ? 1 : 0);
				const remoteCount = pages.length - 1 + remoteScreenShareCount;
				const remoteVideoCount = videoEnabledCount - (thisHasVideo ? 1 : 0) + remoteScreenShareCount;

				return waitForRemoteStream(page, remoteCount, { videoCount: remoteVideoCount });
			})
		);
	}

	return { pages, byName, addParticipant, removeParticipant, removeAllParticipants };
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
