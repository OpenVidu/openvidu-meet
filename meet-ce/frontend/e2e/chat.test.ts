import { expect, test } from '@playwright/test';
import { createRoom, createRoomAndGetAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import {
    expectChatLinkCount,
    expectChatLinkHrefContains,
    expectChatMessageCount,
    expectChatMessageTextAt,
    expectFirstMessageSender,
    expectSnackbarNotification,
    openMeeting,
    sendChatMessage,
    toggleChatPanel
} from './helpers/meeting-ui.helper';

test.describe('Chat features', () => {
    const createdRoomIds = new Set<string>();

    test.afterAll(async () => {
        await deleteRooms(createdRoomIds);
    });

    test('should send messages', async ({ page }) => {
        const senderName = `sender-${Date.now()}`;
        const { accessUrl } = await createRoomAndGetAccessUrl(senderName, undefined, undefined, createdRoomIds);

        await openMeeting(page, accessUrl);
        await toggleChatPanel(page);

        await sendChatMessage(page, 'Test message');
        await expectChatMessageCount(page, 1);
        await expectChatMessageTextAt(page, 0, 'Test message');

        await sendChatMessage(page, 'Test message 2');
        await expectChatMessageCount(page, 2);
        await expectChatMessageTextAt(page, 1, 'Test message 2');
    });

    test('should keep unread chat badge hidden at startup when there are no messages', async ({ page }) => {
        const participantName = `participant-${Date.now()}`;
        const { accessUrl } = await createRoomAndGetAccessUrl(participantName, undefined, undefined, createdRoomIds);

        await openMeeting(page, accessUrl);

        const unreadBadge = page.locator('#chat-panel-btn .mat-badge-content:visible');
        await expect(unreadBadge).toHaveCount(0);

        await toggleChatPanel(page);
        await expectChatMessageCount(page, 0);
    });

    test('should receive a message', async ({ browser }) => {
        const room = await createRoom({ roomName: `chat-pw-receive-${Date.now()}` });
        createdRoomIds.add(room.roomId);
        const senderName = `sender-${Date.now()}`;
        const receiverName = `receiver-${Date.now()}`;

        const { accessUrl: receiverAccessUrl } = await createRoomAndGetAccessUrl(receiverName, room, undefined, createdRoomIds);
        const { accessUrl: senderAccessUrl } = await createRoomAndGetAccessUrl(senderName, room, undefined, createdRoomIds);

        const receiverPage = await browser.newPage();
        await openMeeting(receiverPage, receiverAccessUrl);

        const senderPage = await browser.newPage();
        await openMeeting(senderPage, senderAccessUrl);

        await toggleChatPanel(senderPage);
        await sendChatMessage(senderPage, 'hello from sender');

        await toggleChatPanel(receiverPage);
        await expectChatMessageCount(receiverPage, 1);
        await expectChatMessageTextAt(receiverPage, 0, 'hello from sender');
        await expectFirstMessageSender(receiverPage, senderName);

        await senderPage.close();
        await receiverPage.close();
    });

    test('should send an URL message and render it as link', async ({ page }) => {
        const senderName = `sender-${Date.now()}`;
        const { accessUrl } = await createRoomAndGetAccessUrl(senderName, undefined, undefined, createdRoomIds);

        await openMeeting(page, accessUrl);
        await toggleChatPanel(page);
        await sendChatMessage(page, 'demos.openvidu.io');
        await expectChatLinkCount(page, 1);
        await expectChatLinkHrefContains(page, 0, 'demos\\.openvidu\\.io');
    });

    test('should show snackbar notification when receiving a message with chat panel closed', async ({ browser }) => {
        const room = await createRoom({ roomName: `chat-pw-snackbar-${Date.now()}` });
        createdRoomIds.add(room.roomId);
        const senderName = `sender-${Date.now()}`;
        const receiverName = `receiver-${Date.now()}`;

        const { accessUrl: receiverAccessUrl } = await createRoomAndGetAccessUrl(receiverName, room, undefined, createdRoomIds);
        const { accessUrl: senderAccessUrl } = await createRoomAndGetAccessUrl(senderName, room, undefined, createdRoomIds);

        const receiverPage = await browser.newPage();
        await openMeeting(receiverPage, receiverAccessUrl);

        const senderPage = await browser.newPage();
        await openMeeting(senderPage, senderAccessUrl);

        await toggleChatPanel(senderPage);
        await sendChatMessage(senderPage, 'message while chat is closed');

        await expectSnackbarNotification(receiverPage);

        await toggleChatPanel(receiverPage);
        await expectChatMessageCount(receiverPage, 1);
        await expectChatMessageTextAt(receiverPage, 0, 'message while chat is closed');

        await senderPage.close();
        await receiverPage.close();
    });

    test('should preserve message order when sending multiple messages quickly', async ({ page }) => {
        const senderName = `sender-${Date.now()}`;
        const { accessUrl } = await createRoomAndGetAccessUrl(senderName, undefined, undefined, createdRoomIds);

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
