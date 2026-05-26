import { MeetWebhookEventType, WebComponentEvent } from '@openvidu-meet/typings';
import { expect, Locator, Page } from '@playwright/test';
import { MEET_TESTAPP_URL } from '../config';
import { iframeLocator } from './iframe.helper';

// ─── Testapp-specific navigation ────────────────────────────────────────────
//
// The webcomponent E2E tests use a testapp that renders the <openvidu-meet>
// web component. All room entry goes through the testapp UI (room list →
// role dropdown → lobby → prejoin → meeting).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Navigates to the testapp page and prepares the UI for joining a specific room.
 *
 * @param page - Playwright page.
 * @param roomId - Room to select in the testapp room list.
 */
const prepareForJoiningRoom = async (page: Page, roomId: string): Promise<void> => {
	await page.goto(MEET_TESTAPP_URL);
	await expect(page.locator('.rooms-container')).toBeVisible();

	const room = page.locator(`#${roomId}`);
	await expect(room).toBeVisible();
	await room.locator('.dropdown-button').click();
	await expect(room.locator('#join-as-moderator')).toBeVisible();
	await expect(room.locator('#join-as-speaker')).toBeVisible();
};

/**
 * Joins a room through the testapp, completing the lobby and prejoin screens,
 * then waits for the meeting to be fully loaded inside the iframe.
 *
 * @param page - Playwright page.
 * @param roomId - Room ID to join.
 * @param options.role - Join as `'moderator'` or `'speaker'`. Defaults to `'speaker'`.
 * @param options.name - Participant display name (auto-generated when omitted).
 */
export const openMeeting = async (
	page: Page,
	roomId: string,
	options?: {
		role?: 'moderator' | 'speaker';
		name?: string;
	}
): Promise<void> => {
	const { role = 'speaker', name } = options ?? {};
	const participantName = name ?? `pw-${Math.random().toString(36).substring(2, 9)}`;

	await prepareForJoiningRoom(page, roomId);

	await page.locator(`#${roomId}`).locator(`#join-as-${role}`).click();
	await expect(page.locator('openvidu-meet')).toBeVisible();

	const nameInput = iframeLocator(page, '#participant-name-input');
	await expect(nameInput).toBeVisible();
	await nameInput.fill(participantName);
	await iframeLocator(page, '#participant-name-submit').click();

	await expect(iframeLocator(page, 'ov-pre-join')).toBeVisible();
	await iframeLocator(page, '#join-button').click();
	await expect(iframeLocator(page, 'ov-session')).toBeVisible();
};

/**
 * Leaves the current meeting via the iframe leave button.
 *
 * For moderators a secondary leave-option menu is shown; this helper handles
 * that automatically.
 *
 * @param page - Playwright page.
 * @param options.role - Current participant role. Defaults to `'speaker'`.
 */
export const leaveMeeting = async (
	page: Page,
	options?: {
		role?: 'moderator' | 'speaker';
	}
): Promise<void> => {
	const { role = 'speaker' } = options ?? {};

	await iframeLocator(page, '#leave-btn').click();

	if (role === 'moderator') {
		await iframeLocator(page, '#leave-option').click();
	}

	await expect(eventLocator(page, WebComponentEvent.LEFT)).toBeVisible({ timeout: 10_000 });
};

// ─── Testapp commands ───────────────────────────────────────────────────────

/**
 * Leaves the room via the testapp "leave room" command button (outside the iframe).
 */
export const leaveRoomCommand = async (page: Page): Promise<void> => {
	await page.locator('#leave-room-btn').click();
};

/**
 * Ends the meeting via the testapp "end meeting" command button (outside the iframe).
 */
export const endMeetingCommand = async (page: Page): Promise<void> => {
	await page.locator('#end-meeting-btn').click();
};

/**
 * Kicks a participant via the testapp "kick participant" command (outside the iframe).
 *
 * Fills the participant identity input and clicks the kick button.
 *
 * @param page - Playwright page.
 * @param participantIdentity - Identity of the participant to kick.
 */
export const kickParticipantCommand = async (page: Page, participantIdentity: string): Promise<void> => {
	await page.locator('#participant-identity-input').fill(participantIdentity);
	await page.locator('#kick-participant-btn').click();
};

// ─── Event & webhook DOM markers ────────────────────────────────────────────
//
// The testapp renders `.event-*` and `.webhook-*` elements when the
// webcomponent emits events or receives webhook callbacks.
// ─────────────────────────────────────────────────────────────────────────────

/** Locator for a testapp `.event-{name}` DOM marker. */
export const eventLocator = (page: Page, eventName: WebComponentEvent): Locator => page.locator(`.event-${eventName}`);

/** Locator for a testapp `.webhook-{name}` DOM marker. */
export const webhookLocator = (page: Page, webhookName: MeetWebhookEventType): Locator =>
	page.locator(`.webhook-${webhookName}`);

/**
 * Asserts that exactly `count` `.event-{name}` markers exist, then returns the locator.
 */
export const expectEvent = async (
	page: Page,
	eventName: WebComponentEvent,
	options: { count?: number; timeout?: number } = {}
): Promise<Locator> => {
	const { count = 1, timeout = 10_000 } = options;
	const locator = eventLocator(page, eventName);
	await expect(locator).toHaveCount(count, { timeout });
	return locator;
};

/**
 * Asserts that exactly `count` `.webhook-{name}` markers exist, then returns the locator.
 */
export const expectWebhook = async (
	page: Page,
	webhookName: MeetWebhookEventType,
	options: { count?: number; timeout?: number } = {}
): Promise<Locator> => {
	const { count = 1, timeout = 10_000 } = options;
	const locator = webhookLocator(page, webhookName);
	await expect(locator).toHaveCount(count, { timeout });
	return locator;
};
