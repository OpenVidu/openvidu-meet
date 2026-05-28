import { MeetWebhookEventType, WebComponentEvent } from '@openvidu-meet/typings';
import { expect, Locator, Page } from '@playwright/test';
import { MEET_TESTAPP_URL } from '../config';
import { iframeLocator } from './iframe.helper';
import { getRoom } from './meet-api.helper';

// ─── Headless WC harness ────────────────────────────────────────────────────
//
// The e2e suite previously drove a legacy Mustache testapp via its DOM (room
// list → role dropdown → buttons). The new model bypasses any testapp UI:
//
// - Rooms are created/destroyed through the OpenVidu Meet REST API.
// - Each Playwright page loads a minimal fixture (defined inline below) that
//   imports the `<openvidu-meet>` bundle, mounts the element with the right
//   attributes, and forwards `joined/left/closed/error` DOM events into
//   `.event-{name}` markers that the existing locator helpers consume.
// - Imperative commands (endMeeting / leaveRoom / kickParticipant) are
//   invoked directly on the element via `page.evaluate`.
//
// The Angular testapp on `MEET_TESTAPP_URL` is just the host page: it loads
// the `<openvidu-meet>` bundle from the backend (same-origin `/openvidu-meet.js`,
// proxied to `<MEET_API_URL>/v1/openvidu-meet.js` by `testapp/proxy.conf.js`).
// ────────────────────────────────────────────────────────────────────────────

const testappOrigin = (): string => MEET_TESTAPP_URL.replace(/\/$/, '');

/**
 * Navigates to the Angular testapp (kept visible during the test) and
 * augments it with `.event-{name}` DOM markers so the existing locator
 * helpers (`eventLocator`, `expectEvent`) keep working. The testapp's own UI
 * (controls panel, properties form, event log, etc.) stays interactive —
 * `openMeeting` then drives the form fields and "Apply config" button to
 * mount the WC.
 */
export const ensureFixture = async (page: Page): Promise<void> => {
	const alreadyLoaded = await page.evaluate(() => !!(window as any).__wcMarkersAttached).catch(() => false);

	if (alreadyLoaded) return;

	await page.goto(testappOrigin(), { waitUntil: 'load' });

	// Wait for the WC custom element + the testapp's controls panel.
	await page.evaluate(() => customElements.whenDefined('openvidu-meet'));
	await expect(page.getByTestId('controls-panel')).toBeVisible();

	// Inject hidden `.event-{name}` markers, driven by document-level listeners
	// that pick up the bubbling CustomEvents the WC dispatches. Listening at
	// the document avoids any race against when `<openvidu-meet>` is created
	// inside the Angular wrapper.
	await page.evaluate(() => {
		const log = document.createElement('ul');
		log.id = '__wc-event-markers';
		// Positioned off-viewport (top:-9999px) but with real dimensions, so
		// Playwright's `toBeVisible()` passes on each `<li>` (it requires a
		// non-zero CSS box). `pointer-events:none` keeps it inert.
		log.style.cssText =
			'position:fixed;top:-9999px;left:0;width:auto;height:auto;pointer-events:none;margin:0;padding:0;list-style:none;';
		document.body.appendChild(log);

		(['ready', 'joined', 'left', 'closed', 'error'] as const).forEach((name) => {
			document.addEventListener(
				name,
				(ev) => {
					// Only react to events from the WC element, not anything else
					// in the testapp that happens to share these names.
					const target = ev.target as Element | null;

					if (!target || (target.tagName !== 'OPENVIDU-MEET' && !target.closest?.('openvidu-meet'))) return;

					const li = document.createElement('li');
					li.className = `event-${name}`;

					try {
						li.textContent = JSON.stringify((ev as CustomEvent).detail ?? {});
					} catch {
						li.textContent = '';
					}

					log.appendChild(li);
				},
				true // capture phase, in case anything stops propagation
			);
		});

		(window as any).__wcMarkersAttached = true;
	});
};

/**
 * Joins a room by mounting `<openvidu-meet>` directly with the role's
 * anonymous-access URL fetched from the REST API, then driving the WC's own
 * pre-join flow until the meeting is active.
 *
 * @param page - Playwright page.
 * @param roomId - Room ID to join (must already exist; create it with `createRoom`).
 * @param options.role - `'moderator'` or `'speaker'`. Defaults to `'speaker'`.
 * @param options.name - Participant display name (auto-generated when omitted).
 */
export const openMeeting = async (
	page: Page,
	roomId: string,
	options?: {
		role?: 'moderator' | 'speaker';
		name?: string;
	}
): Promise<void> => {
	const { role = 'speaker', name } = options ?? {};
	const participantName = name ?? `pw-${Math.random().toString(36).substring(2, 9)}`;

	await ensureFixture(page);

	const room = await getRoom(roomId);
	const roomUrl = room.access?.anonymous?.[role]?.url;

	if (!roomUrl) {
		throw new Error(`No anonymous ${role} access URL on room ${roomId}`);
	}

	// Drive the Angular testapp's UI: fill the properties form and click
	// "Apply config" to mount the WC with the API-issued URL.
	await page.getByTestId('input-roomUrl').fill(roomUrl);
	await page.getByTestId('input-participantName').fill(participantName);
	await page.getByTestId('btn-apply-config').click();

	await expect(page.locator('openvidu-meet')).toBeVisible();

	// The WC's lobby screen renders a participant-name input. When the
	// `participant-name` attribute is supplied via applyConfig, the input is
	// pre-filled and disabled — only the submit click is required to advance.
	// Use `waitFor`, not `isVisible()` — the latter is a single-shot check
	// and races the Angular bootstrap.
	const nameInput = iframeLocator(page, '#participant-name-input');

	try {
		await nameInput.waitFor({ state: 'visible', timeout: 10_000 });

		if (await nameInput.isEnabled().catch(() => false)) {
			await nameInput.fill(participantName);
		}

		await iframeLocator(page, '#participant-name-submit').click();
	} catch {
		// Name screen skipped — proceed directly.
	}

	await expect(iframeLocator(page, 'ov-pre-join')).toBeVisible({ timeout: 15_000 });
	await iframeLocator(page, '#join-button').click();
	await expect(iframeLocator(page, 'ov-session')).toBeVisible({ timeout: 15_000 });
};

/**
 * Leaves the current meeting via the in-WC leave button. Moderators get a
 * secondary leave-option menu; the helper waits for it before clicking. If a
 * panel is open it is closed first — the panel uses `fixedInViewport` and
 * covers the toolbar leave button. Mirrors the working SPA-side helper at
 * `meet-ce/frontend/e2e/helpers/meeting-navigation.helper.ts`.
 *
 * The `role` option is ignored — the secondary dropdown is detected
 * dynamically rather than driven from the caller, since both moderator and
 * speaker may surface it depending on permissions.
 */
export const leaveMeeting = async (page: Page, _options?: { role?: 'moderator' | 'speaker' }): Promise<void> => {
	const panelCloseButton = iframeLocator(page, '.panel-close-button').first();

	if (await panelCloseButton.isVisible().catch(() => false)) {
		await panelCloseButton.click();
		await expect(iframeLocator(page, '.sidenav-menu')).not.toBeVisible({ timeout: 5_000 });
	}

	await iframeLocator(page, '#leave-btn').click();

	const leaveOption = iframeLocator(page, '#leave-option');
	const leaveDropdownVisible = await leaveOption
		.waitFor({ state: 'visible', timeout: 3_000 })
		.then(() => true)
		.catch(() => false);

	if (leaveDropdownVisible) {
		await leaveOption.click();
	}

	await expect(eventLocator(page, WebComponentEvent.LEFT).first()).toBeAttached({ timeout: 10_000 });
};

// ─── Imperative commands (driven through the testapp's buttons) ─────────────
//
// The testapp's "Imperative API" section wires each button to the matching
// method on the WC reference, so clicking them exercises the same code path
// a real host would use.
// ────────────────────────────────────────────────────────────────────────────

/** Clicks the testapp's `leaveRoom()` button. */
export const leaveRoomCommand = async (page: Page): Promise<void> => {
	await page.getByTestId('btn-leave-room').click();
};

/** Clicks the testapp's `endMeeting()` button. */
export const endMeetingCommand = async (page: Page): Promise<void> => {
	await page.getByTestId('btn-end-meeting').click();
};

/** Fills the participant identity and clicks the testapp's `kickParticipant()` button. */
export const kickParticipantCommand = async (page: Page, participantIdentity: string): Promise<void> => {
	await page.getByTestId('input-kick-identity').fill(participantIdentity);
	await page.getByTestId('btn-kick-participant').click();
};

// ─── Event & webhook DOM markers ────────────────────────────────────────────
//
// The fixture above writes a `.event-{name}` `<li>` for every public WC event.
// Webhook markers (`.webhook-{name}`) require a socket.io listener tied to the
// backend; they are not wired by the fixture yet, so `expectWebhook` will
// only succeed once a webhook bridge is added.
// ────────────────────────────────────────────────────────────────────────────

/** Locator for a `.event-{name}` DOM marker. */
export const eventLocator = (page: Page, eventName: WebComponentEvent): Locator => page.locator(`.event-${eventName}`);

/** Locator for a `.webhook-{name}` DOM marker. */
export const webhookLocator = (page: Page, webhookName: MeetWebhookEventType): Locator =>
	page.locator(`.webhook-${webhookName}`);

/**
 * Asserts that exactly `count` `.event-{name}` markers exist, then returns the locator.
 */
export const expectEvent = async (
	page: Page,
	eventName: WebComponentEvent,
	options: { count?: number; timeout?: number } = {}
): Promise<Locator> => {
	const { count = 1, timeout = 10_000 } = options;
	const locator = eventLocator(page, eventName);
	await expect(locator).toHaveCount(count, { timeout });
	return locator;
};

/**
 * Asserts that exactly `count` `.webhook-{name}` markers exist, then returns the locator.
 */
export const expectWebhook = async (
	page: Page,
	webhookName: MeetWebhookEventType,
	options: { count?: number; timeout?: number } = {}
): Promise<Locator> => {
	const { count = 1, timeout = 10_000 } = options;
	const locator = webhookLocator(page, webhookName);
	await expect(locator).toHaveCount(count, { timeout });
	return locator;
};
