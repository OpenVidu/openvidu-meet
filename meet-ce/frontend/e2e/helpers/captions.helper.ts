import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import type { Room } from 'livekit-client';
import { createHmac } from 'node:crypto';
import { createRoomAndGetAnonymousAccessUrl, MEET_BASE_URL } from './meet-api.helper';
import { openMeeting } from './meeting-navigation.helper';
import { floatStream } from './stream.helper';
import { getElementBoundingBox, getSettledBoundingBox } from './ui-utils.helper';

export const getCaptionsButton = (page: Page): Locator => {
	return page.locator('#captions-button').first();
};

export const getCaptionsButtonIcon = (page: Page): Locator => {
	return page.locator('#captions-button mat-icon').first();
};

/**
 * Intercepts the backend calls that gate live captions so a test can enable them
 * deterministically, independent of whether the environment actually provisions the
 * global captions flag and an AI captions assistant.
 *
 * It stubs three internal-API endpoints:
 * - `GET /config/captions` → `{ enabled: deploymentEnabled }`, so the captions button renders
 *   ENABLED, or DISABLED_WITH_WARNING when `deploymentEnabled` is `false`.
 * - `POST /ai/assistants` → a fake assistant so `MeetingCaptionsService.enable()`
 *   resolves without a real AI backend (it otherwise awaits this and swallows the error,
 *   leaving captions off).
 * - `DELETE /ai/assistants/:id` → `200` so `disable()` also resolves cleanly.
 *
 * Combined with a room created with `config.captions.enabled = true`, clicking
 * `#captions-button` reliably renders the `<ov-meeting-captions>` footer.
 *
 * MUST be called BEFORE navigating to the meeting — the global captions config is
 * fetched during app bootstrap.
 */
export const mockCaptionsBackend = async (page: Page, { deploymentEnabled = true } = {}): Promise<void> => {
	await page.route('**/internal-api/*/config/captions', async (route) => {
		if (route.request().method() !== 'GET') {
			await route.continue();
			return;
		}

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ enabled: deploymentEnabled })
		});
	});

	await page.route('**/internal-api/*/ai/assistants', async (route) => {
		if (route.request().method() !== 'POST') {
			await route.continue();
			return;
		}

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ id: 'e2e-fake-captions-assistant', status: 'active' })
		});
	});

	await page.route('**/internal-api/*/ai/assistants/*', async (route) => {
		if (route.request().method() !== 'DELETE') {
			await route.continue();
			return;
		}

		await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
	});
};

/**
 * Enables live captions in the meeting (assuming {@link mockCaptionsBackend} has been
 * installed and the room was created with captions enabled) and waits for the captions
 * footer to render.
 */
export const enableCaptions = async (page: Page): Promise<void> => {
	const button = getCaptionsButton(page);
	await expect(button).toBeVisible({ timeout: 10_000 });
	await expect(button).toBeEnabled({ timeout: 10_000 });
	await button.click();
	await expect(page.locator('.captions-container')).toBeVisible({ timeout: 10_000 });
};

const LIVEKIT_URL = process.env['LIVEKIT_URL'] ?? 'ws://localhost:7880';
const LIVEKIT_API_KEY = process.env['LIVEKIT_API_KEY'] ?? 'devkey';
const LIVEKIT_API_SECRET = process.env['LIVEKIT_API_SECRET'] ?? 'secret';

const liveKitToken = (roomId: string, identity: string): string => {
	const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
	const now = Math.floor(Date.now() / 1000);
	const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
		iss: LIVEKIT_API_KEY,
		sub: identity,
		name: identity,
		nbf: now,
		exp: now + 3600,
		video: { room: roomId, roomJoin: true, canPublish: false, canPublishData: true, canSubscribe: false }
	})}`;
	return `${unsigned}.${createHmac('sha256', LIVEKIT_API_SECRET).update(unsigned).digest('base64url')}`;
};

type SpeechAgentWindow = Window & {
	LivekitClient: typeof import('livekit-client');
	speechAgentRoom: Room;
};

export interface SpeechAgent {
	/** Sends a transcription the way the speech processing agent does, on the `lk.transcription` topic. */
	transcribe(text: string, options?: { final?: boolean; trackId?: string }): Promise<void>;
	leave(): Promise<void>;
}

/**
 * Joins the meeting's LiveKit room as a stand-in for the speech processing agent, so a test can
 * make captions appear without the agent or a speech-to-text provider. The real agent sends each
 * transcription on behalf of the participant who spoke; this one sends them as itself, so its
 * captions carry `identity` as the speaker name. Returns once every page in `meetingPages` shows it,
 * since a meeting drops the transcriptions of a speaker it does not know yet.
 */
export const joinSpeechAgent = async (
	browser: Browser,
	roomId: string,
	identity: string,
	meetingPages: Page[]
): Promise<SpeechAgent> => {
	const page = await browser.newPage();
	// livekit-client needs a secure context, and Chrome lets only a page served from the local network reach LiveKit.
	await page.goto(`${MEET_BASE_URL}/health`);
	await page.addScriptTag({ path: require.resolve('livekit-client') });
	await page.evaluate(
		async ({ url, token }) => {
			const agentWindow = window as unknown as SpeechAgentWindow;
			agentWindow.speechAgentRoom = new agentWindow.LivekitClient.Room();
			await agentWindow.speechAgentRoom.connect(url, token);
		},
		{ url: LIVEKIT_URL, token: liveKitToken(roomId, identity) }
	);

	for (const meetingPage of meetingPages) {
		await expect(meetingPage.locator('#participant-name', { hasText: identity }).first()).toBeVisible();
	}

	return {
		transcribe: (text, { final = true, trackId = 'TR_speech' } = {}) =>
			page.evaluate(
				async ({ text, attributes }) => {
					await (window as unknown as SpeechAgentWindow).speechAgentRoom.localParticipant.sendText(text, {
						topic: 'lk.transcription',
						attributes
					});
				},
				{ text, attributes: { 'lk.transcription_final': String(final), 'lk.transcribed_track_id': trackId } }
			),
		leave: async () => {
			await page.evaluate(() => (window as unknown as SpeechAgentWindow).speechAgentRoom.disconnect());
			await page.close();
		}
	};
};

/** Bounding box shape returned by {@link getElementBoundingBox}. */
export type LayoutBox = { x: number; y: number; width: number; height: number };

export interface FloatingCaptionsLayout {
	/** Room id of the captions-enabled room created for the scenario; register it for cleanup. */
	roomId: string;
	/** Full-height layout viewport (#layout-container) box, measured AFTER floating. */
	layoutBox: LayoutBox;
	/** Caption-shrunk participant grid (#layout) box, measured AFTER floating. */
	gridBox: LayoutBox;
}

/**
 * End-to-end scenario setup for the "floating video with captions" tests: creates a
 * captions-enabled room, opens it with the captions backend mocked (see
 * {@link mockCaptionsBackend}), turns captions on, and floats the local video.
 *
 * Returns the created room id (register it with the suite's cleanup list) plus the
 * full-height layout box (#layout-container) and the caption-shrunk grid box (#layout).
 *
 * NOTE: the boxes are read AFTER floating on purpose. With the captions footer present the
 * mat-sidenav content reflows once the local tile floats (the whole layout area can shift a
 * few hundred px), so a box captured before floating would not share the tile's coordinate
 * frame. Reading #layout-container and #layout in the same post-float frame as the tile keeps
 * assertions frame-relative and robust.
 */
export const openFloatingWithCaptions = async (page: Page): Promise<FloatingCaptionsLayout> => {
	await mockCaptionsBackend(page);
	const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl({
		config: { captions: { enabled: true } }
	});

	await openMeeting(page, accessUrl);
	await enableCaptions(page);

	await floatStream(page);
	await getSettledBoundingBox(page, '.local_participant:has(.OV_stream_video.local)');

	const layoutBox = await getElementBoundingBox(page, '#layout-container');
	const gridBox = await getElementBoundingBox(page, '#layout');
	expect(layoutBox).not.toBeNull();
	expect(gridBox).not.toBeNull();

	// Sanity check: the captions footer must actually shrink the grid well above the full layout
	// bottom, otherwise there is no "trap" for these tests to guard against.
	expect(gridBox!.y + gridBox!.height).toBeLessThan(layoutBox!.y + layoutBox!.height - 100);

	return { roomId: room.roomId, layoutBox: layoutBox!, gridBox: gridBox! };
};
