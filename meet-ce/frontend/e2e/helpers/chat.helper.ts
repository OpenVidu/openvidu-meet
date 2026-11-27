import { expect, type Page } from '@playwright/test';
import { getChatHistory } from './meet-api.helper';

const CHAT_NOTIFICATION = '.ov-notification[data-kind="chat-message"]';

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
/**
 * Asserts that the participant is told a message arrived while they had the chat closed. Read off
 * `data-kind` rather than the text, which is human copy in the active language.
 */
export const expectChatMessageNotification = async (page: Page): Promise<void> => {
	await expect(page.locator(CHAT_NOTIFICATION)).toBeVisible({ timeout: 10_000 });
};

export const expectNoChatMessageNotification = async (page: Page): Promise<void> => {
	await expect(page.locator(CHAT_NOTIFICATION)).toHaveCount(0);
};

/** Opens the chat from the notification's own action, the way a participant does. */
export const openChatFromNotification = async (page: Page): Promise<void> => {
	await page.locator(`${CHAT_NOTIFICATION} .notification-action`).click();
};

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

/**
 * Records, from before the page loads, the text of every data channel message the page receives, as a
 * client that bypasses the meeting interface would read it.
 */
export const recordDataChannelMessages = async (page: Page): Promise<void> => {
	await page.addInitScript(() => {
		const received: string[] = [];
		(window as unknown as { __dataChannelText: string[] }).__dataChannelText = received;

		const record = (channel: RTCDataChannel) =>
			channel.addEventListener('message', ({ data }: MessageEvent) => {
				if (data instanceof Blob) {
					void data.text().then((text) => received.push(text));
				} else {
					received.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
				}
			});

		const NativePeerConnection = window.RTCPeerConnection;
		window.RTCPeerConnection = class extends NativePeerConnection {
			constructor(configuration?: RTCConfiguration) {
				super(configuration);
				this.addEventListener('datachannel', ({ channel }) => record(channel));
			}

			override createDataChannel(label: string, options?: RTCDataChannelInit): RTCDataChannel {
				const channel = super.createDataChannel(label, options);
				record(channel);
				return channel;
			}
		};
	});
};

/**
 * How many data channel messages {@link recordDataChannelMessages} recorded, for rooms where they are encrypted.
 */
export const receivedDataChannelMessageCount = (page: Page): Promise<number> =>
	page.evaluate(() => (window as unknown as { __dataChannelText: string[] }).__dataChannelText.length);

/**
 * The data channel messages {@link recordDataChannelMessages} recorded, joined.
 */
export const receivedDataChannelText = (page: Page): Promise<string> =>
	page.evaluate(() => (window as unknown as { __dataChannelText: string[] }).__dataChannelText.join('\n'));

/**
 * Asserts the chat shows exactly these messages, in this order.
 */
export const expectChatMessageTexts = async (page: Page, texts: string[]): Promise<void> => {
	await expect(page.locator('.chat-message p')).toHaveText(texts);
};

/**
 * Asserts the message at {@link index} is labelled as the participant's own.
 */
export const expectOwnChatMessageAt = async (page: Page, index: number): Promise<void> => {
	const message = page.locator('.message').nth(index);
	await expect(message).toHaveClass(/right/);
	await expect(message.locator('.participant-name-container p')).toHaveText(/^\s*You\s*$/i);
};

/**
 * Asserts the message at {@link index} is another participant's, labelled with their name and, for an
 * anonymous participant, with the anonymous label.
 */
export const expectChatMessageFromAt = async (
	page: Page,
	index: number,
	senderName: string,
	anonymous: boolean
): Promise<void> => {
	const message = page.locator('.message').nth(index);
	await expect(message).toHaveClass(/left/);
	await expect(message.locator('.participant-name-container p')).toContainText(senderName);
	await expect(message.locator('.anonymous-label')).toHaveCount(anonymous ? 1 : 0);
};

/**
 * The unread count of the chat button, which is absent while nothing is unread.
 */
export const expectNoUnreadChatMessages = async (page: Page): Promise<void> => {
	await expect(page.locator('#chat-panel-btn .mat-badge-content:visible')).toHaveCount(0);
};

/**
 * Resolves once the page has asked the server for the chat history and been answered, which is what
 * makes "the chat shows nothing earlier" a statement about the history and not about a load still going.
 */
export const waitForChatHistoryResponse = (page: Page) =>
	page.waitForResponse((response) => /\/chat\/messages\?/.test(response.url()), { timeout: 20_000 });

/**
 * Follows the room member token the page's meeting uses, read from the requests it makes with it. Must be
 * installed before the page joins. The returned function resolves once the page has made one.
 */
export const trackRoomMemberToken = (page: Page): (() => Promise<string>) => {
	let token: string | undefined;

	page.on('request', (request) => {
		const header = request.headers()['x-room-member-token'];

		if (header) token = header.replace(/^Bearer\s+/i, '');
	});

	return async () => {
		await expect.poll(() => token, { timeout: 20_000 }).toBeDefined();
		return token!;
	};
};

/**
 * Waits until the server has stored exactly these messages in the room's current meeting, in this order, as
 * a participant in it reads them. A participant who joins afterwards then sees them whatever the timing.
 */
export const waitForChatStored = async (
	roomId: string,
	roomMemberToken: () => Promise<string>,
	texts: string[]
): Promise<void> => {
	const token = await roomMemberToken();

	await expect
		.poll(
			async () => {
				try {
					return (await getChatHistory(roomId, token)).map(({ text }) => text).reverse();
				} catch {
					return [];
				}
			},
			{ timeout: 45_000 }
		)
		.toEqual(texts);
};

/**
 * Records, from before the page loads, what would tell the participant a message arrived: a chat notice shown,
 * the chat sound played, an unread count shown on the chat button.
 */
export const recordChatAlerts = async (page: Page): Promise<void> => {
	await page.addInitScript(() => {
		const alerts = { notices: 0, sounds: 0, unread: 0 };
		(window as unknown as { __chatAlerts: typeof alerts }).__chatAlerts = alerts;

		const play = HTMLMediaElement.prototype.play;

		HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
			if (this.src.includes('chat-message')) alerts.sounds++;

			return play.call(this);
		};

		const seen = new WeakSet<Element>();
		new MutationObserver(() => {
			document.querySelectorAll('.ov-notification[data-kind="chat-message"]').forEach((notice) => {
				if (!seen.has(notice)) {
					seen.add(notice);
					alerts.notices++;
				}
			});

			const badge = document.querySelector('#chat-panel-btn .mat-badge-content');

			if (badge?.textContent?.trim() && badge.getBoundingClientRect().width > 0) alerts.unread++;
		}).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
	});
};

/**
 * What {@link recordChatAlerts} recorded.
 */
export const chatAlerts = (page: Page): Promise<{ notices: number; sounds: number; unread: number }> =>
	page.evaluate(
		() => (window as unknown as { __chatAlerts: { notices: number; sounds: number; unread: number } }).__chatAlerts
	);
