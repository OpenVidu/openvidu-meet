import { expect, test } from '@playwright/test';
import {
	expectChatLinkCount,
	expectChatLinkHrefContains,
	expectChatMessageCount,
	expectChatMessageTextAt,
	expectFirstMessageSender,
	sendChatMessage,
	toggleChatPanel
} from './helpers/chat.helper';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';
import { disconnectAllBrowserFakeParticipants, joinParticipants } from './helpers/participant-management.helper';
import { expectSnackbarNotification } from './helpers/ui-utils.helper';

test.describe('Chat E2E Tests', () => {
	const createdRoomIds: string[] = [];

	let roomId: string;
	let accessUrl: string;

	test.beforeEach(async () => {
		const { room, accessUrl: url } = await createRoomAndGetAnonymousAccessUrl();
		roomId = room.roomId;
		accessUrl = url;
		createdRoomIds.push(roomId);
	});

	test.afterAll(async () => {
		await Promise.all([disconnectAllBrowserFakeParticipants(), deleteRooms(createdRoomIds)]);
	});

	test('should send messages', async ({ page }) => {
		await openMeeting(page, accessUrl);
		await toggleChatPanel(page);

		let message = 'Test message';
		await sendChatMessage(page, message);
		await expectChatMessageCount(page, 1);
		await expectChatMessageTextAt(page, 0, message);

		message = 'Test message 2';
		await sendChatMessage(page, message);
		await expectChatMessageCount(page, 2);
		await expectChatMessageTextAt(page, 1, message);
	});

	test('should keep unread chat badge hidden at startup when there are no messages', async ({ page }) => {
		await openMeeting(page, accessUrl);

		const unreadBadge = page.locator('#chat-panel-btn .mat-badge-content:visible');
		await expect(unreadBadge).toHaveCount(0);

		await toggleChatPanel(page);
		await expectChatMessageCount(page, 0);
	});

	test('should receive a message', async ({ browser }) => {
		const senderName = `sender`;
		const receiverName = `receiver`;
		const { byName, removeAllParticipants } = await joinParticipants(browser, {
			roomId,
			accessUrl,
			participants: [
				{ name: receiverName, headless: false },
				{ name: senderName, headless: true }
			]
		});
		const senderPage = byName[senderName];
		const receiverPage = byName[receiverName];

		try {
			const message = 'hello from sender';
			await toggleChatPanel(senderPage);
			await sendChatMessage(senderPage, message);

			await toggleChatPanel(receiverPage);
			await expectChatMessageCount(receiverPage, 1);
			await expectChatMessageTextAt(receiverPage, 0, message);
			await expectFirstMessageSender(receiverPage, senderName);
		} finally {
			await removeAllParticipants();
		}
	});

	test('should auto-scroll when receiving new messages with chat panel open', async ({ browser }) => {
		const senderName = `sender`;
		const receiverName = `receiver`;
		const { byName, removeAllParticipants } = await joinParticipants(browser, {
			roomId,
			accessUrl,
			participants: [
				{ name: receiverName, headless: false },
				{ name: senderName, headless: true }
			]
		});
		const senderPage = byName[senderName];
		const receiverPage = byName[receiverName];

		try {
			await Promise.all([toggleChatPanel(receiverPage), toggleChatPanel(senderPage)]);

			for (let i = 0; i < 45; i++) {
				await sendChatMessage(senderPage, `seed-message-${i}`);
			}

			await expectChatMessageCount(receiverPage, 45);

			const scrollState = await receiverPage.evaluate(() => {
				const container = document.querySelector('.messages-container') as HTMLElement | null;

				if (!container) {
					return null;
				}

				container.scrollTop = 0;

				return {
					scrollTop: container.scrollTop,
					scrollHeight: container.scrollHeight,
					clientHeight: container.clientHeight
				};
			});

			expect(scrollState).not.toBeNull();
			expect(scrollState!.scrollHeight).toBeGreaterThan(scrollState!.clientHeight);
			expect(scrollState!.scrollTop).toBe(0);

			await sendChatMessage(senderPage, 'newest-message');

			await expect
				.poll(
					async () => {
						return await receiverPage.evaluate(() => {
							const container = document.querySelector('.messages-container') as HTMLElement | null;

							if (!container) {
								return Number.POSITIVE_INFINITY;
							}

							return Math.abs(container.scrollHeight - container.clientHeight - container.scrollTop);
						});
					},
					{ timeout: 8_000 }
				)
				.toBeLessThanOrEqual(3);
		} finally {
			await removeAllParticipants();
		}
	});

	test('should send an URL message and render it as link', async ({ page }) => {
		await openMeeting(page, accessUrl);
		await toggleChatPanel(page);
		await sendChatMessage(page, 'demos.openvidu.io');
		await expectChatLinkCount(page, 1);
		await expectChatLinkHrefContains(page, 0, 'demos\\.openvidu\\.io');
	});

	test('should show snackbar notification when receiving a message with chat panel closed', async ({ browser }) => {
		const senderName = `sender`;
		const receiverName = `receiver`;
		const { byName, removeAllParticipants } = await joinParticipants(browser, {
			roomId,
			accessUrl,
			participants: [
				{ name: receiverName, headless: false },
				{ name: senderName, headless: true }
			]
		});

		const senderPage = byName[senderName];
		const receiverPage = byName[receiverName];

		try {
			const message = 'message while chat is closed';
			await toggleChatPanel(senderPage);
			await sendChatMessage(senderPage, message);

			await expectSnackbarNotification(receiverPage);

			await toggleChatPanel(receiverPage);
			await expectChatMessageCount(receiverPage, 1);
			await expectChatMessageTextAt(receiverPage, 0, message);
		} finally {
			await removeAllParticipants();
		}
	});

	test('should preserve message order when sending multiple messages quickly', async ({ page }) => {
		await openMeeting(page, accessUrl);
		await toggleChatPanel(page);

		await sendChatMessage(page, 'message-1');
		await sendChatMessage(page, 'message-2');
		await sendChatMessage(page, 'message-3');

		await expectChatMessageCount(page, 3);
		await expectChatMessageTextAt(page, 0, 'message-1');
		await expectChatMessageTextAt(page, 1, 'message-2');
		await expectChatMessageTextAt(page, 2, 'message-3');
	});
});
