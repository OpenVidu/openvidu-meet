import { MeetRecordingInfo, MeetRoom, MeetUserRole } from '@openvidu-meet/typings';
import { expect, test, type Page } from '@playwright/test';
import { createReadyUser, expectNoLoginPage, type ReadyUser } from './helpers/auth.helper';
import { createRoom, deleteRooms, deleteUsers, getRecordingShareUrl } from './helpers/meet-api.helper';
import { openLobby } from './helpers/meeting-navigation.helper';
import { openRecording, openRoomRecordings, toRoomRecordingsUrl } from './helpers/recordings-navigation.helper';
import { expectRecordingViewShown, expectRoomRecordingsListShown, recordRoom } from './helpers/recordings.helper';
import { installTokenExpiryController } from './helpers/token-refresh.helper';

/**
 * Token-refresh tests drive the HTTP interceptor's refresh cascade. Tokens are not expired
 * server-side; instead {@link installTokenExpiryController} answers a *normal* API request with a
 * simulated 401 when it carries a token the test marked expired, while letting the mint/refresh
 * endpoints genuinely issue fresh tokens (see recording-access.md for the individual-recording
 * matrix and http.interceptor / *-error-handler for the cascade under test).
 */
test.describe('Token Refresh E2E Tests', () => {
	const createdUserIds: string[] = [];
	const createdRoomIds: string[] = [];

	let room: MeetRoom;
	let recording: MeetRecordingInfo;
	let privateRecordingUrl: string;
	let adminUser: ReadyUser;
	let nonMemberUser: ReadyUser;

	test.beforeAll(async ({ browser }) => {
		test.setTimeout(180_000);

		room = await createRoom();
		createdRoomIds.push(room.roomId);

		adminUser = await createReadyUser('Refresh Admin');
		nonMemberUser = await createReadyUser('Refresh Viewer', MeetUserRole.ROOM_MEMBER);
		createdUserIds.push(adminUser.userId, nonMemberUser.userId);

		recording = await recordRoom(browser, room.roomId);
		privateRecordingUrl = await getRecordingShareUrl(recording.recordingId, true);
	});

	test.afterAll(async () => {
		await Promise.all([deleteRooms(createdRoomIds), deleteUsers(createdUserIds)]);
	});

	const clickListRefresh = async (page: Page): Promise<void> => {
		await page.locator('.refresh-btn').first().click();
	};

	const authenticateAndOpenRecordingsList = async (page: Page): Promise<void> => {
		await openLobby(page, room.access.user.url, {
			login: { userId: adminUser.userId, password: adminUser.password }
		});
		await openRoomRecordings(page, toRoomRecordingsUrl(room.access.user.url));
	};

	// ── Logged-in scenarios (recordings list page) ───────────────────────────────────

	test.describe('Logged-in refresh scenarios', () => {
		test('expired room member token only: recovered by refreshing the RMT', async ({ page }) => {
			const ctrl = await installTokenExpiryController(page);

			try {
				// Anonymous moderator: an RMT is present but no access token, isolating the RMT path.
				await openRoomRecordings(page, toRoomRecordingsUrl(room.access.anonymous.moderator.url));
				await expectRoomRecordingsListShown(page, recording.recordingId);

				ctrl.expireRoomMemberToken();
				await clickListRefresh(page);

				// The 401 is recovered by minting a fresh room member token; the list still renders.
				await expect.poll(() => ctrl.rmtMintCount(), { timeout: 15_000 }).toBeGreaterThan(0);
				expect(ctrl.blocked401Count()).toBeGreaterThan(0);
				await expectRoomRecordingsListShown(page, recording.recordingId);
				await expectNoLoginPage(page);
			} finally {
				await ctrl.dispose();
			}
		});

		test('expired RMT and access token: recovered by refreshing both', async ({ page }) => {
			const ctrl = await installTokenExpiryController(page);

			try {
				await authenticateAndOpenRecordingsList(page);
				await expectRoomRecordingsListShown(page, recording.recordingId);

				await ctrl.expireAccessToken();
				ctrl.expireRoomMemberToken();
				await clickListRefresh(page);

				await expect.poll(() => ctrl.rmtMintCount(), { timeout: 15_000 }).toBeGreaterThan(0);
				await expect.poll(() => ctrl.authRefreshCount(), { timeout: 15_000 }).toBeGreaterThan(0);
				await expectRoomRecordingsListShown(page, recording.recordingId);
				await expectNoLoginPage(page);
			} finally {
				await ctrl.dispose();
			}
		});

		test('expired RMT, access and refresh token: the session cannot be recovered', async ({ page }) => {
			const ctrl = await installTokenExpiryController(page);

			try {
				await authenticateAndOpenRecordingsList(page);
				await expectRoomRecordingsListShown(page, recording.recordingId);

				await ctrl.expireAccessToken();
				await ctrl.expireRefreshToken();
				ctrl.expireRoomMemberToken();
				await clickListRefresh(page);

				// The cascade mints a fresh RMT then tries to refresh the access token, which fails
				// (refresh token expired). With no way to recover, the recording is no longer accessible.
				await expect.poll(() => ctrl.authRefreshCount(), { timeout: 15_000 }).toBeGreaterThan(0);
				expect(ctrl.blocked401Count()).toBeGreaterThan(0);
				await expect(page.locator(`[id="play-recording-btn-${recording.recordingId}"]`)).toHaveCount(0, {
					timeout: 15_000
				});
			} finally {
				await ctrl.dispose();
			}
		});
	});

	// ── Individual recording (private shared link, view page) ────────────────────────

	test.describe('Individual recording refresh scenarios', () => {
		test('private shared link: an expired access token is refreshed', async ({ page }) => {
			const ctrl = await installTokenExpiryController(page);

			try {
				// A non-member user views via the private secret; reloading with an expired access token
				// makes the recording request 401, which is recovered by refreshing the access token.
				await openRecording(page, privateRecordingUrl, {
					login: { userId: nonMemberUser.userId, password: nonMemberUser.password }
				});
				await expectRecordingViewShown(page);

				await ctrl.expireAccessToken();
				await page.reload({ waitUntil: 'domcontentloaded' });

				await expect.poll(() => ctrl.authRefreshCount(), { timeout: 15_000 }).toBeGreaterThan(0);
				expect(ctrl.blocked401Count()).toBeGreaterThan(0);
				await expectRecordingViewShown(page);
				await expectNoLoginPage(page);
			} finally {
				await ctrl.dispose();
			}
		});

		test('private shared link: an expired refresh token ends the session', async ({ page }) => {
			const ctrl = await installTokenExpiryController(page);

			try {
				await openRecording(page, privateRecordingUrl, {
					login: { userId: nonMemberUser.userId, password: nonMemberUser.password }
				});
				await expectRecordingViewShown(page);

				await ctrl.expireAccessToken();
				await ctrl.expireRefreshToken();
				await page.reload({ waitUntil: 'domcontentloaded' });

				// The access token can no longer be refreshed, so the recording view never renders.
				await expect.poll(() => ctrl.authRefreshCount(), { timeout: 15_000 }).toBeGreaterThan(0);
				expect(ctrl.blocked401Count()).toBeGreaterThan(0);
				await expect(page.locator('ov-recording-video-player')).toHaveCount(0, { timeout: 15_000 });
			} finally {
				await ctrl.dispose();
			}
		});
	});
});
