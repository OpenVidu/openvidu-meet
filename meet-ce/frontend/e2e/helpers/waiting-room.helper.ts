import { expect, type Browser, type Locator, type Page, type WebSocketRoute } from '@playwright/test';
import { openJoinScreen } from './meeting-navigation.helper';
import { toggleParticipantsPanel } from './panels.helper';
import { click } from './ui-utils.helper';

const WAITING_SCREEN = '#waiting-screen';
const WAITING_ROOM_SECTION = '#waiting-room-panel-section';
const WAITING_ROOM_KNOCK_NOTIFICATION = '.ov-notification[data-kind="waiting-room-knock"]';
const MEETING_FULL_TEXT = 'This meeting has reached its maximum number of participants';

// ─── The participant who waits ────────────────────────────────────────────────

/**
 * Opens the access URL, types the name and presses "Ask to join". Stops there: the caller asserts what
 * follows (the waiting screen, an outcome, the meeting).
 */
export const askToJoin = async (page: Page, accessUrl: string, name?: string): Promise<void> => {
	await openJoinScreen(page, accessUrl);
	const nameInput = page.locator('#participant-name-input');

	if (name && (await nameInput.isEditable())) {
		await nameInput.fill(name);
	}

	const submit = page.locator('#participant-name-submit');
	await expect(submit).toHaveText(/Ask to join/);
	await click(submit, 10_000);
};

/** A page of its own browser context, as each person waiting has. */
export const newWaiterPage = async (browser: Browser): Promise<Page> => (await browser.newContext()).newPage();

export const expectWaitingScreen = async (page: Page, timeoutMs = 15_000): Promise<void> => {
	await expect(page.locator(WAITING_SCREEN)).toBeVisible({ timeout: timeoutMs });
};

/** Waits for the waiting screen to say the place in line, from the server's state. */
export const expectQueuePosition = async (page: Page, ordinal: string, timeoutMs = 15_000): Promise<void> => {
	await expect(page.locator('#waiting-screen-title')).toHaveText(`You're ${ordinal} in line`, {
		timeout: timeoutMs
	});
};

export const leaveWaitingRoom = async (page: Page): Promise<void> => {
	await click(page.locator('#waiting-room-leave-button'), 10_000);
};

/** The screen that tells how a wait ended without the participant being let in. */
export const waitingOutcome = (page: Page, outcome: 'rejected' | 'left' | 'expired' | 'meeting_ended' | 'full') =>
	page.locator(`#waiting-outcome-${outcome}`);

export const askToJoinAgain = (page: Page): Locator => page.locator('#waiting-outcome-ask-again-button');

/** Whether the participant reached the meeting, or LiveKit found it full. */
export const expectInMeeting = async (page: Page, timeoutMs = 20_000): Promise<void> => {
	await expect(page.locator('#layout-container')).toBeVisible({ timeout: timeoutMs });
};

export const meetingFullMessage = (page: Page): Locator => page.getByText(MEETING_FULL_TEXT).first();

export type RealtimeChannel = {
	/** Drops the page's realtime connection and refuses every reconnection, while HTTP keeps working. */
	cut: () => Promise<void>;
};

/**
 * Proxies the page's realtime connection to Meet so the test can take it down. Must be installed
 * before the page asks to join.
 */
export const routeRealtimeChannel = async (page: Page): Promise<RealtimeChannel> => {
	let down = false;
	const open: WebSocketRoute[] = [];

	await page.routeWebSocket(/\/internal-api\/v1\/ws\?/, async (client) => {
		if (down) return client.close({ code: 1011 });

		const server = client.connectToServer();
		open.push(client);
		client.onClose(() => server.close());
	});

	return {
		cut: async () => {
			down = true;
			await Promise.all(open.splice(0).map((client) => client.close({ code: 1011 })));
		}
	};
};

/**
 * Keeps the page's LiveKit signalling from ever reaching the server, as a participant whose connection
 * never gets through. Must be installed before the participant is let in.
 */
export const holdBackLiveKitConnection = async (page: Page): Promise<void> => {
	await page.routeWebSocket(/\/rtc(\/v1)?\?/, () => {});
	await page.route(/\/rtc(\/v1)?\/validate/, (route) => route.abort());
};

// ─── Whoever lets participants in ─────────────────────────────────────────────

export const waitingRoomSection = (page: Page): Locator => page.locator(WAITING_ROOM_SECTION);

/** The row of a waiting participant in the moderator's panel, by the name they typed. */
export const waitingRoomRow = (page: Page, name: string): Locator =>
	page.locator(`${WAITING_ROOM_SECTION} .waiting-room-row`).filter({ hasText: name });

export const waitingRoomNotification = (page: Page): Locator => page.locator(WAITING_ROOM_KNOCK_NOTIFICATION);

export const openParticipantsPanel = async (page: Page): Promise<void> => {
	if (!(await page.locator('ov-participants-panel').isVisible())) {
		await toggleParticipantsPanel(page);
	}

	await expect(page.locator('ov-participants-panel')).toBeVisible({ timeout: 10_000 });
};

export const closeParticipantsPanel = async (page: Page): Promise<void> => {
	if (await page.locator('ov-participants-panel').isVisible()) {
		await toggleParticipantsPanel(page);
	}

	await expect(page.locator('ov-participants-panel')).toBeHidden({ timeout: 10_000 });
};

export const admitFromPanel = async (page: Page, name: string): Promise<void> => {
	await click(waitingRoomRow(page, name).locator('.waiting-room-admit-btn'), 10_000);
};

export const denyFromPanel = async (page: Page, name: string): Promise<void> => {
	await click(waitingRoomRow(page, name).locator('.waiting-room-deny-btn'), 10_000);
};
