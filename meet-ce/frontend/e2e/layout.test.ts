import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import {
	runScreenShareRotationCycles,
	selectMosaicLayout,
	selectSmartMosaicLayout,
	setSmartMosaicSliderValue
} from './helpers/layout.helper';
import { startScreensharing, stopScreensharing, toggleMicrophone } from './helpers/media-controls.helper';
import { createRoomAndGetAnonymousAccessUrl, createRoomMember, deleteRooms } from './helpers/meet-api.helper';
import { leaveMeeting, openMeeting } from './helpers/meeting-navigation.helper';
import { closeSettingsPanel, openLayoutSettingsPanel } from './helpers/panels.helper';
import { disconnectAllBrowserFakeParticipants, joinParticipants } from './helpers/participant-management.helper';
import {
	getVisibleRemoteParticipantNames,
	toggleStreamPin,
	waitForRemoteStream,
	waitForVisibleRemoteParticipants
} from './helpers/stream.helper';
import { expectHidden, expectVisible } from './helpers/ui-utils.helper';

test.describe('Layout E2E Tests', () => {
	const createdRoomIds: string[] = [];

	let roomId: string;
	let accessUrl: string;

	test.beforeEach(async () => {
		const { room, accessUrl: url } = await createRoomAndGetAnonymousAccessUrl();
		roomId = room.roomId;
		accessUrl = url;
		createdRoomIds.push(roomId);
	});

	test.afterEach(async () => {
		await disconnectAllBrowserFakeParticipants();
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test.describe('Meeting UI elements', () => {
		test.afterEach(async ({ page }) => {
			await leaveMeeting(page);
		});

		test('should show layout settings in settings panel', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await expect(page.locator('#more-options-btn')).toBeVisible();
			await page.locator('#more-options-btn').click();
			await expect(page.locator('#grid-layout-settings-btn')).toBeVisible();

			//close more options menu
			await page.locator('body').click();
		});

		test('should have smart-mosaic selected by default and show participant count of 4', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await openLayoutSettingsPanel(page);
			await expect(page.locator('#layout-smart-mosaic')).toContainClass('mat-mdc-radio-checked');
			await expect(page.locator('.participant-count-container')).toBeVisible();
			await expect(page.locator('.participant-count-value')).toHaveText('4');
		});

		test('should hide participant count container when mosaic layout is selected', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await openLayoutSettingsPanel(page);
			await expect(page.locator('.participant-count-container')).toBeVisible();
			await page.locator('#layout-mosaic').click();
			await expectHidden(page, '.participant-count-container');
		});

		test('should render share-link overlay when moderator after joining', async ({ page }) => {
			await openMeeting(page, accessUrl);

			await expect(page.locator('#layout')).toBeVisible();
			await expect(page.locator('#share-link-overlay')).toBeVisible();
			await expect(page.locator('.OV_stream_video.local')).toBeVisible();
		});

		test('should not render share-link overlay when speaker after joining', async ({ page }) => {
			const { accessUrl } = await createRoomMember(roomId, {
				name: `speaker-${Date.now()}`,
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			await openMeeting(page, accessUrl);

			await expect(page.locator('#layout')).toBeVisible();
			await expect(page.locator('.OV_stream_video.local')).toBeVisible();
			await expect(page.locator('#share-link-overlay')).toBeHidden();
		});
	});

	test.describe('Mosaic Layout', () => {
		test('should display all remote participants in mosaic layout without filtering', async ({ browser }) => {
			const prefix = `mosaic-all-${Date.now()}`;
			const { pageA, pages, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants: [
					{ name: `${prefix}-viewer`, audioEnabled: false, videoEnabled: true },
					{ name: `${prefix}-remote-a`, audioEnabled: false, videoEnabled: true, headless: true },
					{ name: `${prefix}-remote-b`, audioEnabled: false, videoEnabled: true, headless: true },
					{ name: `${prefix}-remote-c`, audioEnabled: false, videoEnabled: true, headless: true }
				]
			});

			try {
				await openLayoutSettingsPanel(pageA);
				await selectMosaicLayout(pageA);

				await waitForRemoteStream(pageA, 3);
				await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(3, { timeout: 15_000 });
				await expectHidden(pageA, 'ov-hidden-participants-indicator');
			} finally {
				await removeAllParticipants();
				await Promise.all(pages.map((page) => leaveMeeting(page)));
				await Promise.all(pages.map((page) => page.close()));
			}
		});

		test('should display screen sharing as pinned in mosaic layout', async ({ browser }) => {
			const prefix = `mosaic-screen-${Date.now()}`;
			const { pageA, pages, byName, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants: [
					{ name: `${prefix}-viewer`, audioEnabled: false, videoEnabled: true },
					{ name: `${prefix}-sharer`, audioEnabled: false, videoEnabled: true, headless: true },
					{ name: `${prefix}-remote-b`, audioEnabled: false, videoEnabled: true, headless: true }
				]
			});

			try {
				await openLayoutSettingsPanel(pageA);
				await selectMosaicLayout(pageA);

				await waitForRemoteStream(pageA, 2);

				await startScreensharing(byName[`${prefix}-sharer`]);

				await expect(pageA.locator('.OV_stream.remote.screen-source')).toHaveCount(1, { timeout: 20_000 });
				await waitForVisibleRemoteParticipants(
					pageA,
					{
						includes: [`${prefix}-sharer`, `${prefix}-sharer_SCREEN`, `${prefix}-remote-b`]
					},
					20_000
				);

				await stopScreensharing(byName[`${prefix}-sharer`]);
				await expect(pageA.locator('.OV_stream.remote.screen-source')).toHaveCount(0, { timeout: 20_000 });
				await waitForVisibleRemoteParticipants(
					pageA,
					{
						count: 2,
						includes: [`${prefix}-sharer`, `${prefix}-remote-b`]
					},
					20_000
				);
			} finally {
				await removeAllParticipants();
				await Promise.all(pages.map((page) => leaveMeeting(page)));
				await Promise.all(pages.map((page) => page.close()));
			}
		});

		test('should keep all participants visible after screen share stops in mosaic layout', async ({ browser }) => {
			const { pageA, pages, byName, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants: [
					{ name: 'local', audioEnabled: false, videoEnabled: true },
					{ name: 'remote-A', audioEnabled: false, videoEnabled: true, headless: true, screenShare: true },
					{ name: 'remote-B', audioEnabled: false, videoEnabled: true, headless: true, screenShare: true },
					{ name: 'remote-C', audioEnabled: false, videoEnabled: true, headless: true }
				]
			});

			try {
				await selectMosaicLayout(pageA);

				// All 3 remotes + 3 screen shares should be visible
				await waitForVisibleRemoteParticipants(pageA, {
					count: 3 + 2, // 3 remotes + 2 screen shares
					includes: [`remote-A`, `remote-A_SCREEN`, `remote-B`, `remote-B_SCREEN`, `remote-C`]
				});

				await selectSmartMosaicLayout(pageA);
				await waitForVisibleRemoteParticipants(pageA, {
					count: 3 + 2, // 3 remotes + 2 screen shares (never hide screen shares in smart mosaic)
					includes: [`remote-A_SCREEN`, `remote-B_SCREEN`]
				});

				await selectMosaicLayout(pageA);

				// All 3 remotes + 3 screen shares should be visible
				await waitForVisibleRemoteParticipants(pageA, {
					count: 3 + 2,
					includes: [`remote-A`, `remote-A_SCREEN`, `remote-B`, `remote-B_SCREEN`, `remote-C`]
				});
				// B stops screen sharing — DOM indices shift for later participants.
				// All remaining participants must stay visible.
				await stopScreensharing(byName[`remote-B`]);

				await waitForVisibleRemoteParticipants(pageA, {
					count: 3 + 1, // 3 remotes + 1 screen share
					includes: [`remote-A`, `remote-A_SCREEN`, `remote-B`, `remote-C`]
				});

				expect(await pageA.locator('.OV_stream.remote.screen-source').count()).toBe(1);
			} finally {
				await removeAllParticipants();
				await Promise.all(pages.map((page) => leaveMeeting(page)));
				await Promise.all(pages.map((page) => page.close()));
			}
		});

		test('should update participant count correctly after join and leave in mosaic layout', async ({ browser }) => {
			const prefix = `mosaic-joinleave-${Date.now()}`;
			const { pageA, pages, addParticipant, removeParticipant, removeAllParticipants } = await joinParticipants(
				browser,
				{
					roomId,
					participants: [
						{ name: `${prefix}-viewer`, audioEnabled: false, videoEnabled: true },
						{ name: `${prefix}-remote-a`, audioEnabled: false, videoEnabled: true, headless: true }
					]
				}
			);

			try {
				await openLayoutSettingsPanel(pageA);
				await selectMosaicLayout(pageA);

				await waitForRemoteStream(pageA, 1);
				await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(1, { timeout: 15_000 });

				await addParticipant({
					name: `${prefix}-remote-b`,
					audioEnabled: false,
					videoEnabled: true,
					headless: true
				});

				await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(2, { timeout: 20_000 });

				await removeParticipant(`${prefix}-remote-a`);
				await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(1, { timeout: 20_000 });
			} finally {
				await removeAllParticipants();
				await Promise.all(pages.map((page) => leaveMeeting(page)));
				await Promise.all(pages.map((page) => page.close()));
			}
		});
	});

	test.describe('Smart Mosaic Layout', () => {
		test.describe('Participant filter', () => {
			test('should filter out remote participants when the smart mosaic limit is reduced', async ({
				browser
			}) => {
				const prefix = `smart-filter-reduced-${Date.now()}`;
				const { pageA, pages, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants: [
						{ name: `${prefix}-viewer`, audioEnabled: true, videoEnabled: true },
						{ name: `${prefix}-remote-a`, audioEnabled: true, videoEnabled: true, headless: true },
						{ name: `${prefix}-remote-b`, audioEnabled: true, videoEnabled: true, headless: true }
					]
				});

				try {
					// Participant A should see 3 streams: 1 local + 2 remote
					await expect(pageA.locator('.OV_stream_video')).toHaveCount(3, { timeout: 20_000 });
					await expect(pageA.locator('.OV_stream_video.local')).toHaveCount(1);
					await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(2);

					// Open layout settings and reduce participant count to 1

					await setSmartMosaicSliderValue(pageA, 1);

					// Participant A should now see only 2 streams: 1 local + 1 remote
					await expect(pageA.locator('.OV_stream_video')).toHaveCount(2, { timeout: 15_000 });
					await expect(pageA.locator('.OV_stream_video.local')).toHaveCount(1);
					await expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(1);
					await expectVisible(pageA, 'ov-hidden-participants-indicator');
					await expect(
						pageA.locator('.hidden-participants-container .participant-count-value')
					).toContainText('+1');
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should restore hidden remote participants with active video when the smart mosaic limit is raised again', async ({
				browser
			}) => {
				const prefix = `smart-filter-restore-${Date.now()}`;
				const { pageA, pages, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants: [
						{ name: `${prefix}-viewer`, audioEnabled: true, videoEnabled: true },
						{ name: `${prefix}-remote-a`, audioEnabled: true, videoEnabled: true, headless: true },
						{ name: `${prefix}-remote-b`, audioEnabled: true, videoEnabled: true, headless: true },
						{ name: `${prefix}-remote-c`, audioEnabled: true, videoEnabled: true, headless: true }
					]
				});

				try {
					await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });

					await setSmartMosaicSliderValue(pageA, 2);
					await waitForRemoteStream(pageA, 2, { requireAudioTracks: true });
					await expect(
						pageA.locator('.hidden-participants-container .participant-count-value')
					).toContainText('+1');

					await setSmartMosaicSliderValue(pageA, 1);
					await waitForRemoteStream(pageA, 1, { requireAudioTracks: true });
					await expectVisible(pageA, 'ov-hidden-participants-indicator');
					await expect(
						pageA.locator('.hidden-participants-container .participant-count-value')
					).toContainText('+2');

					await setSmartMosaicSliderValue(pageA, 4);
					await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });
					await expectHidden(pageA, 'ov-hidden-participants-indicator');
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should filter remote participants after screen sharing', async ({ browser }) => {
				const prefix = `smart-screen-${Date.now()}`;
				const screenShareName = `${prefix}-screen-share`;
				const { pageA, pages, byName, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants: [
						{ name: `${prefix}-viewer`, audioEnabled: true, videoEnabled: true },
						{ name: screenShareName, audioEnabled: true, videoEnabled: true, headless: true },
						{ name: `${prefix}-remote-hidden`, audioEnabled: true, videoEnabled: true, headless: true }
					]
				});

				try {
					await Promise.all([
						startScreensharing(byName[screenShareName]),
						waitForRemoteStream(pageA, 3, { requireAudioTracks: true })
					]);

					await setSmartMosaicSliderValue(pageA, 1);

					// Expect 1 remote + screen share
					await waitForRemoteStream(pageA, 2, { requireAudioTracks: true });
					await expectVisible(pageA, '.OV_stream.remote.screen-source');

					await expectVisible(pageA, 'ov-hidden-participants-indicator');
					await expect(
						pageA.locator('.hidden-participants-container .participant-count-value')
					).toContainText('+1');

					await setSmartMosaicSliderValue(pageA, 2);

					await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });
					await expectHidden(pageA, 'ov-hidden-participants-indicator');
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});
		});

		test.describe('Screen sharing visibility', () => {
			test('should retain screen sharing participant regardless smart-mosaic limit', async ({ browser }) => {
				const participants = [
					{ name: 'local', audioEnabled: false },
					{ name: 'remote-screen', audioEnabled: false, headless: true }
				];
				const { pageA, pages, byName, addParticipant } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await setSmartMosaicSliderValue(pageA, 1);

					await startScreensharing(byName['remote-screen']);

					await waitForRemoteStream(pageA, 2, { requireAudioTracks: true }); // screen + 1 remote
					await expect(pageA.locator('.OV_stream.remote.screen-source')).toHaveCount(1, { timeout: 20_000 });

					expect(await pageA.locator('.OV_stream_video').count()).toBe(3); // local + remote + remote screen

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 2,
							includes: ['remote-screen', 'remote-screen_SCREEN']
						},
						20_000
					);

					await addParticipant({
						name: 'remote-speaker',
						audioEnabled: true,
						videoEnabled: true,
						headless: true
					});

					// await toggleMicrophone(byName['remote-speaker']);
					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 2,
							includes: ['remote-speaker', 'remote-screen_SCREEN'],
							excludes: ['remote-screen']
						},
						20_000
					);

					expect(await pageA.locator('.OV_stream_video').count()).toBe(3); // local + remote speaker + remote screen

					await stopScreensharing(byName['remote-screen']);
					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 1,
							includes: ['remote-speaker'],
							excludes: ['remote-screen']
						},
						20_000
					);

					expect(await pageA.locator('.OV_stream_video').count()).toBe(2); // local + remote speaker
				} finally {
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should show screen-sharing when joining an already active screen share with smart mosaic limit at 1', async ({
				browser
			}) => {
				const participants = [
					{ name: 'remote-screen', audioEnabled: false, screenShare: true, headless: true },
					{ name: 'remote-a', audioEnabled: false, headless: true },
					{ name: 'remote-b', audioEnabled: true, headless: true }
				];

				const { pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					const pageA = await addParticipant({
						name: 'local',
						audioEnabled: true,
						videoEnabled: true
					});

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 4,
							includes: ['remote-a', 'remote-b', 'remote-screen', 'remote-screen_SCREEN']
						},
						20_000
					);
					await setSmartMosaicSliderValue(pageA, 1);

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 2,
							includes: ['remote-b', 'remote-screen_SCREEN']
						},
						20_000
					);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should show two screen-sharing when joining an already active screen share with smart mosaic limit at 1', async ({
				browser
			}) => {
				const participants = [
					{ name: 'remote-screen', audioEnabled: false, screenShare: true, headless: true },
					{ name: 'remote-a', audioEnabled: false, screenShare: true, headless: true },
					{ name: 'remote-b', audioEnabled: true, headless: true }
				];

				const { pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					const pageA = await addParticipant({
						name: 'local',
						audioEnabled: true,
						videoEnabled: true
					});

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 5,
							includes: [
								'remote-a',
								'remote-a_SCREEN',
								'remote-b',
								'remote-screen',
								'remote-screen_SCREEN'
							]
						},
						20_000
					);
					await setSmartMosaicSliderValue(pageA, 1);

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 3,
							includes: ['remote-b', 'remote-a_SCREEN', 'remote-screen_SCREEN']
						},
						20_000
					);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should show a screen-sharing participant over silent ones', async ({ browser }) => {
				const participants = [
					{ name: 'local', audioEnabled: false },
					{ name: 'remote-b', audioEnabled: false, headless: true },
					{ name: 'remote-c', audioEnabled: false, headless: true }
				];
				const { pageA, pages, byName, addParticipant, removeAllParticipants } = await joinParticipants(
					browser,
					{
						roomId,
						participants
					}
				);

				try {
					await setSmartMosaicSliderValue(pageA, 2);

					await waitForVisibleRemoteParticipants(pageA, {
						count: 2,
						includes: ['remote-b', 'remote-c']
					});

					await addParticipant({
						name: 'remote-screen',
						audioEnabled: false,
						headless: true
					});

					await startScreensharing(byName['remote-screen']);
					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 3,
							includes: ['remote-b', 'remote-c', 'remote-screen_SCREEN'],
							excludes: ['remote-screen']
						},
						20_000
					);

					const participantCount = await pageA.locator('.OV_stream_video').count();
					expect(participantCount).toBe(4);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should exclude screen-sharing stream of rotation logic', async ({ browser }) => {
				const participants = [
					{ name: `local`, audioEnabled: false },
					{ name: 'remote-a', audioEnabled: false, headless: true },
					{ name: 'remote-b', audioEnabled: false, headless: true }
				];

				const { pageA, pages, byName } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await waitForRemoteStream(pageA, 2); //2 remotes
					await setSmartMosaicSliderValue(pageA, 1);

					await waitForRemoteStream(pageA, 1); //1 remote

					await startScreensharing(byName['remote-b']);

					await expect(pageA.locator('.OV_stream.remote.screen-source')).toHaveCount(1, { timeout: 20_000 });

					await runScreenShareRotationCycles(pageA, byName, 'remote-a', 'remote-b', 'remote-b', 5);
				} finally {
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});
		});

		test.describe('Hidden participants indicator', () => {
			test('should show hidden participants indicator when remote participants exceed the visible limit', async ({
				browser
			}) => {
				const { pageA, pages, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants: [
						{ name: 'viewer', audioEnabled: true, videoEnabled: true },
						{ name: 'remote-a', audioEnabled: true, videoEnabled: true, headless: true },
						{ name: 'remote-b', audioEnabled: true, videoEnabled: true, headless: true }
					]
				});

				try {
					// Limit to 1 visible remote on A's view: 2 remotes present, 1 is hidden
					await setSmartMosaicSliderValue(pageA, 1);
					await waitForRemoteStream(pageA, 1, { requireAudioTracks: true });

					// The hidden participants indicator must be present and show "+1 more participant"
					await Promise.all([
						expect(pageA.locator('ov-hidden-participants-indicator')).toBeVisible({ timeout: 10_000 }),
						expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText(
							'+1'
						)
					]);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should switch indicator to standard mode when the visible remote participant is pinned', async ({
				browser
			}) => {
				const { pageA, pages, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants: [
						{ name: 'viewer', audioEnabled: true, videoEnabled: true },
						{ name: 'remote-a', audioEnabled: true, videoEnabled: true, headless: true },
						{ name: 'remote-b', audioEnabled: false, videoEnabled: true, headless: true }
					]
				});

				try {
					// Set limit to 1 so the indicator appears in topbar mode initially

					await setSmartMosaicSliderValue(pageA, 1);
					await expectVisible(pageA, '.hidden-participants-container.horizontal');

					// Close the layout settings panel before interacting with the layout streams
					await closeSettingsPanel(pageA);
					await expectHidden(pageA, '#settings-container');

					// Pin the visible remote participant: hasPinnedParticipant becomes true
					// → showTopBarHiddenParticipantsIndicator() returns false → indicator moves to OV_last
					await toggleStreamPin(pageA, '.OV_stream_video.remote');
					await Promise.all([
						expectVisible(pageA, '.hidden-participants-container.vertical'),
						expectHidden(pageA, '.hidden-participants-container.horizontal')
					]);
					await toggleStreamPin(pageA, '.OV_stream_video.remote');
					await Promise.all([
						expectVisible(pageA, '.hidden-participants-container.horizontal'),
						expectHidden(pageA, '.hidden-participants-container.vertical')
					]);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should hide the indicator when switching from smart mosaic to standard mosaic layout', async ({
				browser
			}) => {
				const { pageA, pages, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants: [
						{ name: 'viewer', audioEnabled: true, videoEnabled: true },
						{ name: 'remote-a', audioEnabled: true, videoEnabled: true, headless: true },
						{ name: 'remote-b', audioEnabled: true, videoEnabled: true, headless: true }
					]
				});

				try {
					// Set limit to 1 so the hidden indicator appears

					await setSmartMosaicSliderValue(pageA, 1);
					await Promise.all([
						expect(pageA.locator('ov-hidden-participants-indicator')).toBeVisible({ timeout: 10_000 }),
						expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(1, { timeout: 15_000 })
					]);

					// Switch to standard mosaic: all remotes become visible, indicator must disappear
					await selectMosaicLayout(pageA);
					await Promise.all([
						expectHidden(pageA, 'ov-hidden-participants-indicator'),
						expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(2, { timeout: 15_000 })
					]);

					await selectSmartMosaicLayout(pageA);
					await waitForRemoteStream(pageA, 1, { requireAudioTracks: true });
					await Promise.all([
						expect(pageA.locator('ov-hidden-participants-indicator')).toBeVisible({ timeout: 10_000 }),
						expect(pageA.locator('.OV_stream_video.remote')).toHaveCount(1, { timeout: 15_000 })
					]);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should update indicator count correctly when the smart mosaic limit is raised', async ({
				browser
			}) => {
				const { pageA, pages, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants: [
						{ name: 'viewer', audioEnabled: true, videoEnabled: true },
						{ name: 'remote-a', audioEnabled: true, videoEnabled: true, headless: true },
						{ name: 'remote-b', audioEnabled: true, videoEnabled: true, headless: true },
						{ name: 'remote-c', audioEnabled: true, videoEnabled: true, headless: true }
					]
				});

				try {
					// Limit 1: 3 remotes present, 1 visible, 2 hidden → indicator shows "+2"

					await setSmartMosaicSliderValue(pageA, 1);
					await expect(
						pageA.locator('.hidden-participants-container .participant-count-value')
					).toContainText('+2', {
						timeout: 10_000
					});

					// Raise limit to 2: 2 visible, 1 hidden → indicator shows "+1"
					await setSmartMosaicSliderValue(pageA, 2);
					await expect(
						pageA.locator('.hidden-participants-container .participant-count-value')
					).toContainText('+1', {
						timeout: 10_000
					});
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});
		});

		test.describe('Speaker priority', () => {
			test('should prioritize an active speaker over a muted remote participant when the limit is 1', async ({
				browser
			}) => {
				const participants = [
					{ name: 'local', audioEnabled: false },
					{ name: 'remote-a', audioEnabled: false, headless: true },
					{ name: 'remote-b', audioEnabled: false, headless: true }
				];
				const { pageA, pages, byName, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await setSmartMosaicSliderValue(pageA, 1);
					await waitForVisibleRemoteParticipants(pageA, { count: 1 });

					await toggleMicrophone(byName['remote-a']);

					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: ['remote-a'],
						excludes: ['remote-b']
					});
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should keep the two most recent active speakers visible when the limit is exceeded', async ({
				browser
			}) => {
				const participants = [
					{ name: 'local', audioEnabled: false },
					{ name: 'remote-a', audioEnabled: true, headless: true },
					{ name: 'remote-b', audioEnabled: false, headless: true },
					{ name: 'remote-c', audioEnabled: false, headless: true }
				];
				const { pageA, pages, byName } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await setSmartMosaicSliderValue(pageA, 2);

					await waitForVisibleRemoteParticipants(pageA, {
						count: 2,
						includes: ['remote-a']
					});

					await Promise.all([
						toggleMicrophone(byName['remote-a']),
						toggleMicrophone(byName['remote-b']),
						toggleMicrophone(byName['remote-c'])
					]);

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 2,
							includes: ['remote-b', 'remote-c'],
							excludes: ['remote-a']
						},
						20_000
					);
				} finally {
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should display the three active remote speakers and keep silent participants hidden when the limit is 3', async ({
				browser
			}) => {
				const participants = [
					{ name: 'local', audioEnabled: false },
					{ name: 'remote-a', audioEnabled: true, headless: true },
					{ name: 'remote-b', audioEnabled: false, headless: true },
					{ name: 'remote-c', audioEnabled: false, headless: true },
					{ name: 'remote-d', audioEnabled: false, headless: true }
				];
				const { pageA, pages, byName, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants,
					mode: 'parallel'
				});

				try {
					await setSmartMosaicSliderValue(pageA, 3);

					await waitForVisibleRemoteParticipants(pageA, { includes: ['remote-a'] }, 20_000);

					// Ensure remote-a has accumulated ≥ MIN_SPEAKING_DURATION_MS (2s) so it enters
					// _speakerPriorityOrder before the toggle. Otherwise, in parallel join mode
					// where remote-a may be a filler rather than the qualified speaker, toggling
					// before it qualifies prevents it from being preserved in the priority tail.
					await pageA.waitForTimeout(3_000);

					await Promise.all([
						toggleMicrophone(byName['remote-a']),
						toggleMicrophone(byName['remote-b']),
						toggleMicrophone(byName['remote-c'])
					]);

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 3,
							includes: ['remote-a', 'remote-b', 'remote-c'],
							excludes: ['remote-d']
						},
						20_000
					);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should keep the first visible speaker stable when another continuous speaker becomes active at limit 1', async ({
				browser
			}) => {
				const participants = [
					{ name: 'local', audioEnabled: false },
					{ name: 'remote-a', audioEnabled: false, headless: true },
					{ name: 'remote-b', audioEnabled: false, headless: true }
				];
				const { pageA, pages, byName } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await setSmartMosaicSliderValue(pageA, 1);
					await toggleMicrophone(byName['remote-a']);
					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: ['remote-a'],
						excludes: ['remote-b']
					});

					await toggleMicrophone(byName['remote-b']);

					for (let i = 0; i < 5; i++) {
						await waitForVisibleRemoteParticipants(pageA, {
							count: 1,
							includes: ['remote-a'],
							excludes: ['remote-b']
						});
						await pageA.waitForTimeout(500);
					}
				} finally {
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should prioritize a newly joined speaking participant over already connected silent participants', async ({
				browser
			}) => {
				const participants = [
					{ name: 'local', audioEnabled: false },
					{ name: 'remote-a', audioEnabled: false, headless: true },
					{ name: 'remote-b', audioEnabled: false, headless: true }
				];
				const { pageA, pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await setSmartMosaicSliderValue(pageA, 1);

					await waitForVisibleRemoteParticipants(pageA, { count: 1 });

					const newSpeakerName = 'remote-c';
					await addParticipant({
						name: newSpeakerName,
						audioEnabled: true,
						videoEnabled: true,
						headless: true
					});

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 1,
							includes: [newSpeakerName],
							excludes: ['remote-a', 'remote-b']
						},
						20_000
					);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});
		});

		test.describe('Participant Join/Leave Handling', () => {
			test('should update visible participants when an active speaker leaves', async ({ browser }) => {
				const participants = [
					{ name: 'local', audioEnabled: false },
					{ name: 'remote-a', audioEnabled: true, headless: true },
					{ name: 'remote-b', audioEnabled: false, headless: true },
					{ name: 'remote-c', audioEnabled: false, headless: true }
				];
				const { pageA, pages, byName, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await setSmartMosaicSliderValue(pageA, 1);

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 1,
							includes: ['remote-a']
						},
						20_000
					);

					await leaveMeeting(byName['remote-a']);
					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 1,
							excludes: ['remote-a']
						},
						20_000
					);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should not promote newly joined silent participants when a speaker is already visible', async ({
				browser
			}) => {
				const participants = [
					{ name: 'local', audioEnabled: false },
					{ name: 'remote-a', audioEnabled: true, headless: true },
					{ name: 'remote-b', audioEnabled: false, headless: true }
				];
				const { pageA, pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await setSmartMosaicSliderValue(pageA, 1);

					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: ['remote-a'],
						excludes: ['remote-b']
					});

					const lateSilentName = 'remote-c';
					await addParticipant({
						name: lateSilentName,
						audioEnabled: false,
						videoEnabled: true,
						headless: true
					});

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 1,
							includes: ['remote-a'],
							excludes: ['remote-b', 'remote-c']
						},
						20_000
					);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});
		});

		test.describe('Audio Level and Duration Filtering', () => {
			test('should keep the layout stable when a low-volume participant joins', async ({ browser }) => {
				const participants = [{ name: 'local', audioEnabled: false }];
				const { pageA, pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await setSmartMosaicSliderValue(pageA, 1);
					await addParticipant({
						name: 'remote-silence',
						headless: true,
						audioFile: 'complete_silence.wav'
					});
					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: ['remote-silence']
					});

					await addParticipant({
						name: 'remote-low',
						headless: true,
						audioFile: 'low_volume_speech.wav'
					});

					await pageA.waitForTimeout(4_000);

					for (let i = 0; i < 5; i++) {
						await waitForVisibleRemoteParticipants(pageA, {
							count: 1,
							includes: ['remote-silence'],
							excludes: ['remote-low']
						});

						await pageA.waitForTimeout(500);
					}
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should remain stable with multiple low-volume speakers', async ({ browser }) => {
				const participants = [{ name: 'local', audioEnabled: false }];
				const { pageA, pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await setSmartMosaicSliderValue(pageA, 1);
					await addParticipant({
						name: 'remote-silence',
						headless: true,
						audioFile: 'complete_silence.wav'
					});

					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: ['remote-silence']
					});

					await Promise.all([
						addParticipant({
							name: 'remote-low-a',
							headless: true,
							audioFile: 'ambient_pink_noise.wav'
						}),
						addParticipant({
							name: 'remote-low-b',
							headless: true,
							audioFile: 'ambient_pink_noise.wav'
						})
					]);

					await pageA.waitForTimeout(3_000);

					const initialVisibleNames = await getVisibleRemoteParticipantNames(pageA);
					let previousNames = [...initialVisibleNames];
					let swapCount = 0;

					for (let i = 0; i < 5; i++) {
						await pageA.waitForTimeout(500);
						const currentNames = await getVisibleRemoteParticipantNames(pageA);

						const hasSwap = !previousNames.every((name) => currentNames.includes(name));

						if (hasSwap) {
							swapCount += 1;
						}

						previousNames = [...currentNames];
					}

					expect(swapCount).toBe(0);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should filter out brief sounds under minimum duration', async ({ browser }) => {
				const participants = [{ name: 'local', audioEnabled: false }];
				const { pageA, pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await setSmartMosaicSliderValue(pageA, 1);
					await addParticipant({
						name: 'remote-silence',
						headless: true,
						audioFile: 'complete_silence.wav'
					});

					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: ['remote-silence'],
						excludes: ['remote-cough']
					});

					await addParticipant({
						name: 'remote-cough',
						headless: true,
						audioFile: 'brief_cough_at_5s.wav'
					});

					await pageA.waitForTimeout(5_000);

					for (let i = 0; i < 5; i++) {
						await waitForVisibleRemoteParticipants(pageA, {
							count: 1,
							includes: ['remote-silence'],
							excludes: ['remote-cough']
						});
						await pageA.waitForTimeout(500);
					}
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should not swap to a speaker that only produces a one-second burst', async ({ browser }) => {
				const participants = [{ name: 'local', audioEnabled: false }];
				const { pageA, pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await setSmartMosaicSliderValue(pageA, 1);
					await addParticipant({
						name: 'remote-silence',
						headless: true,
						audioFile: 'complete_silence.wav'
					});

					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: ['remote-silence'],
						excludes: ['remote-brief']
					});

					await addParticipant({
						name: 'remote-brief',
						headless: true,
						audioFile: 'brief_sound_1s_at_5s.wav'
					});

					await pageA.waitForTimeout(5_000);

					for (let i = 0; i < 5; i++) {
						await waitForVisibleRemoteParticipants(pageA, {
							count: 1,
							includes: ['remote-silence'],
							excludes: ['remote-brief']
						});
						await pageA.waitForTimeout(500);
					}
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});
		});

		test.describe('Mute participants', () => {
			test('should keep a muted participant visible after muting and unmuting cycles', async ({ browser }) => {
				const participants = [
					{ name: 'local', audioEnabled: false },
					{ name: 'remote-a', audioEnabled: true, headless: true },
					{ name: 'remote-b', audioEnabled: false, headless: true }
				];
				const { pageA, pages, byName } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await setSmartMosaicSliderValue(pageA, 1);

					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: ['remote-a'],
						excludes: ['remote-b']
					});

					await Promise.all([toggleMicrophone(byName['remote-a']), toggleMicrophone(byName['remote-b'])]);

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 1,
							includes: ['remote-b'],
							excludes: ['remote-a']
						},
						20_000
					);

					await toggleMicrophone(byName['remote-a']);

					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: ['remote-b']
					});
				} finally {
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should hide a participant when they become audio-muted and promote the other active speaker', async ({
				browser
			}) => {
				const participants = [
					{ name: 'local', audioEnabled: false },
					{ name: 'remote-a', audioEnabled: false },
					{ name: 'remote-b', audioEnabled: false }
				];
				const { pageA, pages, byName } = await joinParticipants(browser, {
					roomId,
					participants
				});

				try {
					await setSmartMosaicSliderValue(pageA, 1);

					await toggleMicrophone(byName['remote-a']);
					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: ['remote-a'],
						excludes: ['remote-b']
					});

					await toggleMicrophone(byName['remote-b']);
					await pageA.waitForTimeout(1_000);

					await toggleMicrophone(byName['remote-a']);

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 1,
							includes: ['remote-b'],
							excludes: ['remote-a']
						},
						20_000
					);
				} finally {
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});
		});

		test.describe('Smart Mosaic Layout Edge Cases', () => {
			test('should keep remaining participants visible when a displayed participant disconnects and budget decreases', async ({
				browser
			}) => {
				const prefix = `edge-netremoval-${Date.now()}`;
				const { pageA, pages, removeParticipant, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants: [
						{ name: `${prefix}-viewer`, audioEnabled: false, videoEnabled: true },
						{ name: `${prefix}-A`, audioEnabled: true, videoEnabled: true, headless: true },
						{ name: `${prefix}-B`, audioEnabled: true, videoEnabled: true, headless: true },
						{ name: `${prefix}-C`, audioEnabled: true, videoEnabled: true, headless: true },
						{ name: `${prefix}-D`, audioEnabled: false, videoEnabled: true, headless: true }
					]
				});

				try {
					// Set limit to 3 so A, B, C are visible, D is hidden
					await setSmartMosaicSliderValue(pageA, 3);
					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 3,
							includes: [`${prefix}-A`, `${prefix}-B`, `${prefix}-C`],
							excludes: [`${prefix}-D`]
						},
						20_000
					);

					// Remove A (interior position) and simultaneously reduce budget to 2
					// This creates a net-removal scenario: departures exceed arrivals in syncDisplayOrder
					await removeParticipant(`${prefix}-A`);
					await setSmartMosaicSliderValue(pageA, 2);

					// B and C (or B/C + promoted D) must remain visible without layout errors
					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 2,
							excludes: [`${prefix}-A`]
						},
						20_000
					);

					// Verify that the remaining visible participants have active video
					await waitForRemoteStream(pageA, 2);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should handle multiple simultaneous disconnects without breaking the layout', async ({ browser }) => {
				const prefix = `edge-multidisconnect-${Date.now()}`;
				const { pageA, pages, removeParticipant, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants: [
						{ name: `${prefix}-viewer`, audioEnabled: false, videoEnabled: true },
						{ name: `${prefix}-A`, audioEnabled: true, videoEnabled: true, headless: true },
						{ name: `${prefix}-B`, audioEnabled: true, videoEnabled: true, headless: true },
						{ name: `${prefix}-C`, audioEnabled: true, videoEnabled: true, headless: true },
						{ name: `${prefix}-D`, audioEnabled: true, videoEnabled: true, headless: true }
					]
				});

				try {
					await setSmartMosaicSliderValue(pageA, 4);
					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 4,
							includes: [`${prefix}-A`, `${prefix}-B`, `${prefix}-C`, `${prefix}-D`]
						},
						20_000
					);

					// Remove two interior participants simultaneously — forces syncDisplayOrder to
					// handle multiple splice shifts
					await Promise.all([removeParticipant(`${prefix}-B`), removeParticipant(`${prefix}-C`)]);

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 2,
							includes: [`${prefix}-A`, `${prefix}-D`],
							excludes: [`${prefix}-B`, `${prefix}-C`]
						},
						20_000
					);

					await waitForRemoteStream(pageA, 2);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});

			test('should remain stable when switching from mosaic to smart mosaic after screen share stops', async ({
				browser
			}) => {
				const prefix = `edge-switch-screen-${Date.now()}`;
				const { pageA, pages, byName, removeAllParticipants } = await joinParticipants(browser, {
					roomId,
					participants: [
						{ name: `${prefix}-viewer`, audioEnabled: false, videoEnabled: true },
						{
							name: `${prefix}-sharer`,
							audioEnabled: true,
							videoEnabled: true,
							headless: true,
							screenShare: true
						},
						{ name: `${prefix}-remote-b`, audioEnabled: false, videoEnabled: true, headless: true }
					]
				});

				try {
					// Start in mosaic mode — all participants and screen share visible
					await openLayoutSettingsPanel(pageA);
					await selectMosaicLayout(pageA);

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							includes: [`${prefix}-sharer`, `${prefix}-sharer_SCREEN`, `${prefix}-remote-b`]
						},
						20_000
					);

					// Stop screen sharing while in mosaic mode — triggers DOM reorder in orderedStreams
					await stopScreensharing(byName[`${prefix}-sharer`]);
					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 2,
							includes: [`${prefix}-sharer`, `${prefix}-remote-b`]
						},
						20_000
					);

					// Switch to smart mosaic — the displayedCameraOrder is fresh, no stale entries
					await selectSmartMosaicLayout(pageA);
					await setSmartMosaicSliderValue(pageA, 1);

					await waitForVisibleRemoteParticipants(
						pageA,
						{
							count: 1
						},
						20_000
					);

					await waitForRemoteStream(pageA, 1);
				} finally {
					await removeAllParticipants();
					await Promise.all(pages.map((page) => leaveMeeting(page)));
					await Promise.all(pages.map((page) => page.close()));
				}
			});
		});
	});

	test.describe('Mosaic Layout and Smart Mosaic Layout Switching', () => {
		test('should filter remote participants after switching from mosaic to smart mosaic', async ({ browser }) => {
			const { pageA, pages, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants: [
					{ name: 'viewer', audioEnabled: true, videoEnabled: true },
					{ name: 'remote-a', audioEnabled: true, videoEnabled: true, headless: true },
					{ name: 'remote-b', audioEnabled: true, videoEnabled: true, headless: true },
					{ name: 'remote-c', audioEnabled: true, videoEnabled: true, headless: true }
				]
			});

			try {
				await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });

				await setSmartMosaicSliderValue(pageA, 2);
				await waitForRemoteStream(pageA, 2, { requireAudioTracks: true });
				await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText(
					'+1'
				);

				// Switch to mosaic and verify all remotes are visible
				await selectMosaicLayout(pageA);
				await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });
				await expectHidden(pageA, 'ov-hidden-participants-indicator');

				// Switch back to smart mosaic and verify the previous limit is applied (2 visible remotes, 1 hidden)
				await selectSmartMosaicLayout(pageA);
				await waitForRemoteStream(pageA, 2, { requireAudioTracks: true });
				await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText(
					'+1'
				);

				await setSmartMosaicSliderValue(pageA, 1);
				await waitForRemoteStream(pageA, 1, { requireAudioTracks: true });
				await expectVisible(pageA, 'ov-hidden-participants-indicator');
				await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText(
					'+2'
				);

				await setSmartMosaicSliderValue(pageA, 4);
				await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });
				await expectHidden(pageA, 'ov-hidden-participants-indicator');
			} finally {
				await removeAllParticipants();
				await Promise.all(pages.map((page) => leaveMeeting(page)));
				await Promise.all(pages.map((page) => page.close()));
			}
		});

		test('should maintain the same visible participants when switching between mosaic and smart mosaic', async ({
			browser
		}) => {
			const { pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants: [
					{ name: 'remote-a', audioEnabled: true, videoEnabled: true, screenShare: true, headless: true },
					{ name: 'remote-b', audioEnabled: true, videoEnabled: true, headless: true }
				]
			});

			try {
				await waitForRemoteStream(pages[1], 2);

				const pageA = await addParticipant({ name: 'local', audioEnabled: true, videoEnabled: true });

				await waitForVisibleRemoteParticipants(pageA, {
					count: 3,
					includes: ['remote-a', 'remote-b', 'remote-a_SCREEN']
				});

				// Switch to mosaic and verify the same participants are visible
				await selectMosaicLayout(pageA);
				await pageA.waitForTimeout(1_000);
				await waitForVisibleRemoteParticipants(pageA, {
					count: 3,
					includes: ['remote-a', 'remote-b', 'remote-a_SCREEN']
				});

				// Switch back to smart mosaic and verify the same participants are visible
				await selectSmartMosaicLayout(pageA);
				await pageA.waitForTimeout(1_000);
				await waitForVisibleRemoteParticipants(pageA, {
					count: 3,
					includes: ['remote-a', 'remote-b', 'remote-a_SCREEN']
				});
			} finally {
				await removeAllParticipants();
				await Promise.all(pages.map((page) => leaveMeeting(page)));
				await Promise.all(pages.map((page) => page.close()));
			}
		});
	});
});
