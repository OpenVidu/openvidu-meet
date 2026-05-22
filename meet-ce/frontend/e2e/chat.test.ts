import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { createRoomAndGetAnonymousAccessUrl, createRoomMember, deleteRooms } from './helpers/meet-api.helper';
import {
	expectChatLinkCount,
	expectChatLinkHrefContains,
	expectChatMessageCount,
	expectChatMessageTextAt,
	expectFirstMessageSender,
	expectSnackbarNotification,
	joinParticipants,
	openMeeting,
	sendChatMessage,
	toggleChatPanel,
	waitForRemoteStream
} from './helpers/meeting-ui.helper';

test.describe('Chat E2E Tests', () => {
	let roomId: string;
	let accessUrl: string;

	test.beforeAll(async () => {
		const { room, accessUrl: url } = await createRoomAndGetAnonymousAccessUrl();
		roomId = room.roomId;
		accessUrl = url;
	});

	test.afterAll(async () => {
		await deleteRooms([roomId]);
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
		const [receiverMember, senderMember] = await Promise.all([
			createRoomMember(roomId, { name: receiverName, baseRole: MeetRoomMemberRole.MODERATOR }),
			createRoomMember(roomId, { name: senderName, baseRole: MeetRoomMemberRole.MODERATOR })
		]);
		const receiverAccessUrl = receiverMember.accessUrl;
		const senderAccessUrl = senderMember.accessUrl;

		const [receiverPage, senderPage] = await Promise.all([browser.newPage(), browser.newPage()]);

		try {
			await Promise.all([openMeeting(receiverPage, receiverAccessUrl), openMeeting(senderPage, senderAccessUrl)]);
			await Promise.all([waitForRemoteStream(receiverPage), waitForRemoteStream(senderPage)]);

			const message = 'hello from sender';
			await toggleChatPanel(senderPage);
			await sendChatMessage(senderPage, message);

			await toggleChatPanel(receiverPage);
			await expectChatMessageCount(receiverPage, 1);
			await expectChatMessageTextAt(receiverPage, 0, message);
			await expectFirstMessageSender(receiverPage, senderName);
		} finally {
			await Promise.all([senderPage.close(), receiverPage.close()]);
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
		const { pageA, pages, byName } = await joinParticipants(browser, {
			roomId,
			participants: [
				{ name: 'receiver', headless: false },
				{ name: 'sender', headless: true }
			]
		});

		try {
			const message = 'message while chat is closed';
			await toggleChatPanel(byName['sender']);
			await sendChatMessage(byName['sender'], message);

			await expectSnackbarNotification(pageA);

			await toggleChatPanel(pageA);
			await expectChatMessageCount(pageA, 1);
			await expectChatMessageTextAt(pageA, 0, message);
		} finally {
			await Promise.all(pages.map((page) => page.close()));
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
