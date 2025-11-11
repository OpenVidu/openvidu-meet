import { test } from '@playwright/test';
import { MeetRecordingAccess } from '../../../../typings/src/room-config';
import { MEET_TESTAPP_URL } from '../config';
import {
	accessRoomAs,
	createTestRoom,
	deleteAllRecordings,
	deleteAllRooms,
	joinRoomAs,
	leaveRoom,
	prepareForJoiningRoom,
	startStopRecording,
	updateRoomConfig,
	viewRecordingsAs,
	waitForElementInIframe
} from '../helpers/function-helpers';

let subscribedToAppErrors = false;
let recordingCreated = false;

test.describe('Recording Access Tests', () => {
	let roomId: string;
	let participantName: string;

	test.beforeAll(async () => {
		// Create a test room before all tests
		roomId = await createTestRoom('test-room');
	});

	test.beforeEach(async ({ browser, page }) => {
		if (!subscribedToAppErrors) {
			page.on('console', (msg) => {
				const type = msg.type();
				const tag = type === 'error' ? 'ERROR' : type === 'warning' ? 'WARNING' : 'LOG';
				console.log('[' + tag + ']', msg.text());
			});
			subscribedToAppErrors = true;
		}

		participantName = `P-${Math.random().toString(36).substring(2, 9)}`;

		if (!recordingCreated) {
			const tempContext = await browser.newContext();
			const tempPage = await tempContext.newPage();
			await prepareForJoiningRoom(tempPage, MEET_TESTAPP_URL, roomId);
			await joinRoomAs('moderator', participantName, tempPage);

			await startStopRecording(tempPage, 'start');
			await tempPage.waitForTimeout(1000);
			await startStopRecording(tempPage, 'stop');
			recordingCreated = true;

			await leaveRoom(tempPage, 'moderator', true);
			await tempContext.close();
			await tempPage.close();
		}
	});

	test.afterAll(async ({ browser }) => {
		const tempContext = await browser.newContext();
		const tempPage = await tempContext.newPage();
		await deleteAllRecordings(tempPage);
		await deleteAllRooms(tempPage);
		await Promise.all([tempContext.close(), tempPage.close()]);
	});

	test('should moderator not be able to access recording when access level is set to admin', async ({ page }) => {
		await updateRoomConfig(roomId, {
			chat: { enabled: true },
			recording: {
				enabled: true,
				allowAccessTo: MeetRecordingAccess.ADMIN
			},
			virtualBackground: { enabled: true }
		});

		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
		await accessRoomAs('moderator', page);

		await waitForElementInIframe(page, '#view-recordings-btn', { state: 'hidden' });
	});

	test('should speaker not be able to access recording when access level is set to admin', async ({ page }) => {
		await updateRoomConfig(roomId, {
			chat: { enabled: true },
			recording: {
				enabled: true,
				allowAccessTo: MeetRecordingAccess.ADMIN
			},
			virtualBackground: { enabled: true }
		});

		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
		await accessRoomAs('speaker', page);

		await waitForElementInIframe(page, '#view-recordings-btn', { state: 'hidden' });
	});

	test('should allow moderator to access recording when access level is set to moderator', async ({ page }) => {
		await updateRoomConfig(roomId, {
			chat: { enabled: true },
			recording: {
				enabled: true,
				allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR
			},
			virtualBackground: { enabled: true }
		});

		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
		await viewRecordingsAs('moderator', page);

		await waitForElementInIframe(page, 'ov-room-recordings', { state: 'visible' });
	});

	test('should speaker not be able to access recording when access level is set to moderator', async ({ page }) => {
		await updateRoomConfig(roomId, {
			chat: { enabled: true },
			recording: {
				enabled: true,
				allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR
			},
			virtualBackground: { enabled: true }
		});

		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
		await accessRoomAs('speaker', page);

		await waitForElementInIframe(page, '#view-recordings-btn', { state: 'hidden' });
	});

	test('should allow moderator to access recording when access level is set to speaker', async ({ page }) => {
		await updateRoomConfig(roomId, {
			chat: { enabled: true },
			recording: {
				enabled: true,
				allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR
			},
			virtualBackground: { enabled: true }
		});

		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
		await viewRecordingsAs('moderator', page);

		await waitForElementInIframe(page, 'ov-room-recordings', { state: 'visible' });
	});

	test('should allow speaker to access recording when access level is set to speaker', async ({ page }) => {
		await updateRoomConfig(roomId, {
			chat: { enabled: true },
			recording: {
				enabled: true,
				allowAccessTo: MeetRecordingAccess.ADMIN_MODERATOR_SPEAKER
			},
			virtualBackground: { enabled: true }
		});

		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
		await viewRecordingsAs('speaker', page);

		await waitForElementInIframe(page, 'ov-room-recordings', { state: 'visible' });
	});
});
