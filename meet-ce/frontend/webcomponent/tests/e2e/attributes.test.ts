import { EmbeddedAttribute } from '@openvidu-meet/typings';
import { expect, test, type Page } from '@playwright/test';
import { createRoom, deleteRooms, getRecordingUrl, listRecordingsByRoomId } from '../helpers/meet-api.helper';
import {
	expectPrejoinCameraEnabled,
	expectPrejoinMicEnabled,
	expectToolbarCameraEnabled,
	expectToolbarMicEnabled
} from '../helpers/media-controls.helper';
import { startRecording, stopRecording } from '../helpers/recordings.helper';
import { endMeetingCommand, leaveMeeting, openMeeting, openMeetingAtMediaSetup } from '../helpers/testapp.helper';
import {
	openWebcomponentWithAttributes,
	type WebComponentAttributes
} from '../helpers/webcomponent-attributes.helper';
import { waitForPageRedirect, wcLocator } from '../helpers/webcomponent.helper';

// ─── WebComponent attribute coverage ────────────────────────────────────────
//
// These tests render the <openvidu-meet> web component on a blank page (not
// the testapp) so we can exercise individual EmbeddedAttribute attributes
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

		test('should pre-fill and disable the participant name input when participant-name is set', async ({
			page
		}) => {
			const participantName = 'Alice';

			await openWebcomponentWithAttributes(page, {
				[EmbeddedAttribute.ROOM_URL]: accessUrl,
				[EmbeddedAttribute.PARTICIPANT_NAME]: participantName
			});

			const nameInput = wcLocator(page, '#participant-name-input');
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

			test('should hide the E2EE key input and show the encryption badge when e2ee-key is set', async ({
				page
			}) => {
				await openWebcomponentWithAttributes(page, {
					[EmbeddedAttribute.ROOM_URL]: accessUrl,
					[EmbeddedAttribute.E2EE_KEY]: 'super-secret-key-123'
				});

				// Wait for the lobby to render so the E2EE control evaluation is complete.
				await expect(wcLocator(page, '#participant-name-input')).toBeVisible();

				// When `e2ee-key` is provided via the URL/attribute, the lobby disables the
				// e2eeKey form control. The hidden state and the E2EE message confirms the
				// `e2ee-key` attribute was accepted by the web component.
				await expect(wcLocator(page, '#participant-e2eekey-input')).toHaveCount(0);
				await expect(wcLocator(page, '.encryption-badge')).toBeVisible();
			});

			test('should keep the join button enabled when both participant-name and e2ee-key are set', async ({
				page
			}) => {
				// Regression: providing BOTH participant-name and e2ee-key disables both lobby
				// form controls. A FormGroup whose every control is disabled has status DISABLED,
				// so `valid` is false even though the form is complete — which previously left the
				// join button permanently disabled. The button must remain clickable here.
				await openWebcomponentWithAttributes(page, {
					[EmbeddedAttribute.ROOM_URL]: accessUrl,
					[EmbeddedAttribute.PARTICIPANT_NAME]: 'Alice',
					[EmbeddedAttribute.E2EE_KEY]: 'super-secret-key-123'
				});

				const nameInput = wcLocator(page, '#participant-name-input');
				await expect(nameInput).toBeVisible();
				await expect(nameInput).toBeDisabled();
				await expect(wcLocator(page, '#participant-e2eekey-input')).toHaveCount(0);

				await expect(wcLocator(page, '#participant-name-submit')).toBeEnabled();
			});
		});

		test.describe('with initial-audio-enabled / initial-video-enabled', () => {
			// Its own room rather than reusing the outer `accessUrl`: the E2EE sibling block
			// above reassigns that shared variable in ITS `beforeAll`, and describe blocks run
			// in file order, so relying on it here would silently join an E2EE room instead.
			let mediaEnabledAccessUrl: string;

			test.beforeAll(async () => {
				const room = await createRoom();
				createdRoomIds.push(room.roomId);
				mediaEnabledAccessUrl = room.access.anonymous.moderator.url;
			});

			/** Mounts the WC with `attributes` and advances the lobby to the media-setup screen. */
			const openMediaSetup = async (page: Page, attributes: WebComponentAttributes): Promise<void> => {
				await openWebcomponentWithAttributes(page, {
					[EmbeddedAttribute.ROOM_URL]: mediaEnabledAccessUrl,
					[EmbeddedAttribute.PARTICIPANT_NAME]: 'Alice',
					...attributes
				});

				await expect(wcLocator(page, '#participant-name-submit')).toBeVisible({ timeout: 15_000 });
				await wcLocator(page, '#participant-name-submit').click();
				await expect(wcLocator(page, 'ov-meeting-media-setup')).toBeVisible({ timeout: 15_000 });
			};

			test('should join with the microphone muted when initial-audio-enabled is false', async ({ page }) => {
				await openMediaSetup(page, { [EmbeddedAttribute.INITIAL_AUDIO_ENABLED]: 'false' });

				await expectPrejoinMicEnabled(page, 'webcomponent', false, { timeout: 10_000 });

				// Not a capability: the control stays visible and enabled so the participant
				// can override the initial state before joining.
				await expect(wcLocator(page, '#microphone-button')).toBeEnabled();
			});

			test('should join with the camera off when initial-video-enabled is false', async ({ page }) => {
				await openMediaSetup(page, { [EmbeddedAttribute.INITIAL_VIDEO_ENABLED]: 'false' });

				await expectPrejoinCameraEnabled(page, 'webcomponent', false, { timeout: 10_000 });
				await expect(wcLocator(page, '#camera-button')).toBeEnabled();
			});

			test('should join with both devices enabled when neither attribute is set', async ({ page }) => {
				await openMediaSetup(page, {});

				await expectPrejoinMicEnabled(page, 'webcomponent', true, { timeout: 10_000 });
				await expectPrejoinCameraEnabled(page, 'webcomponent', true, { timeout: 10_000 });
			});
		});

		test.describe('persistence of initial-audio-enabled / initial-video-enabled across meetings', () => {
			// Own room for the same reason as the sibling block above: describe blocks run in
			// file order, and reusing the outer `accessUrl` would risk joining whatever room a
			// later-declared block's `beforeAll` has since assigned it to.
			let persistenceRoomId: string;

			test.beforeAll(async () => {
				const room = await createRoom();
				createdRoomIds.push(room.roomId);
				persistenceRoomId = room.roomId;
			});

			test('should not persist initial-audio-enabled=false into the stored microphone preference across meetings', async ({
				page
			}) => {
				await openMeeting(page, persistenceRoomId, { role: 'moderator', initialAudioEnabled: false });
				await expectToolbarMicEnabled(page, 'webcomponent', false, { timeout: 10_000 });
				await leaveMeeting(page);

				// Re-entering the SAME tab WITHOUT the attribute: the participant never expressed
				// a preference of their own, so the microphone must come back on (the default).
				await openMeeting(page, persistenceRoomId, { role: 'moderator' });
				await expectToolbarMicEnabled(page, 'webcomponent', true, { timeout: 10_000 });
			});

			test('should not persist initial-video-enabled=false into the stored camera preference across meetings', async ({
				page
			}) => {
				await openMeeting(page, persistenceRoomId, { role: 'moderator', initialVideoEnabled: false });
				await expectToolbarCameraEnabled(page, 'webcomponent', false, { timeout: 10_000 });
				await leaveMeeting(page);

				await openMeeting(page, persistenceRoomId, { role: 'moderator' });
				await expectToolbarCameraEnabled(page, 'webcomponent', true, { timeout: 10_000 });
			});

			test('should keep the stored camera preference across meetings when the attribute is absent', async ({
				page
			}) => {
				// The participant turns the camera off themselves in prejoin: that IS a preference.
				const { meet } = await openMeetingAtMediaSetup(page, persistenceRoomId, { role: 'moderator' });
				await expectPrejoinCameraEnabled(page, 'webcomponent', true, { timeout: 10_000 });
				await meet('#camera-button').click();
				await expectPrejoinCameraEnabled(page, 'webcomponent', false, { timeout: 10_000 });

				await meet('#join-button').click();
				await meet('#layout-container').waitFor({ state: 'visible', timeout: 15_000 });
				await leaveMeeting(page);

				// Re-entering the same tab: the stored preference must hold.
				await openMeetingAtMediaSetup(page, persistenceRoomId, { role: 'moderator' });
				await expectPrejoinCameraEnabled(page, 'webcomponent', false, { timeout: 10_000 });
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

			test('should redirect to the room recordings page when show-only-recordings is set', async ({ page }) => {
				await openWebcomponentWithAttributes(page, {
					[EmbeddedAttribute.ROOM_URL]: accessUrl,
					[EmbeddedAttribute.SHOW_ONLY_RECORDINGS]: 'true'
				});

				await expect(wcLocator(page, 'ov-recording-lists, .recordings-list')).toBeVisible({
					timeout: 15_000
				});
				await expect(wcLocator(page, '#participant-name-input')).toHaveCount(0);
			});

			test('should redirect to the specified recording when show-recording is set', async ({ page }) => {
				await openWebcomponentWithAttributes(page, {
					[EmbeddedAttribute.ROOM_URL]: accessUrl,
					[EmbeddedAttribute.SHOW_RECORDING]: recordingId
				});

				await expect(wcLocator(page, '.recording-page-content')).toBeVisible({ timeout: 15_000 });
				await expect(wcLocator(page, '#participant-name-input')).toHaveCount(0);
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

		test('should redirect to the specified recording', async ({ page }) => {
			const recordingUrl = await getRecordingUrl(recordingId);

			await openWebcomponentWithAttributes(page, {
				[EmbeddedAttribute.RECORDING_URL]: recordingUrl
			});

			await expect(wcLocator(page, '.recording-page-content')).toBeVisible({ timeout: 15_000 });
		});
	});

	test.describe('Using leave-redirect-url', () => {
		let accessUrl: string;

		test.beforeAll(async () => {
			const room = await createRoom();
			createdRoomIds.push(room.roomId);
			accessUrl = room.access.anonymous.moderator.url;
		});

		test('should redirect to the configured URL from the lobby back button', async ({ page }) => {
			await openWebcomponentWithAttributes(page, {
				[EmbeddedAttribute.ROOM_URL]: accessUrl,
				[EmbeddedAttribute.LEAVE_REDIRECT_URL]: REDIRECT_TARGET_URL
			});

			await expect(wcLocator(page, '#participant-name-input')).toBeVisible();

			await wcLocator(page, '.quick-action-button').first().click();
			await waitForPageRedirect(page, REDIRECT_TARGET_URL);
		});

		test('should redirect to the configured URL from the disconnected page back button', async ({ page }) => {
			// First, open a meeting so it can be ended (which lands on the disconnected page).
			await openWebcomponentWithAttributes(page, {
				[EmbeddedAttribute.ROOM_URL]: accessUrl,
				[EmbeddedAttribute.PARTICIPANT_NAME]: 'Alice',
				[EmbeddedAttribute.LEAVE_REDIRECT_URL]: REDIRECT_TARGET_URL
			});

			await expect(wcLocator(page, '#participant-name-submit')).toBeVisible();
			await wcLocator(page, '#participant-name-submit').click();

			await expect(wcLocator(page, 'ov-meeting-media-setup')).toBeVisible({ timeout: 15_000 });
			await wcLocator(page, '#join-button').click();
			await expect(wcLocator(page, '#layout-container')).toBeVisible({ timeout: 15_000 });

			// Leave to reach the disconnected page (moderator leave-option menu is shown).
			await wcLocator(page, '#leave-btn').click();
			await wcLocator(page, '#leave-option').click();

			await expect(wcLocator(page, '#disconnect-title')).toBeVisible({ timeout: 15_000 });
			await expect(wcLocator(page, '#back-btn')).toBeVisible();
			await wcLocator(page, '#back-btn').click();

			await waitForPageRedirect(page, REDIRECT_TARGET_URL);
		});
	});
});
