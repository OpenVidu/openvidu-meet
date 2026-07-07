import { expect, type Page } from '@playwright/test';
import { click, expectHidden } from './ui-utils.helper';

// ─── More-options menu ──────────────────────────────────────────────────────

/**
 * Opens the "more options" toolbar menu and waits for its content to appear.
 */
export const openMoreOptionsMenu = async (page: Page): Promise<void> => {
	const moreOptionsButton = page.locator('#more-options-btn');
	await expect(moreOptionsButton).toBeVisible();
	await click(moreOptionsButton, 10_000);
	await expect(page.locator('.mat-mdc-menu-content')).toBeVisible();
};

// ─── Chat panel ─────────────────────────────────────────────────────────────

/**
 * Ensures the chat panel is open or closed, clicking the appropriate control
 * only when the panel is not already in the desired state.
 */
export const toggleChatPanel = async (page: Page, action: 'open' | 'close' = 'open'): Promise<void> => {
	const chatInput = page.locator('#chat-input');

	if (action === 'open') {
		if (!(await chatInput.isVisible())) {
			await page.locator('#chat-panel-btn').click();
		}

		await expect(page.locator('#chat-container')).toBeVisible({ timeout: 10_000 });
		await expect(chatInput).toBeVisible({ timeout: 10_000 });
		return;
	}

	if (await chatInput.isVisible()) {
		const closeButton = page.locator('#chat-container .panel-close-button');
		const buttonToClick = (await closeButton.isVisible()) ? closeButton : page.locator('#chat-panel-btn');
		await buttonToClick.click();
	}

	await expect(page.locator('#chat-container')).toHaveCount(0, { timeout: 10_000 });
	await expect(chatInput).toHaveCount(0, { timeout: 10_000 });
};

/**
 * Fills the chat input and clicks the send button.
 */
export const sendChatMessage = async (page: Page, message: string): Promise<void> => {
	await page.locator('#chat-input').fill(message);
	await page.locator('#send-btn').click();
};

/**
 * Asserts that the chat contains exactly {@link count} messages.
 */
export const expectChatMessageCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('.message')).toHaveCount(count);
};

/**
 * Asserts that the first chat message was sent by {@link senderName}.
 */
export const expectFirstMessageSender = async (page: Page, senderName: string): Promise<void> => {
	await expect(page.locator('.participant-name-container > p').first()).toContainText(senderName);
};

/**
 * Asserts the number of clickable links inside chat messages.
 */
export const expectChatLinkCount = async (page: Page, count: number): Promise<void> => {
	await expect(page.locator('.chat-message a')).toHaveCount(count);
};

/**
 * Asserts that the chat message at {@link index} contains {@link text}.
 */
export const expectChatMessageTextAt = async (page: Page, index: number, text: string): Promise<void> => {
	await expect(page.locator('.chat-message').nth(index)).toContainText(text);
};

/**
 * Asserts that the link inside the chat message at {@link index} has an `href`
 * attribute matching the given substring.
 */
export const expectChatLinkHrefContains = async (
	page: Page,
	index: number,
	expectedHrefPart: string
): Promise<void> => {
	await expect(page.locator('.chat-message a').nth(index)).toHaveAttribute('href', new RegExp(expectedHrefPart));
};

/**
 * Asserts that the chat panel toolbar button is available (`canReadChat` granted).
 */
export const expectChatAvailable = async (page: Page): Promise<void> => {
	await expect(page.locator('#chat-panel-btn')).toBeVisible({ timeout: 10_000 });
};

/**
 * Asserts that the chat panel toolbar button is absent (`canReadChat` denied).
 */
export const expectNoChat = async (page: Page): Promise<void> => {
	await expect(page.locator('#chat-panel-btn')).toHaveCount(0);
};

// ─── Participants panel ─────────────────────────────────────────────────────

/**
 * Toggles the participants side-panel open/closed.
 */
export const toggleParticipantsPanel = async (page: Page): Promise<void> => {
	await page.locator('#participants-panel-btn').click();
};

// ─── Activities panel ───────────────────────────────────────────────────────

/**
 * Toggles the activities side-panel open/closed.
 */
export const toggleActivitiesPanel = async (page: Page): Promise<void> => {
	await page.locator('#activities-panel-btn').click();
};

// ─── Settings panel ─────────────────────────────────────────────────────────

/**
 * Opens the settings panel from the more-options menu and waits for the
 * sidenav to be visible.
 */
export const openSettingsPanel = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await page.locator('#toolbar-settings-btn').click();
	await expect(page.locator('.sidenav-menu')).toBeVisible();
};

/**
 * Opens the grid-layout settings panel from the more-options menu.
 */
export const openLayoutSettingsPanel = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	const gridLayoutSettingsButton = page.locator('#grid-layout-settings-btn');
	await expect(gridLayoutSettingsButton).toBeVisible();
	await click(gridLayoutSettingsButton, 5_000);
	await expect(page.locator('#settings-container')).toBeVisible();
};

/**
 * Closes the currently-open settings panel.
 */
export const closeSettingsPanel = async (page: Page): Promise<void> => {
	await page.locator('.panel-close-button').click();
	await expectHidden(page, '#settings-container');
};
