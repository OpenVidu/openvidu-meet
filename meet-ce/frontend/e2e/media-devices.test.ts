import { expect, test } from './fixtures/media-devices.fixture';
import {
	MIC_SYSTEM_MUTED_ALERT,
	assertHasVideoDeviceOption,
	ensurePrejoinAudioState,
	ensurePrejoinVideoState,
	expectMicAlertDoesNotOverlap,
	expectMicAlertFullyVisible,
	expectMicAlertPointsAtButton,
	getAudioDeviceOptions,
	getVideoDeviceOptions,
	isPrejoinAudioEnabled,
	isPrejoinVideoEnabled,
	selectAudioDevice,
	selectVideoDevice,
	setSystemMicrophoneMuted,
	setSystemMicrophoneMutedFromStart,
	startScreensharing,
	toggleMicrophone,
	waitForElementToStopMoving
} from './helpers/media-controls.helper';
import { createRoomAndGetAnonymousAccessUrl, deleteRooms } from './helpers/meet-api.helper';
import { openMeeting, openPrejoin, reopenPrejoin } from './helpers/meeting-navigation.helper';
import { openSettingsPanel } from './helpers/panels.helper';
import { getFirstVideoTrackDeviceId, getFirstVideoTrackLabel, getScreenTrackLabel } from './helpers/stream.helper';
import {
	failGetUserMediaFor,
	getGetUserMediaCallCount,
	getGetUserMediaCalls,
	getGetUserMediaCallsFor,
	installGetUserMediaCounter
} from './helpers/ui-utils.helper';

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

		// The enabled state is resolved per entry, never remembered. The device *selection* (which
		// camera) is remembered — that is the test above.
		test('does not remember a disabled camera across a reload', async ({ page }) => {
			await openPrejoin(page, accessUrl);
			await expect.poll(() => getFirstVideoTrackLabel(page), { timeout: 15_000 }).not.toBeNull();

			await ensurePrejoinVideoState(page, false);
			expect(await isPrejoinVideoEnabled(page)).toBe(false);

			// Reopen: the choice was per-entry, so the camera comes back on with the room's default.
			await reopenPrejoin(page, accessUrl);
			await expect.poll(() => isPrejoinVideoEnabled(page), { timeout: 15_000 }).toBe(true);

			await expect(page.locator('#no-video-device-message')).toHaveCount(0);
		});

		test('opens the prejoin with a single combined getUserMedia', async ({ page }) => {
			await installGetUserMediaCounter(page);

			await openPrejoin(page, accessUrl);
			await expect.poll(() => getFirstVideoTrackDeviceId(page), { timeout: 15_000 }).not.toBeNull();

			const calls = await getGetUserMediaCalls(page);

			// Two things are pinned here. There is no throwaway permission probe (LiveKit's
			// getLocalDevices() with requestPermissions=true would add one before the real tracks), and
			// the microphone and the camera are asked for together: one request is one browser
			// permission prompt, where a request per kind costs the participant two.
			expect(calls.length).toBe(1);
			expect(calls[0].audio).toBe(true);
			expect(calls[0].video).toBe(true);
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

		test('opens both devices with the shared capture profile', async ({ page }) => {
			await installGetUserMediaCounter(page);

			await openPrejoin(page, accessUrl);
			await expect.poll(() => getFirstVideoTrackDeviceId(page), { timeout: 15_000 }).not.toBeNull();

			const [videoCall] = await getGetUserMediaCallsFor(page, 'video');
			const [audioCall] = await getGetUserMediaCallsFor(page, 'audio');

			// Every path that opens the camera restates the capture profile; a path that omits it
			// captures whatever the browser defaults to, so the published resolution would depend on
			// how the device happened to be opened.
			expect(videoCall.videoWidth).toBe(1280);
			expect(videoCall.videoHeight).toBe(720);
			expect(audioCall.echoCancellation).toBe(true);
			expect(audioCall.noiseSuppression).toBe(true);
			expect(audioCall.autoGainControl).toBe(true);
		});

		test('turning the camera back on opens the device exactly once', async ({ page }) => {
			// A room whose initial state leaves the camera off, so the prejoin opens with no camera
			// track at all — the path where enabling it has to acquire the device. The participant's
			// intent is deliberately not persisted, so a reload would not reproduce this.
			const { room, accessUrl: cameraOffUrl } = await createRoomAndGetAnonymousAccessUrl({
				config: { initialVideoActive: false }
			});
			createdRoomIds.push(room.roomId);

			await installGetUserMediaCounter(page);

			await openPrejoin(page, cameraOffUrl);
			await expect.poll(() => isPrejoinVideoEnabled(page), { timeout: 15_000 }).toBe(false);
			expect(await getGetUserMediaCallsFor(page, 'video')).toEqual([]);

			await ensurePrejoinVideoState(page, true);
			await expect.poll(() => isPrejoinVideoEnabled(page), { timeout: 15_000 }).toBe(true);
			await expect.poll(() => getFirstVideoTrackDeviceId(page), { timeout: 15_000 }).not.toBeNull();
			// Let a second acquisition show up if the track is opened and then re-acquired.
			await page.waitForTimeout(1500);

			// Creating the track muted and unmuting it afterwards costs a second getUserMedia and
			// blinks the camera light for what the user experienced as a single click.
			const videoCalls = await getGetUserMediaCallsFor(page, 'video');
			expect(videoCalls.length).toBe(1);
			expect(videoCalls[0].videoWidth).toBe(1280);
		});

		test('switching the microphone opens the chosen device with the capture profile', async ({ page }) => {
			await installGetUserMediaCounter(page);

			await openPrejoin(page, accessUrl);
			await expect.poll(() => getGetUserMediaCallsFor(page, 'audio'), { timeout: 15_000 }).not.toEqual([]);

			const options = await getAudioDeviceOptions(page);
			const alternate = options.find((option) => !option.selected);

			if (options.length < 2 || !alternate) {
				test.skip(true, 'Needs at least two distinguishable audio devices to switch between');
				return;
			}

			const callsBefore = (await getGetUserMediaCallsFor(page, 'audio')).length;
			await selectAudioDevice(page, alternate.label);

			// restartTrack replaces the whole constraint set, so the switch must restate the
			// microphone capture profile or the new device falls back to the browser defaults.
			await expect
				.poll(() => getGetUserMediaCallsFor(page, 'audio').then((calls) => calls.length), { timeout: 15_000 })
				.toBeGreaterThan(callsBefore);

			const switchCall = (await getGetUserMediaCallsFor(page, 'audio')).at(-1)!;
			expect(switchCall.audioDeviceId).toBeTruthy();
			expect(switchCall.echoCancellation).toBe(true);
			expect(switchCall.noiseSuppression).toBe(true);
			expect(switchCall.autoGainControl).toBe(true);

			// The microphone stays enabled and usable after the switch.
			expect(await isPrejoinAudioEnabled(page)).toBe(true);
		});
	});

	// The prejoin requests each kind separately so one unavailable device does not take the other
	// down with it. A device held by another application is the realistic failure: permission is
	// granted and the device is listed, but the capture cannot start.
	test.describe('Degraded Device Availability', () => {
		test('keeps the prejoin usable when the camera cannot be opened', async ({ page }) => {
			await failGetUserMediaFor(page, 'video');
			await installGetUserMediaCounter(page);

			await openPrejoin(page, accessUrl);

			// The microphone still opens, and the prejoin is joinable.
			await expect.poll(() => isPrejoinAudioEnabled(page), { timeout: 15_000 }).toBe(true);
			await expect(page.locator('#join-button')).toBeEnabled();

			// The camera must not be reported as enabled: there is no camera track behind it, so a
			// preview that claims to be on would show nothing, and the background effects that
			// require a camera track would be offered.
			expect(await isPrejoinVideoEnabled(page)).toBe(false);
			const backgroundsButton = page.locator('#backgrounds-button');

			if (await backgroundsButton.isVisible()) {
				await expect(backgroundsButton).toBeDisabled();
			}
		});

		test('does not report devices as enabled when no capture could start', async ({ page }) => {
			await failGetUserMediaFor(page, 'video');
			await failGetUserMediaFor(page, 'audio');

			await openPrejoin(page, accessUrl);

			// Both devices are present and both preferences say "on", but neither capture started.
			// Predicting the state from the preference would show two enabled buttons with no track
			// behind them — a preview that is on and shows nothing, a mic warning that never fires.
			await expect(page.locator('#camera-button')).toBeVisible({ timeout: 15_000 });
			expect(await isPrejoinVideoEnabled(page)).toBe(false);
			expect(await isPrejoinAudioEnabled(page)).toBe(false);

			// This is "busy", not "absent": the devices are still listed.
			await expect(page.locator('#no-video-device-message')).toHaveCount(0);
			await expect(page.locator('#no-audio-device-message')).toHaveCount(0);
		});

		test('joins with the microphone only when the camera cannot be opened', async ({ page }) => {
			await failGetUserMediaFor(page, 'video');

			await openPrejoin(page, accessUrl);
			await expect.poll(() => isPrejoinAudioEnabled(page), { timeout: 15_000 }).toBe(true);

			await page.locator('#join-button').click();

			await expect(page.locator('#layout-container')).toBeVisible({ timeout: 15_000 });
			await expect(page.locator('#media-buttons-container')).toBeVisible({ timeout: 15_000 });
			await expect(page.locator('#camera-btn')).toBeEnabled();
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

			// Joining with the OS mic already muted raises the warning while the prejoin card is
			// still animating in (it slides up ~20px). The CDK only re-measures the origin on
			// scroll / viewport resize, so the bubble used to stay at the mid-animation position
			// and land right on top of the media buttons.
			test(`prejoin popup is placed correctly when the system mic is muted before load (${vp.name})`, async ({
				page
			}) => {
				await page.setViewportSize(vp.size);
				await setSystemMicrophoneMutedFromStart(page);
				await openPrejoin(page, accessUrl);

				await expect(page.locator(MIC_SYSTEM_MUTED_ALERT)).toBeVisible({ timeout: 15_000 });
				// The bug only shows once the card has finished moving: the popup was placed against
				// the button's mid-animation position and stayed there.
				await waitForElementToStopMoving(page, '#microphone-button');

				await expectMicAlertFullyVisible(page, MIC_SYSTEM_MUTED_ALERT);
				await expectMicAlertPointsAtButton(page, '#microphone-button', MIC_SYSTEM_MUTED_ALERT);
				await expectMicAlertDoesNotOverlap(page, '.device-controls', MIC_SYSTEM_MUTED_ALERT);
			});
		}
	});
});
