import { WebComponentProperty } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { iframeLocator, waitForPageRedirect } from '../helpers/iframe.helper';
import { createRoom, deleteRooms, getRecordingUrl, listRecordingsByRoomId } from '../helpers/meet-api.helper';
import { startRecording, stopRecording } from '../helpers/recordings.helper';
import { endMeetingCommand, openMeeting } from '../helpers/testapp.helper';
import { openWebcomponentWithAttributes } from '../helpers/webcomponent-attributes.helper';

// ─── WebComponent attribute coverage ────────────────────────────────────────
//
// These tests render the <openvidu-meet> web component on a blank page (not
// the testapp) so we can exercise individual WebComponentProperty attributes
// in isolation: room-url + participant-name / e2ee-key / show-only-recordings
// / show-recording, recording-url, and leave-redirect-url.
// ─────────────────────────────────────────────────────────────────────────────

const REDIRECT_TARGET_URL = 'https://openvidu.io';

test.describe('WebComponent Attributes E2E Tests', () => {
	const createdRoomIds: string[] = [];

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test.describe('Using room-url', () => {
		let accessUrl: string;

		test.beforeAll(async () => {
			const room = await createRoom();
			createdRoomIds.push(room.roomId);
			accessUrl = room.access.anonymous.moderator.url;
		});

		test('participant-name: pre-fills the participant name input and disables it', async ({ page }) => {
			const participantName = 'Alice';

			await openWebcomponentWithAttributes(page, {
				[WebComponentProperty.ROOM_URL]: accessUrl,
				[WebComponentProperty.PARTICIPANT_NAME]: participantName
			});

			const nameInput = iframeLocator(page, '#participant-name-input');
			await expect(nameInput).toBeVisible();
			await expect(nameInput).toHaveValue(participantName);
			await expect(nameInput).toBeDisabled();
		});

		test.describe('with E2EE enabled', () => {
			test.beforeAll(async () => {
				const room = await createRoom({ config: { e2ee: { enabled: true } } });
				createdRoomIds.push(room.roomId);
				accessUrl = room.access.anonymous.moderator.url;
			});

			test('e2ee-key: pre-fills the E2EE key input and hides it', async ({ page }) => {
				await openWebcomponentWithAttributes(page, {
					[WebComponentProperty.ROOM_URL]: accessUrl,
					[WebComponentProperty.E2EE_KEY]: 'super-secret-key-123'
				});

				// Wait for the lobby to render so the E2EE control evaluation is complete.
				await expect(iframeLocator(page, '#participant-name-input')).toBeVisible();

				// When `e2ee-key` is provided via the URL/attribute, the lobby disables the
				// e2eeKey form control. The hidden state and the E2EE message confirms the
				// `e2ee-key` attribute was accepted by the web component.
				await expect(iframeLocator(page, '#participant-e2eekey-input')).toHaveCount(0);
				await expect(iframeLocator(page, '.encryption-badge')).toBeVisible();
			});

			test('e2ee-key + participant-name: join button stays enabled when both are pre-filled', async ({
				page
			}) => {
				// Regression: providing BOTH participant-name and e2ee-key disables both lobby
				// form controls. A FormGroup whose every control is disabled has status DISABLED,
				// so `valid` is false even though the form is complete — which previously left the
				// join button permanently disabled. The button must remain clickable here.
				await openWebcomponentWithAttributes(page, {
					[WebComponentProperty.ROOM_URL]: accessUrl,
					[WebComponentProperty.PARTICIPANT_NAME]: 'Alice',
					[WebComponentProperty.E2EE_KEY]: 'super-secret-key-123'
				});

				const nameInput = iframeLocator(page, '#participant-name-input');
				await expect(nameInput).toBeVisible();
				await expect(nameInput).toBeDisabled();
				await expect(iframeLocator(page, '#participant-e2eekey-input')).toHaveCount(0);

				await expect(iframeLocator(page, '#participant-name-submit')).toBeEnabled();
			});
		});

		test.describe('with recording', () => {
			let recordingId: string;

			test.beforeAll(async ({ browser }) => {
				const room = await createRoom();
				createdRoomIds.push(room.roomId);
				accessUrl = room.access.anonymous.moderator.url;

				// Produce a recording for this room via the testapp flow.
				const context = await browser.newContext();
				const page = await context.newPage();

				try {
					await openMeeting(page, room.roomId, { role: 'moderator' });
					await startRecording(page);
					await stopRecording(page);
					await endMeetingCommand(page);
				} finally {
					await context.close();
				}

				const recordings = await listRecordingsByRoomId(room.roomId);
				expect(recordings.length).toBeGreaterThan(0);
				recordingId = recordings[0].recordingId;
			});

			test('show-only-recordings: redirects to the room recordings page', async ({ page }) => {
				await openWebcomponentWithAttributes(page, {
					[WebComponentProperty.ROOM_URL]: accessUrl,
					[WebComponentProperty.SHOW_ONLY_RECORDINGS]: 'true'
				});

				await expect(iframeLocator(page, 'ov-recording-lists, .recordings-list')).toBeVisible({
					timeout: 15_000
				});
				await expect(iframeLocator(page, '#participant-name-input')).toHaveCount(0);
			});

			test('show-recording: redirects to the specified recording', async ({ page }) => {
				await openWebcomponentWithAttributes(page, {
					[WebComponentProperty.ROOM_URL]: accessUrl,
					[WebComponentProperty.SHOW_RECORDING]: recordingId
				});

				await expect(iframeLocator(page, '.recording-page-content')).toBeVisible({ timeout: 15_000 });
				await expect(iframeLocator(page, '#participant-name-input')).toHaveCount(0);
			});
		});
	});

	test.describe('Using recording-url', () => {
		let recordingId: string;

		test.beforeAll(async ({ browser }) => {
			const room = await createRoom();
			createdRoomIds.push(room.roomId);

			// Produce a recording for this room via the testapp flow.
			const context = await browser.newContext();
			const page = await context.newPage();

			try {
				await openMeeting(page, room.roomId, { role: 'moderator' });
				await startRecording(page);
				await stopRecording(page);
				await endMeetingCommand(page);
			} finally {
				await context.close();
			}

			const recordings = await listRecordingsByRoomId(room.roomId);
			expect(recordings.length).toBeGreaterThan(0);
			recordingId = recordings[0].recordingId;
		});

		test('redirects to the specified recording', async ({ page }) => {
			const recordingUrl = await getRecordingUrl(recordingId);

			await openWebcomponentWithAttributes(page, {
				[WebComponentProperty.RECORDING_URL]: recordingUrl
			});

			await expect(iframeLocator(page, '.recording-page-content')).toBeVisible({ timeout: 15_000 });
		});
	});

	test.describe('Using leave-redirect-url', () => {
		let accessUrl: string;

		test.beforeAll(async () => {
			const room = await createRoom();
			createdRoomIds.push(room.roomId);
			accessUrl = room.access.anonymous.moderator.url;
		});

		test('redirects from the lobby back button', async ({ page }) => {
			await openWebcomponentWithAttributes(page, {
				[WebComponentProperty.ROOM_URL]: accessUrl,
				[WebComponentProperty.LEAVE_REDIRECT_URL]: REDIRECT_TARGET_URL
			});

			await expect(iframeLocator(page, '#participant-name-input')).toBeVisible();

			await iframeLocator(page, '.quick-action-button').first().click();
			await waitForPageRedirect(page, REDIRECT_TARGET_URL);
		});

		test('redirects from the disconnected page back button', async ({ page }) => {
			// First, open a meeting so it can be ended (which lands on the disconnected page).
			await openWebcomponentWithAttributes(page, {
				[WebComponentProperty.ROOM_URL]: accessUrl,
				[WebComponentProperty.PARTICIPANT_NAME]: 'Alice',
				[WebComponentProperty.LEAVE_REDIRECT_URL]: REDIRECT_TARGET_URL
			});

			await expect(iframeLocator(page, '#participant-name-submit')).toBeVisible();
			await iframeLocator(page, '#participant-name-submit').click();

			await expect(iframeLocator(page, 'ov-pre-join')).toBeVisible({ timeout: 15_000 });
			await iframeLocator(page, '#join-button').click();
			await expect(iframeLocator(page, 'ov-session')).toBeVisible({ timeout: 15_000 });

			// Leave to reach the disconnected page (moderator leave-option menu is shown).
			await iframeLocator(page, '#leave-btn').click();
			await iframeLocator(page, '#leave-option').click();

			await expect(iframeLocator(page, '#disconnect-title')).toBeVisible({ timeout: 15_000 });
			await expect(iframeLocator(page, '#back-btn')).toBeVisible();
			await iframeLocator(page, '#back-btn').click();

			await waitForPageRedirect(page, REDIRECT_TARGET_URL);
		});
	});
});
