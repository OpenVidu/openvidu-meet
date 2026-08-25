import { MeetRoomMemberRole, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import { Browser, chromium, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import { startScreensharing } from './media-controls.helper';
import { createRoomMember, type WirePermissions } from './meet-api.helper';
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
	// Wire-level on purpose: several suites seed the deprecated spellings. Removed in 3.12.0.
	customPermissions?: WirePermissions;
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
		audioEnabled = true,
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
				await participantPage.waitForSelector('.disconnected-container', { timeout: 5000 });
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

// ─── Participants panel: lookup ───────────────────────────────────────────────

/**
 * Returns the participant SID (`data-participant-id`) for the participant whose
 * display name matches `participantName`, or an empty string if not found.
 */
export const getParticipantIdByName = async (page: Page, participantName: string): Promise<string> => {
	const container = page.locator('[data-participant-id]', { hasText: participantName }).first();
	return (await container.getAttribute('data-participant-id', { timeout: 10_000 })) ?? '';
};

/**
 * Returns the local participant's SID (`data-participant-id`). The local participant is rendered
 * inside the `.local-participant-container` wrapper of the participants panel.
 */
export const getLocalParticipantId = async (page: Page): Promise<string> => {
	const container = page.locator('.local-participant-container [data-participant-id]').first();
	return (await container.getAttribute('data-participant-id', { timeout: 10_000 })) ?? '';
};

// ─── Participants panel: moderation actions ───────────────────────────────────

/**
 * Opens a participant's row menu. Role changes and removal live there; the three device buttons stay
 * in the row itself.
 */
const openParticipantMenu = async (page: Page, participantId: string): Promise<void> => {
	await page.locator(`#participant-menu-btn-${participantId}`).click({ timeout: 10_000 });
	await expect(page.locator('.mat-mdc-menu-panel')).toBeVisible({ timeout: 10_000 });
};

/**
 * Waits for the menu overlay to go. It outlives the close, and would swallow the next click on the
 * panel underneath.
 */
const expectMenuClosed = (page: Page): Promise<void> =>
	expect(page.locator('.mat-mdc-menu-panel')).toHaveCount(0, { timeout: 10_000 });

/**
 * Picks one item out of a participant's row menu. Picking closes the menu on its own.
 */
const pickFromParticipantMenu = async (page: Page, participantId: string, item: string): Promise<void> => {
	await openParticipantMenu(page, participantId);
	await page.locator(item).click({ timeout: 10_000 });
	await expectMenuClosed(page);
};

/**
 * Promotes a participant to moderator from their row menu.
 */
export const makeParticipantModerator = async (page: Page, participantId: string): Promise<void> => {
	await pickFromParticipantMenu(page, participantId, `#make-moderator-btn-${participantId}`);
};

/**
 * Demotes a promoted moderator back to their original role from their row menu.
 */
export const removeParticipantModerator = async (page: Page, participantId: string): Promise<void> => {
	await pickFromParticipantMenu(page, participantId, `#remove-moderator-btn-${participantId}`);
};

/**
 * Removes a participant from the meeting from their row menu.
 */
export const kickParticipant = async (page: Page, participantId: string): Promise<void> => {
	await pickFromParticipantMenu(page, participantId, `#kick-participant-btn-${participantId}`);
};

/** The device a moderation mute turns off. */
export type MuteMedia = 'audio' | 'video' | 'screenShare';

const MUTE_BUTTON_ID: Record<MuteMedia, string> = {
	audio: 'mute-audio-btn',
	video: 'mute-video-btn',
	screenShare: 'stop-screen-share-btn'
};

const muteButton = (page: Page, participantId: string, media: MuteMedia): Locator =>
	page.locator(`#${MUTE_BUTTON_ID[media]}-${participantId}`);

/**
 * Turns off one of a participant's devices from the device button in their row.
 */
export const muteParticipantMedia = async (page: Page, participantId: string, media: MuteMedia): Promise<void> => {
	await muteButton(page, participantId, media).click({ timeout: 10_000 });
};

/**
 * Asserts that the row's {@link media} button can turn that device off.
 *
 * The button is always rendered — it reports the device state whether or not the viewer may act —
 * so availability is a matter of it being enabled, never of it being absent.
 */
export const expectMuteButton = async (page: Page, participantId: string, media: MuteMedia): Promise<void> => {
	await expect(muteButton(page, participantId, media)).toBeEnabled({ timeout: 10_000 });
};

/**
 * Asserts that the row's {@link media} button only reports the device and cannot turn it off —
 * either because the viewer may not moderate this participant, or because the device is already off
 * and no API call can turn it back on.
 */
export const expectNoMuteButton = async (page: Page, participantId: string, media: MuteMedia): Promise<void> => {
	await expect(muteButton(page, participantId, media)).toBeDisabled({ timeout: 10_000 });
};

/** What a device button reports. Screen share is not a special case: it is on, or it is off. */
export type MediaState = 'active' | 'off';

/**
 * Asserts what a participant row reports about one of their devices.
 */
export const expectMediaState = async (
	page: Page,
	participantId: string,
	media: MuteMedia,
	state: MediaState
): Promise<void> => {
	await expect(muteButton(page, participantId, media)).toHaveAttribute('data-state', state, { timeout: 10_000 });
};

/**
 * Asserts that a row says nothing at all about one of a participant's devices. Only screen share
 * ever does this: it reports the positive state only, so an idle one leaves its slot empty rather
 * than telling every row that nobody is sharing.
 */
export const expectNoMediaReport = async (page: Page, participantId: string, media: MuteMedia): Promise<void> => {
	await expect(muteButton(page, participantId, media)).toHaveCount(0, { timeout: 10_000 });
};

/** The device a panel-wide action turns off across the room. */
const BULK_BUTTON_ID: Record<MuteMedia, string> = {
	audio: 'mute-all-participants-btn',
	video: 'mute-all-cameras-btn',
	screenShare: 'stop-all-screen-shares-btn'
};

const bulkButton = (page: Page, media: MuteMedia = 'audio'): Locator => page.locator(`#${BULK_BUTTON_ID[media]}`);

/**
 * Clicks a panel-wide "turn off for everyone" button, turning that device off for every
 * non-moderator participant (the caller and any moderator are excluded server-side).
 */
export const muteAllParticipantsMedia = async (page: Page, media: MuteMedia = 'audio'): Promise<void> => {
	await bulkButton(page, media).click({ timeout: 10_000 });
};

/**
 * Asserts that a panel-wide action is offered and has something to act on.
 */
export const expectMuteAllButton = async (page: Page, media: MuteMedia = 'audio'): Promise<void> => {
	await expect(bulkButton(page, media)).toBeEnabled({ timeout: 10_000 });
};

/**
 * Asserts that the panel-wide strip is not offered at all — it is absent without `participantMute`.
 */
export const expectNoMuteAllButton = async (page: Page, media: MuteMedia = 'audio'): Promise<void> => {
	await expect(bulkButton(page, media)).toHaveCount(0, { timeout: 10_000 });
};

/**
 * Asserts that the local participant sees the snackbar `NotificationService` shows when a moderator
 * mute lands — the only notice of it, since the API sends no message the muted device is a target of.
 * The vendored `ActionService` fires its own snackbar (`.snackbarNotification`, see
 * {@link expectSnackbarNotification} in `ui-utils.helper`) under a different panel class, so the two
 * must not be confused.
 */
export const expectMutedByModeratorNotification = async (page: Page): Promise<void> => {
	await expect(page.locator('.custom-snackbar')).toBeVisible({ timeout: 10_000 });
};

// ─── Participants panel: badge assertions ─────────────────────────────────────

const PARTICIPANT_BADGE_CLASS: Record<MeetRoomMemberUIBadge, string> = {
	[MeetRoomMemberUIBadge.OWNER]: 'owner-badge',
	[MeetRoomMemberUIBadge.ADMIN]: 'admin-badge',
	[MeetRoomMemberUIBadge.MODERATOR]: 'moderator-badge',
	[MeetRoomMemberUIBadge.OTHER]: ''
};

/**
 * Asserts that the given participant shows no role badge. A regular participant (badge OTHER)
 * renders no badge element at all — the badge is only rendered for owner/admin/moderator.
 */
export const expectNoParticipantBadge = async (page: Page, participantId: string): Promise<void> => {
	await expect(page.locator(`#participant-badge-${participantId}`)).toHaveCount(0, { timeout: 10_000 });
};

/**
 * Asserts that the given participant shows the role badge for {@link badge} (owner/admin/moderator).
 * For {@link MeetRoomMemberUIBadge.OTHER} it asserts no badge is rendered.
 */
export const expectParticipantBadge = async (
	page: Page,
	participantId: string,
	badge: MeetRoomMemberUIBadge
): Promise<void> => {
	if (badge === MeetRoomMemberUIBadge.OTHER) {
		await expectNoParticipantBadge(page, participantId);
		return;
	}

	const badgeLocator = page.locator(`#participant-badge-${participantId}`);
	await expect(badgeLocator).toBeVisible({ timeout: 10_000 });
	await expect(badgeLocator).toHaveClass(new RegExp(PARTICIPANT_BADGE_CLASS[badge]));
};

// ─── Participants panel: moderation control assertions ────────────────────────

/**
 * Opens the row menu and asserts that {@link selector} is or is not among its items.
 */
const expectMenuItem = async (page: Page, participantId: string, selector: string, present: boolean) => {
	await openParticipantMenu(page, participantId);

	if (present) {
		await expect(page.locator(selector)).toBeVisible({ timeout: 10_000 });
	} else {
		await expect(page.locator(selector)).toHaveCount(0, { timeout: 10_000 });
	}

	await page.locator('.cdk-overlay-backdrop').first().click({ timeout: 10_000 });
	await expectMenuClosed(page);
};

/**
 * Asserts that the row menu offers a moderation section for the given participant.
 */
export const expectModerationControls = async (page: Page, participantId: string): Promise<void> => {
	await expectMenuItem(page, participantId, `#moderation-controls-${participantId}`, true);
};

/**
 * Asserts that the row menu offers no moderation section for the given participant.
 */
export const expectNoModerationControls = async (page: Page, participantId: string): Promise<void> => {
	await expectMenuItem(page, participantId, `#moderation-controls-${participantId}`, false);
};

/**
 * Asserts that the "promote to moderator" item is available for the given participant.
 */
export const expectMakeModeratorButton = async (page: Page, participantId: string): Promise<void> => {
	await expectMenuItem(page, participantId, `#make-moderator-btn-${participantId}`, true);
};

/**
 * Asserts that the "promote to moderator" item is not available for the given participant.
 */
export const expectNoMakeModeratorButton = async (page: Page, participantId: string): Promise<void> => {
	await expectMenuItem(page, participantId, `#make-moderator-btn-${participantId}`, false);
};

/**
 * Asserts that the "downgrade" item is available for the given participant.
 */
export const expectRemoveModeratorButton = async (page: Page, participantId: string): Promise<void> => {
	await expectMenuItem(page, participantId, `#remove-moderator-btn-${participantId}`, true);
};

/**
 * Asserts that the "downgrade" item is not available for the given participant.
 */
export const expectNoRemoveModeratorButton = async (page: Page, participantId: string): Promise<void> => {
	await expectMenuItem(page, participantId, `#remove-moderator-btn-${participantId}`, false);
};

/**
 * Asserts that the "remove from meeting" item is available for the given participant.
 */
export const expectKickButton = async (page: Page, participantId: string): Promise<void> => {
	await expectMenuItem(page, participantId, `#kick-participant-btn-${participantId}`, true);
};

/**
 * Asserts that the "remove from meeting" item is not available for the given participant.
 */
export const expectNoKickButton = async (page: Page, participantId: string): Promise<void> => {
	await expectMenuItem(page, participantId, `#kick-participant-btn-${participantId}`, false);
};
