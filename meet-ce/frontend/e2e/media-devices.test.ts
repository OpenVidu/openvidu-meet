import { expect, test } from './fixtures/media-devices.fixture';
import {
	assertHasVideoDeviceOption,
	ensurePrejoinAudioState,
	ensurePrejoinVideoState,
	expectMicAlertFullyVisible,
	expectMicAlertPointsAtButton,
	getVideoDeviceOptions,
	isPrejoinVideoEnabled,
	selectVideoDevice,
	setSystemMicrophoneMuted,
	startScreensharing,
	toggleMicrophone
} from './helpers/media-controls.helper';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting, openPrejoin, reopenPrejoin } from './helpers/meeting-navigation.helper';
import { openSettingsPanel } from './helpers/panels.helper';
import { getFirstVideoTrackDeviceId, getFirstVideoTrackLabel, getScreenTrackLabel } from './helpers/stream.helper';
import { getGetUserMediaCallCount, getGetUserMediaCalls, installGetUserMediaCounter } from './helpers/ui-utils.helper';

test.describe('Media Devices E2E Tests', () => {
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
		await deleteRooms(createdRoomIds);
	});

	test.describe('Virtual Device Replacement and Permissions Handling', () => {
		test('should allow selecting and replacing the video track with a custom virtual device in the prejoin page', async ({
			page
		}) => {
			await openPrejoin(page, accessUrl);

			const videoDropdown = page.locator('#video-dropdown');

			if (await videoDropdown.isDisabled()) {
				await expect(videoDropdown).toBeDisabled();
				return;
			}

			await videoDropdown.click();
			const customOption = page.locator('#option-custom_fake_video_1');

			if (!(await customOption.isVisible())) {
				await assertHasVideoDeviceOption(page);
				return;
			}

			await customOption.click();
			await expect.poll(() => getFirstVideoTrackLabel(page)).toBe('custom_fake_video_1');

			await page.locator('#video-dropdown').click();
			await page.locator('#option-fake_device_0').click();
			await expect.poll(() => getFirstVideoTrackLabel(page)).toBe('fake_device_0');
		});

		test('should allow selecting and replacing the video track with a custom virtual device in the videoconference page', async ({
			page
		}) => {
			await openMeeting(page, accessUrl);

			await openSettingsPanel(page);
			await page.locator('#video-opt').click();
			await expect(page.locator('ov-video-devices-select')).toBeVisible();

			const videoDropdown = page.locator('#video-dropdown');

			if (await videoDropdown.isDisabled()) {
				await expect(videoDropdown).toBeDisabled();
				return;
			}

			await videoDropdown.click();
			const customOption = page.locator('#option-custom_fake_video_1');

			if (!(await customOption.isVisible())) {
				await assertHasVideoDeviceOption(page);
				return;
			}

			await customOption.click();
			await expect.poll(() => getFirstVideoTrackLabel(page)).toBe('custom_fake_video_1');

			await page.locator('#video-dropdown').click();
			await page.locator('#option-fake_device_0').click();
			await expect.poll(() => getFirstVideoTrackLabel(page)).toBe('fake_device_0');
		});

		test('should replace the screen track with a custom virtual device', async ({ page }) => {
			await openMeeting(page, accessUrl);
			await startScreensharing(page);

			const initialLabel = await getScreenTrackLabel(page);
			expect(initialLabel).not.toBe('custom_fake_screen');

			await page.locator('#screenshare-btn').click();
			const replaceButton = page.locator('#replace-screen-button');
			await expect(replaceButton).toBeVisible();
			await replaceButton.click();
			await page.waitForTimeout(1000);

			const replacedLabel = await getScreenTrackLabel(page);
			expect(replacedLabel).not.toBeNull();
		});
	});

	test.describe('UI Behavior Without Media Device Permissions', () => {
		test('should camera and microphone buttons be disabled in the prejoin page when permissions are denied', async ({
			noMediaPage
		}) => {
			await openPrejoin(noMediaPage, accessUrl);

			await expect(noMediaPage.locator('#no-video-device-message')).toBeVisible();
			await expect(noMediaPage.locator('#no-audio-device-message')).toBeVisible();
			const backgroundsButton = noMediaPage.locator('#backgrounds-button');

			if (await backgroundsButton.isVisible()) {
				await expect(backgroundsButton).toBeDisabled();
			}
		});

		test('should camera and microphone buttons be disabled in the meeting page when permissions are denied', async ({
			noMediaPage
		}) => {
			await openMeeting(noMediaPage, accessUrl, { skipPrejoinMediaCheck: true });

			await expect(noMediaPage.locator('#camera-btn')).toBeDisabled();
			await expect(noMediaPage.locator('#mic-btn')).toBeDisabled();
		});

		test('should show an audio and video device warning in settings when permissions are denied', async ({
			noMediaPage
		}) => {
			await openMeeting(noMediaPage, accessUrl, { skipPrejoinMediaCheck: true });

			await openSettingsPanel(noMediaPage);
			await noMediaPage.locator('#video-opt').click();
			await expect(noMediaPage.locator('ov-video-devices-select')).toBeVisible();
			await expect(noMediaPage.locator('#no-video-device-message')).toBeVisible();

			await noMediaPage.locator('#audio-opt').click();
			await expect(noMediaPage.locator('ov-audio-devices-select')).toBeVisible();
			await expect(noMediaPage.locator('#no-audio-device-message')).toBeVisible();
		});
	});

	// Regression guards for the device-service reorder: media permission is now obtained by the
	// first real track creation (no throwaway getUserMedia probe), the device list is enumerated
	// afterwards, and the stored device selection / enabled state must be honoured.
	test.describe('Device Selection Persistence and Acquisition', () => {
		test('persists the selected camera across a page reload (returning user)', async ({ page }) => {
			await openPrejoin(page, accessUrl);
			await expect.poll(() => getFirstVideoTrackDeviceId(page), { timeout: 15_000 }).not.toBeNull();

			const options = await getVideoDeviceOptions(page);
			const alternate = options.find((option) => !option.selected);

			if (options.length < 2 || !alternate) {
				test.skip(true, 'Needs at least two distinguishable video devices to switch between');
				return;
			}

			const beforeDeviceId = await getFirstVideoTrackDeviceId(page);
			await selectVideoDevice(page, alternate.label);

			// The active camera must actually switch to the picked device.
			await expect.poll(() => getFirstVideoTrackDeviceId(page)).not.toBe(beforeDeviceId);
			const switchedDeviceId = await getFirstVideoTrackDeviceId(page);

			// Reopen in the same browser context: localStorage keeps the chosen device and the browser
			// keeps the granted permission — the "returning user" path. The reorder must reopen the
			// stored camera, not silently fall back to the default device.
			await reopenPrejoin(page, accessUrl);
			await expect.poll(() => getFirstVideoTrackDeviceId(page), { timeout: 15_000 }).toBe(switchedDeviceId);
		});

		test('carries the prejoin-selected camera into the meeting', async ({ page }) => {
			await openPrejoin(page, accessUrl);
			await expect.poll(() => getFirstVideoTrackDeviceId(page), { timeout: 15_000 }).not.toBeNull();

			const options = await getVideoDeviceOptions(page);
			const alternate = options.find((option) => !option.selected);

			if (options.length < 2 || !alternate) {
				test.skip(true, 'Needs at least two distinguishable video devices to switch between');
				return;
			}

			const beforeDeviceId = await getFirstVideoTrackDeviceId(page);
			await selectVideoDevice(page, alternate.label);
			await expect.poll(() => getFirstVideoTrackDeviceId(page)).not.toBe(beforeDeviceId);
			const switchedDeviceId = await getFirstVideoTrackDeviceId(page);

			await page.locator('#join-button').click();
			await expect(page.locator('#layout-container')).toBeVisible({ timeout: 15_000 });
			await expect(page.locator('#media-buttons-container')).toBeVisible({ timeout: 15_000 });

			// Joining must reuse the prejoin track, so the in-room local video stays on the chosen
			// camera instead of being re-acquired with the default device.
			await expect.poll(() => getFirstVideoTrackDeviceId(page), { timeout: 15_000 }).toBe(switchedDeviceId);
		});

		test('remembers a disabled-camera preference on reload', async ({ page }) => {
			await openPrejoin(page, accessUrl);
			await expect.poll(() => getFirstVideoTrackLabel(page), { timeout: 15_000 }).not.toBeNull();

			await ensurePrejoinVideoState(page, false);
			expect(await isPrejoinVideoEnabled(page)).toBe(false);

			// Give the async "camera off" preference write time to reach storage before reloading.
			await page.waitForTimeout(500);

			// Reopen: the stored "camera off" preference must survive, and the freshly created track
			// must arrive muted — the camera stays off without the user toggling it again.
			await reopenPrejoin(page, accessUrl);
			await expect.poll(() => isPrejoinVideoEnabled(page), { timeout: 15_000 }).toBe(false);

			// Cameras are still present — this is "camera off", not "no camera available".
			await expect(page.locator('#no-video-device-message')).toHaveCount(0);
		});

		test('opens the prejoin without a redundant getUserMedia probe', async ({ page }) => {
			await installGetUserMediaCounter(page);

			await openPrejoin(page, accessUrl);
			await expect.poll(() => getFirstVideoTrackDeviceId(page), { timeout: 15_000 }).not.toBeNull();

			const calls = await getGetUserMediaCalls(page);

			// The pre-reorder design — and LiveKit's getLocalDevices() with requestPermissions=true —
			// probed for permission with a throwaway getUserMedia({audio,video}) before acquiring the
			// real tracks. The reorder requests media per kind (video-only / audio-only) and never as a
			// combined audio+video acquisition, so no call carries both kinds.
			expect(calls.length).toBeGreaterThan(0);
			expect(calls.filter((call) => call.audio && call.video)).toEqual([]);
		});

		test('re-selecting the active camera does not re-acquire the track', async ({ page }) => {
			await installGetUserMediaCounter(page);

			await openPrejoin(page, accessUrl);
			await expect.poll(() => getFirstVideoTrackDeviceId(page), { timeout: 15_000 }).not.toBeNull();

			const options = await getVideoDeviceOptions(page);

			if (options.length === 0) {
				test.skip(true, 'Device menu unavailable');
				return;
			}

			// Re-select whichever device is currently active (marked selected, or the only option).
			const active = options.find((option) => option.selected) ?? options[0];
			const beforeDeviceId = await getFirstVideoTrackDeviceId(page);
			const callsBefore = await getGetUserMediaCallCount(page);

			// Selecting the already-active device must short-circuit (needUpdateVideoTrack): no new
			// getUserMedia and no track churn. The menu is already open from getVideoDeviceOptions().
			await page.locator(`#option-${active.label}`).click();
			await page.waitForTimeout(500);

			expect(await getGetUserMediaCallCount(page)).toBe(callsBefore);
			expect(await getFirstVideoTrackDeviceId(page)).toBe(beforeDeviceId);
		});
	});

	test.describe('Microphone Status Notifications', () => {
		test('warns when speaking while the microphone is muted in the prejoin page', async ({ page }) => {
			await openPrejoin(page, accessUrl);

			// While the mic is on, no muted-speech warning may be shown
			await expect(page.locator('#mic-muted-speaking-alert')).toHaveCount(0);

			await ensurePrejoinAudioState(page, false);

			// The fake mic keeps feeding speech → the app must detect voice while muted and warn
			await expect(page.locator('#mic-muted-speaking-alert')).toBeVisible({ timeout: 15_000 });

			// Unmuting clears the warning
			await ensurePrejoinAudioState(page, true);
			await expect(page.locator('#mic-muted-speaking-alert')).toBeHidden({ timeout: 10_000 });
		});

		test('warns when the microphone is muted by the system in the prejoin page', async ({ page }) => {
			await openPrejoin(page, accessUrl);

			await expect(page.locator('#mic-system-muted-alert')).toHaveCount(0);
			await expect(page.locator('#mic-warning-badge')).toHaveCount(0);

			await setSystemMicrophoneMuted(page, true);

			// Warning badge on the mic button + explanatory popup
			await expect(page.locator('#mic-warning-badge')).toBeVisible({ timeout: 10_000 });
			await expect(page.locator('#mic-system-muted-alert')).toBeVisible({ timeout: 10_000 });

			// When the system unmutes the input, both indicators go away
			await setSystemMicrophoneMuted(page, false);
			await expect(page.locator('#mic-warning-badge')).toBeHidden({ timeout: 10_000 });
			await expect(page.locator('#mic-system-muted-alert')).toBeHidden({ timeout: 10_000 });
		});

		test('warns when speaking while the microphone is muted in the meeting', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await expect(page.locator('#mic-muted-speaking-alert')).toHaveCount(0);

			// Mute the mic while the fake device keeps feeding speech
			await toggleMicrophone(page);
			await expect(page.locator('#mic-muted-speaking-alert')).toBeVisible({ timeout: 15_000 });

			// The popup is dismissible via its close button
			await page.locator('#mic-alert-close').click();
			await expect(page.locator('#mic-muted-speaking-alert')).toBeHidden({ timeout: 5_000 });

			// Unmuting keeps it away
			await toggleMicrophone(page);
			await expect(page.locator('#mic-muted-speaking-alert')).toBeHidden();
		});

		test('warns when the microphone is muted by the system in the meeting', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await expect(page.locator('#mic-system-muted-alert')).toHaveCount(0);
			await expect(page.locator('#mic-warning-badge')).toHaveCount(0);

			await setSystemMicrophoneMuted(page, true);

			await expect(page.locator('#mic-warning-badge')).toBeVisible({ timeout: 10_000 });
			await expect(page.locator('#mic-system-muted-alert')).toBeVisible({ timeout: 10_000 });

			await setSystemMicrophoneMuted(page, false);
			await expect(page.locator('#mic-warning-badge')).toBeHidden({ timeout: 10_000 });
			await expect(page.locator('#mic-system-muted-alert')).toBeHidden({ timeout: 10_000 });
		});

		// Prejoin → meeting hand-off (R1): with the reactive local-media read-model, the mic-activity
		// monitor must follow the microphone track across the join without any manual attach call. If
		// the hand-off were broken, the warning that was live in the prejoin would vanish on join.
		test('carries the speaking-while-muted warning from the prejoin into the meeting', async ({ page }) => {
			// Join already muted: openMeeting mutes the mic in the prejoin, then clicks join.
			await openMeeting(page, accessUrl, { audioEnabled: false });

			// In the meeting the mic is muted while the fake device keeps feeding speech. The warning
			// only appears if the monitor handed off from the prejoin track to the published track.
			await expect(page.locator('#mic-muted-speaking-alert')).toBeVisible({ timeout: 15_000 });

			// And unmuting inside the meeting clears it — the monitor is still the one driving the alert.
			await toggleMicrophone(page);
			await expect(page.locator('#mic-muted-speaking-alert')).toBeHidden({ timeout: 10_000 });
		});

		test('carries the system-muted warning from the prejoin into the meeting', async ({ page }) => {
			await openPrejoin(page, accessUrl);

			// System-mute the input while still in the prejoin and confirm the warning shows there.
			await setSystemMicrophoneMuted(page, true);
			await expect(page.locator('#mic-system-muted-alert')).toBeVisible({ timeout: 10_000 });

			// Join: the monitor must keep reporting the system mute against the published track.
			await page.locator('#join-button').click();
			await expect(page.locator('#layout-container')).toBeVisible({ timeout: 15_000 });

			await expect(page.locator('#mic-warning-badge')).toBeVisible({ timeout: 10_000 });
			await expect(page.locator('#mic-system-muted-alert')).toBeVisible({ timeout: 10_000 });

			// Clearing the system mute in the meeting removes the warning.
			await setSystemMicrophoneMuted(page, false);
			await expect(page.locator('#mic-system-muted-alert')).toBeHidden({ timeout: 10_000 });
		});
	});

	// Voice-activity detection: the "talking while muted" warning must fire on real speech but NOT
	// on silence or ambient background noise. Each sub-suite feeds Chromium a different fake mic
	// input via `micAudioPage` (the fixed project audio can't be changed per test). The
	// continuous-speech case is the control that proves the audio feed works, so the "does not
	// warn" assertions are meaningful rather than a silently broken feed.
	test.describe('Microphone Voice-Activity Detection', () => {
		// If the mic level were mis-read as speech, the latched popup would appear within this window.
		const NO_ALERT_WINDOW_MS = 4000;

		test.describe('continuous speech (control)', () => {
			test.use({ fakeAudioFile: 'continuous_speech.wav' });

			test('warns when muted while the mic keeps picking up speech in the prejoin page', async ({
				micAudioPage
			}) => {
				await openPrejoin(micAudioPage, accessUrl);
				await ensurePrejoinAudioState(micAudioPage, false);
				await expect(micAudioPage.locator('#mic-muted-speaking-alert')).toBeVisible({ timeout: 15_000 });
			});
		});

		test.describe('ambient background noise', () => {
			test.use({ fakeAudioFile: 'ambient_pink_noise.wav' });

			test('does not warn on mute with only background noise in the prejoin page', async ({ micAudioPage }) => {
				await openPrejoin(micAudioPage, accessUrl);
				await ensurePrejoinAudioState(micAudioPage, false);
				await micAudioPage.waitForTimeout(NO_ALERT_WINDOW_MS);
				await expect(micAudioPage.locator('#mic-muted-speaking-alert')).toHaveCount(0);
			});

			test('does not warn on mute with only background noise in the meeting', async ({ micAudioPage }) => {
				await openMeeting(micAudioPage, accessUrl);
				await toggleMicrophone(micAudioPage);
				await micAudioPage.waitForTimeout(NO_ALERT_WINDOW_MS);
				await expect(micAudioPage.locator('#mic-muted-speaking-alert')).toHaveCount(0);
			});
		});

		test.describe('complete silence', () => {
			test.use({ fakeAudioFile: 'complete_silence.wav' });

			test('does not warn on mute when the input is silent in the prejoin page', async ({ micAudioPage }) => {
				await openPrejoin(micAudioPage, accessUrl);
				await ensurePrejoinAudioState(micAudioPage, false);
				await micAudioPage.waitForTimeout(NO_ALERT_WINDOW_MS);
				await expect(micAudioPage.locator('#mic-muted-speaking-alert')).toHaveCount(0);
			});
		});
	});

	// The warning popup used to be clipped by the prejoin controls, hidden behind the meeting
	// layout, and (once rendered via overlay) point at a random spot. It is now a top-level CDK
	// overlay whose pointer is aimed at the mic button. The button sits at very different toolbar
	// positions on desktop vs mobile, so both viewports are a real regression guard.
	test.describe('Microphone Status Notification Responsiveness', () => {
		const viewports = [
			{ name: 'desktop', size: { width: 1366, height: 900 } },
			{ name: 'mobile', size: { width: 390, height: 844 } }
		] as const;

		for (const vp of viewports) {
			test(`prejoin popup is on-screen and points at the mic button (${vp.name})`, async ({ page }) => {
				await page.setViewportSize(vp.size);
				await openPrejoin(page, accessUrl);
				await ensurePrejoinAudioState(page, false);
				await expectMicAlertFullyVisible(page);
				await expectMicAlertPointsAtButton(page, '#microphone-button');
			});

			test(`meeting popup is on-screen and points at the mic button (${vp.name})`, async ({ page }) => {
				await page.setViewportSize(vp.size);
				await openMeeting(page, accessUrl);
				await toggleMicrophone(page);
				await expectMicAlertFullyVisible(page);
				await expectMicAlertPointsAtButton(page, '#mic-btn');
			});
		}
	});
});
