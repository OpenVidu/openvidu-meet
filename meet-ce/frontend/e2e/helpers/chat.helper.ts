import { expect, type Page } from '@playwright/test';

/**
 * Ensures the chat panel is open or closed, clicking the appropriate control only when the panel is
 * not already in the desired state. Keyed off the panel container rather than the message input, since
 * the input is absent when the participant lacks `canWriteChat` (read-only mode).
 */
export const toggleChatPanel = async (page: Page, action: 'open' | 'close' = 'open'): Promise<void> => {
	const chatContainer = page.locator('#chat-container');

	if (action === 'open') {
		if (!(await chatContainer.isVisible())) {
			await page.locator('#chat-panel-btn').click();
		}

		await expect(chatContainer).toBeVisible({ timeout: 10_000 });
		return;
	}

	if (await chatContainer.isVisible()) {
		const closeButton = page.locator('#chat-container .panel-close-button');
		const buttonToClick = (await closeButton.isVisible()) ? closeButton : page.locator('#chat-panel-btn');
		await buttonToClick.click();
	}

	await expect(chatContainer).toHaveCount(0, { timeout: 10_000 });
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

/**
 * Asserts the chat panel is editable: the message input and send button are present and enabled
 * (`canWriteChat` granted). Assumes the panel is already open.
 */
export const expectChatWriteEnabled = async (page: Page): Promise<void> => {
	await expect(page.locator('#chat-input')).toBeEnabled({ timeout: 10_000 });
	await expect(page.locator('#send-btn')).toBeEnabled();
};

/**
 * Asserts the chat panel is read-only: the message input and send button are absent — removed from the
 * DOM, not merely disabled — and the read-only notice is shown (`canWriteChat` denied). Removal is not
 * the security boundary (the server denies the LiveKit data-publish grant); it is the honest UI for it.
 * Assumes the panel is already open.
 */
export const expectChatWriteDisabled = async (page: Page): Promise<void> => {
	await expect(page.locator('#chat-read-only-notice')).toBeVisible({ timeout: 10_000 });
	await expect(page.locator('#chat-input')).toHaveCount(0);
	await expect(page.locator('#send-btn')).toHaveCount(0);
};
