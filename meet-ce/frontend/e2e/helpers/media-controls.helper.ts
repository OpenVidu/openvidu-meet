import { expect, type Locator, type Page } from '@playwright/test';
import { openMoreOptionsMenu } from './panels.helper';
import { clickControlButton, hoverStream } from './ui-utils.helper';

// ─── Prejoin media toggles ──────────────────────────────────────────────────

/**
 * Toggles the camera button on the prejoin screen.
 */
export const togglePrejoinCamera = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await clickControlButton(page, '#camera-button', timeoutMs);
};

/**
 * Toggles the microphone button on the prejoin screen.
 */
export const togglePrejoinMicrophone = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await clickControlButton(page, '#microphone-button', timeoutMs);
};

/**
 * Returns `true` when the prejoin camera button is in the "enabled" state.
 */
export const isPrejoinVideoEnabled = async (page: Page): Promise<boolean> => {
	const cameraButton = page.locator('#camera-button');
	await expect(cameraButton).toBeVisible({ timeout: 10_000 });
	return await cameraButton.evaluate((el) => el.classList.contains('device-enabled'));
};

/**
 * Returns `true` when the prejoin microphone button is in the "enabled" state.
 */
export const isPrejoinAudioEnabled = async (page: Page): Promise<boolean> => {
	const microphoneButton = page.locator('#microphone-button');
	await expect(microphoneButton).toBeVisible({ timeout: 10_000 });
	return await microphoneButton.evaluate((el) => el.classList.contains('device-enabled'));
};

/**
 * Ensures the prejoin camera matches the desired state, toggling if needed.
 */
export const ensurePrejoinVideoState = async (page: Page, enabled: boolean, timeoutMs = 10_000): Promise<void> => {
	const currentlyEnabled = await isPrejoinVideoEnabled(page);

	if (currentlyEnabled !== enabled) {
		await togglePrejoinCamera(page);
		await expect
			.poll(async () => (await isPrejoinVideoEnabled(page)) !== currentlyEnabled, { timeout: timeoutMs })
			.toBeTruthy()
			.catch(() => Promise.resolve());
	}
};

/**
 * Ensures the prejoin microphone matches the desired state, toggling if needed.
 */
export const ensurePrejoinAudioState = async (page: Page, enabled: boolean, timeoutMs = 10_000): Promise<void> => {
	const currentlyEnabled = await isPrejoinAudioEnabled(page);

	if (currentlyEnabled !== enabled) {
		await togglePrejoinMicrophone(page);
		await expect
			.poll(async () => (await isPrejoinAudioEnabled(page)) !== currentlyEnabled, { timeout: timeoutMs })
			.toBeTruthy()
			.catch(() => Promise.resolve());
	}
};

/**
 * Simulates the microphone being muted at the operating-system level (e.g. the OS input volume
 * set to zero or a hardware mute switch). Overrides `MediaStreamTrack.muted` for audio tracks so
 * the app observes the same signal a real system mute produces. Passing `false` restores the
 * native behavior.
 */
export const setSystemMicrophoneMuted = async (page: Page, muted: boolean): Promise<void> => {
	await page.evaluate((isMuted) => {
		const win = window as unknown as Record<string, unknown>;

		if (!win['__e2eSystemMutePatched']) {
			const nativeMuted = Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, 'muted');
			Object.defineProperty(MediaStreamTrack.prototype, 'muted', {
				configurable: true,
				get(this: MediaStreamTrack): boolean {
					if (this.kind === 'audio' && win['__e2eForceSystemMuted']) {
						return true;
					}

					return (nativeMuted?.get?.call(this) as boolean) ?? false;
				}
			});
			win['__e2eSystemMutePatched'] = true;
		}

		win['__e2eForceSystemMuted'] = isMuted;
	}, muted);
};

// ─── In-meeting media toggles ───────────────────────────────────────────────

/**
 * Toggles the in-meeting camera button.
 */
export const toggleCamera = async (page: Page): Promise<void> => {
	await clickControlButton(page, '#camera-btn');
};

/**
 * Toggles the in-meeting microphone button.
 */
export const toggleMicrophone = async (page: Page): Promise<void> => {
	await clickControlButton(page, '#mic-btn');
};

// ─── Screen sharing ─────────────────────────────────────────────────────────

/**
 * Clicks the screen-share toolbar button to start sharing.
 */
export const startScreensharing = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await page.locator('#screenshare-btn').click();
	await expect(page.locator('.OV_screen .local')).toBeVisible({ timeout: timeoutMs });
};

/**
 * Stops screen sharing by clicking the toolbar button and the secondary
 * disable button, then waits until the local screen stream is gone.
 */
export const stopScreensharing = async (page: Page, timeoutMs = 10_000): Promise<void> => {
	await page.locator('#screenshare-btn').click();
	await page.locator('#disable-screen-button').click();
	await expect(page.locator('.OV_screen .local')).toHaveCount(0, { timeout: timeoutMs });
};

// ─── Remote participant mute ────────────────────────────────────────────────

/**
 * Hovers over a remote stream and toggles its mute button.
 */
const toggleRemoteParticipantMute = async (page: Page, remoteStreamSelector = '.OV_stream.remote'): Promise<void> => {
	await hoverStream(page, remoteStreamSelector);
	const muteButton = page.locator(`${remoteStreamSelector} #mute-btn`).first();
	await expect(muteButton).toBeVisible();
	await muteButton.click();
};

/**
 * Mutes a remote participant's audio from the local UI.
 */
export const muteRemoteParticipant = async (page: Page, remoteStreamSelector = '.OV_stream.remote'): Promise<void> => {
	await toggleRemoteParticipantMute(page, remoteStreamSelector);
};

/**
 * Un-mutes a remote participant's audio from the local UI.
 */
export const unmuteRemoteParticipant = async (
	page: Page,
	remoteStreamSelector = '.OV_stream.remote'
): Promise<void> => {
	await toggleRemoteParticipantMute(page, remoteStreamSelector);
};

/**
 * Returns the mute/unmute button for the remote participant named {@link participantName} in the
 * participants panel.
 */
const participantPanelMuteButton = (page: Page, participantName: string): Locator =>
	page.locator('[data-participant-id]', { hasText: participantName }).first().locator('#mute-btn');

/**
 * Toggles the mute button of a remote participant in the participants panel. This silences that
 * participant's audio for the local user only (it does not force-mute them for everyone).
 *
 * The muted button runs an infinite `pulse` (scale) animation, so its bounding box never settles.
 * The click is forced to skip Playwright's stability wait, which would otherwise time out when
 * toggling an already-muted participant back to unmuted.
 */
export const toggleParticipantPanelMute = async (page: Page, participantName: string): Promise<void> => {
	const muteButton = participantPanelMuteButton(page, participantName);
	await expect(muteButton).toBeVisible({ timeout: 10_000 });
	await muteButton.click({ force: true });
};

/**
 * Asserts that the given remote participant is muted for the local user (the panel mute button is in
 * its "muted" warn state).
 */
export const expectParticipantPanelMuted = async (page: Page, participantName: string): Promise<void> => {
	await expect(participantPanelMuteButton(page, participantName)).toHaveClass(/warn-btn/, { timeout: 10_000 });
};

/**
 * Asserts that the given remote participant is not muted for the local user.
 */
export const expectParticipantPanelUnmuted = async (page: Page, participantName: string): Promise<void> => {
	const muteButton = participantPanelMuteButton(page, participantName);
	await expect(muteButton).toBeVisible({ timeout: 10_000 });
	await expect(muteButton).not.toHaveClass(/warn-btn/);
};

// ─── Virtual backgrounds ────────────────────────────────────────────────────

/**
 * Opens the virtual-backgrounds panel from the prejoin screen.
 */
export const openPrejoinBackgroundsPanel = async (page: Page): Promise<void> => {
	await page.locator('#backgrounds-button').click();
	await expect(page.locator('#background-effects-container')).toBeVisible();
};

/**
 * Closes the virtual-backgrounds panel on the prejoin screen.
 * Uses the panel's internal close button to avoid toggling issues: if the panel
 * was briefly auto-closed (e.g. during background-effect processing), clicking
 * the toggle #backgrounds-button would re-open it instead of leaving it closed.
 */
export const closePrejoinBackgroundsPanel = async (page: Page): Promise<void> => {
	const panel = page.locator('#background-effects-container');
	await expect(panel).toBeVisible({ timeout: 5000 });
	await panel.locator('.panel-close-button').click();
	// Prejoin keeps the panel mounted and collapses its wrapper via CSS
	// (`.vb-container` loses `.expanded` → max-height:0), so assert the wrapper is
	// hidden rather than removed from the DOM.
	await expect(page.locator('.vb-container')).not.toBeVisible({ timeout: 5000 });
};

/**
 * Opens the virtual-backgrounds panel from the in-meeting more-options menu.
 */
export const openRoomBackgroundsPanel = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await page.locator('#virtual-bg-btn:visible').click();
	await expect(page.locator('#background-effects-container')).toBeVisible();
};

/**
 * Closes the virtual-backgrounds panel from the in-meeting more-options menu.
 */
export const closeRoomBackgroundsPanel = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await page.locator('#virtual-bg-btn:visible').click();
	await expect(page.locator('#background-effects-container')).toHaveCount(0);
};

/**
 * Applies a background effect by its id
 */
// The FIRST background applied in a session lazily loads the @livekit/track-processors +
// MediaPipe chunk and initialises the WASM runtime, so allow extra time for that one-off cost.
export const applyBackgroundEffect = async (page: Page, effectId: string, timeoutMs = 15_000): Promise<void> => {
	await expect(page.locator('.OV_media-element.camera-source')).toBeVisible({ timeout: timeoutMs });
	await page.locator(`#effect-${effectId}`).click();
	// Wait until the async VB processor finishes and marks this effect active.
	// backgroundIdSelectedWritable.set() (which drives active-effect-btn) is called only
	// after switchBackgroundMode resolves, so this guards against screenshot race conditions.
	await expect(page.locator(`#effect-${effectId}`)).toHaveClass(/active-effect-btn/, { timeout: timeoutMs });
};

// ─── In-meeting media button availability (permissions) ───────────────────────

/**
 * Asserts that the in-meeting camera button is available (`canPublishVideo` granted).
 */
export const expectCameraButtonAvailable = async (page: Page): Promise<void> => {
	await expect(page.locator('#camera-btn')).toBeVisible({ timeout: 10_000 });
};

/**
 * Asserts that the in-meeting camera button is absent (`canPublishVideo` denied).
 */
export const expectNoCameraButton = async (page: Page): Promise<void> => {
	await expect(page.locator('#camera-btn')).toHaveCount(0);
};

/**
 * Asserts that the in-meeting microphone button is available (`canPublishAudio` granted).
 */
export const expectMicButtonAvailable = async (page: Page): Promise<void> => {
	await expect(page.locator('#mic-btn')).toBeVisible({ timeout: 10_000 });
};

/**
 * Asserts that the in-meeting microphone button is absent (`canPublishAudio` denied).
 */
export const expectNoMicButton = async (page: Page): Promise<void> => {
	await expect(page.locator('#mic-btn')).toHaveCount(0);
};

/**
 * Asserts that the screen-share button is available (`canShareScreen` granted).
 */
export const expectScreenshareButtonAvailable = async (page: Page): Promise<void> => {
	await expect(page.locator('#screenshare-btn')).toBeVisible({ timeout: 10_000 });
};

/**
 * Asserts that the screen-share button is absent (`canShareScreen` denied).
 */
export const expectNoScreenshareButton = async (page: Page): Promise<void> => {
	await expect(page.locator('#screenshare-btn')).toHaveCount(0);
};

/**
 * Asserts that the virtual-background control is available in the more-options menu
 * (`canChangeVirtualBackground` granted). Opens and closes the menu.
 */
export const expectBackgroundsButtonAvailable = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await expect(page.locator('#virtual-bg-btn:visible')).toBeVisible({ timeout: 10_000 });
	await page.keyboard.press('Escape');
};

/**
 * Asserts that the virtual-background control is absent from the more-options menu
 * (`canChangeVirtualBackground` denied). Opens and closes the menu.
 */
export const expectNoBackgroundsButton = async (page: Page): Promise<void> => {
	await openMoreOptionsMenu(page);
	await expect(page.locator('#virtual-bg-btn')).toHaveCount(0);
	await page.keyboard.press('Escape');
};

// ─── Device selector ─────────────────────────────────────────────────────────

/**
 * Asserts that at least one video device option is visible in the device selector.
 */
export const assertHasVideoDeviceOption = async (page: Page): Promise<void> => {
	await expect(page.locator('[id^="option-"]').first()).toBeVisible();
};

/**
 * Opens the video device dropdown (prejoin compact selector or settings panel) and returns each
 * device option's `label` and whether it is currently `selected`. The selected flag comes from the
 * menu item's `selected` class, which the component keys on the device id — the correct identity to
 * reason about, since a device's display label and its track label/deviceId need not match.
 *
 * Returns `[]` when the dropdown is not openable (e.g. disabled).
 */
export const getVideoDeviceOptions = async (page: Page): Promise<Array<{ label: string; selected: boolean }>> => {
	const dropdown = page.locator('#video-dropdown');
	await expect(dropdown).toBeVisible({ timeout: 10_000 });

	if (await dropdown.isDisabled()) {
		return [];
	}

	await dropdown.click();
	const options = page.locator('[id^="option-"]');
	await expect(options.first()).toBeVisible({ timeout: 10_000 });
	return options.evaluateAll((elements) =>
		elements.map((el) => ({
			label: el.id.replace(/^option-/, ''),
			selected: el.classList.contains('selected')
		}))
	);
};

/**
 * Selects a video device option by its label, opening the dropdown first when the option is not
 * already visible.
 */
export const selectVideoDevice = async (page: Page, label: string): Promise<void> => {
	const option = page.locator(`#option-${label}`);

	if (!(await option.isVisible())) {
		await clickControlButton(page, '#video-dropdown');
	}

	await expect(option).toBeVisible({ timeout: 10_000 });
	await option.click();
};

// ─── Mic status alert (talking-while-muted popup) ───────────────────────────

const MIC_MUTED_SPEAKING_ALERT = '#mic-muted-speaking-alert';

/**
 * Asserts the "talking while muted" popup is visible, fully inside the viewport, and not covered by
 * another element. Guards the mobile regressions where it was clipped by the prejoin controls or
 * hidden behind the meeting layout.
 */
export const expectMicAlertFullyVisible = async (page: Page): Promise<void> => {
	const locator = page.locator(MIC_MUTED_SPEAKING_ALERT);
	await expect(locator).toBeVisible({ timeout: 15_000 });

	const box = (await locator.boundingBox())!;
	const viewport = page.viewportSize()!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.y).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
	expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

	const notCovered = await page.evaluate((sel) => {
		const el = document.querySelector(sel);

		if (!el) return false;

		const r = el.getBoundingClientRect();
		const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
		return !!top && (el === top || el.contains(top));
	}, MIC_MUTED_SPEAKING_ALERT);
	expect(notCovered).toBe(true);
};

/**
 * Asserts the popup's pointer tip sits horizontally over the given mic button's center (within a
 * button's width), i.e. it points at the button rather than a random toolbar spot.
 */
export const expectMicAlertPointsAtButton = async (page: Page, buttonSelector: string): Promise<void> => {
	const delta = await page.evaluate(
		({ alertSel, buttonSel }) => {
			const arrow = document.querySelector(`${alertSel} .alert-pointer`) as HTMLElement | null;
			const button = document.querySelector(buttonSel) as HTMLElement | null;

			if (!arrow || !button) return null;

			const a = arrow.getBoundingClientRect();
			const b = button.getBoundingClientRect();
			return Math.abs(a.x + a.width / 2 - (b.x + b.width / 2));
		},
		{ alertSel: MIC_MUTED_SPEAKING_ALERT, buttonSel: buttonSelector }
	);
	expect(delta).not.toBeNull();
	// The pointer should land within the button (buttons are ~48px wide); the pre-fix bug was off
	// by 70px+.
	expect(delta!).toBeLessThanOrEqual(24);
};
