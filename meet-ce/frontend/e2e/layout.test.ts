import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { selectMosaicLayout, selectSmartMosaicLayout, setSmartMosaicSliderValue } from './helpers/layout.helper';
import { createRoomAndGetAnonymousAccessUrl, createRoomMember, deleteRooms } from './helpers/meet-api.helper';
import {
	closeSettingsPanel,
	disconnectAllBrowserFakeParticipants,
	expectHidden,
	expectVisible,
	getVisibleRemoteParticipantNames,
	joinParticipants,
	leaveMeeting,
	openLayoutSettingsPanel,
	openMeeting,
	startScreensharing,
	stopScreensharing,
	toggleMicrophone,
	toggleStreamPin,
	waitForRemoteStream,
	waitForVisibleRemoteParticipants
} from './helpers/meeting-ui.helper';

let roomId: string;
let accessUrl: string;

test.beforeAll(async () => {
	const { room, accessUrl: url } = await createRoomAndGetAnonymousAccessUrl();
	roomId = room.roomId;
	accessUrl = url;
});

test.afterAll(async () => {
	await deleteRooms([roomId]);
});

test.afterEach(async () => {
	await disconnectAllBrowserFakeParticipants();
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
	// screen sharing pinned
	// show grid participant
});

test.describe('Smart Mosaic Layout', () => {
	test.describe('Participant filter', () => {
		test('should filter out remote participants when the smart mosaic limit is reduced', async ({ browser }) => {
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
				await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText(
					'+1'
				);
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
				await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText(
					'+1'
				);

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
			const prefix = `screen-share-retain-${Date.now()}`;
			const remoteScreenShareName = `${prefix}-remote-a`;
			const remoteSpeakerName = `${prefix}-remote-b`;
			const participants = [
				{ name: `${prefix}-viewer`, audioEnabled: false },
				{ name: remoteScreenShareName, audioEnabled: false, headless: true }
			];
			const { pageA, pages, byName } = await joinParticipants(browser, {
				roomId,
				participants
			});

			try {
				await setSmartMosaicSliderValue(pageA, 1);

				await startScreensharing(byName[remoteScreenShareName]);

				await waitForRemoteStream(pageA, 2, { requireAudioTracks: true });
				await expect(pageA.locator('.OV_stream.remote.screen-source')).toHaveCount(1, { timeout: 20_000 });

				let visibleNames = await getVisibleRemoteParticipantNames(pageA);
				let participantCount = await pageA.locator('.OV_stream_video').count();
				expect(visibleNames).toContain(remoteScreenShareName);
				expect(visibleNames).toContain(`${remoteScreenShareName}_SCREEN`);
				expect(participantCount).toBe(3);

				const { byName: lateJoinByName } = await joinParticipants(browser, {
					roomId,
					participants: [{ name: remoteSpeakerName, audioEnabled: false, headless: true }],
					skipInitialRemoteCountCheck: true
				});
				const lateSpeakerPage = lateJoinByName[remoteSpeakerName];
				pages.push(lateSpeakerPage);
				byName[remoteSpeakerName] = lateSpeakerPage;

				await toggleMicrophone(byName[remoteSpeakerName]);
				await waitForVisibleRemoteParticipants(
					pageA,
					{
						includes: [remoteSpeakerName, `${remoteScreenShareName}_SCREEN`],
						excludes: [remoteScreenShareName]
					},
					20_000
				);

				visibleNames = await getVisibleRemoteParticipantNames(pageA);
				participantCount = await pageA.locator('.OV_stream_video').count();
				expect(visibleNames).toContain(remoteSpeakerName);
				expect(visibleNames).not.toContain(remoteScreenShareName);
				expect(visibleNames).toContain(`${remoteScreenShareName}_SCREEN`);
				expect(participantCount).toBe(3);

				await stopScreensharing(byName[remoteScreenShareName]);
				await waitForVisibleRemoteParticipants(
					pageA,
					{
						count: 1,
						includes: [remoteSpeakerName],
						excludes: [remoteScreenShareName]
					},
					20_000
				);

				visibleNames = await getVisibleRemoteParticipantNames(pageA);
				participantCount = await pageA.locator('.OV_stream_video').count();
				expect(visibleNames).toContain(remoteSpeakerName);
				expect(visibleNames).not.toContain(remoteScreenShareName);
				expect(participantCount).toBe(2);
			} finally {
				await Promise.all(pages.map((page) => leaveMeeting(page)));
				await Promise.all(pages.map((page) => page.close()));
			}
		});

		test('should show a screen-sharing participant over silent ones', async ({ browser }) => {
			const prefix = `screen-share-over-silent-${Date.now()}`;
			const remoteScreenShareName = `${prefix}-remote-a`;
			const remoteSilentBName = `${prefix}-remote-b`;
			const remoteSilentCName = `${prefix}-remote-c`;
			const participants = [
				{ name: `${prefix}-viewer`, audioEnabled: false },
				{ name: remoteSilentBName, audioEnabled: false, headless: true },
				{ name: remoteSilentCName, audioEnabled: false, headless: true }
			];
			const { pageA, pages, byName, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants
			});

			try {
				await setSmartMosaicSliderValue(pageA, 2);

				const { byName: lateJoinByName } = await joinParticipants(browser, {
					roomId,
					participants: [{ name: remoteScreenShareName, audioEnabled: false, headless: true }],
					skipInitialRemoteCountCheck: true
				});
				const lateScreenSharePage = lateJoinByName[remoteScreenShareName];
				pages.push(lateScreenSharePage);
				byName[remoteScreenShareName] = lateScreenSharePage;

				await startScreensharing(byName[remoteScreenShareName]);
				await waitForVisibleRemoteParticipants(
					pageA,
					{
						includes: [remoteScreenShareName, `${remoteScreenShareName}_SCREEN`],
						excludes: [remoteSilentBName, remoteSilentCName]
					},
					20_000
				);

				const visibleNames = await getVisibleRemoteParticipantNames(pageA);
				const participantCount = await pageA.locator('.OV_stream_video').count();
				expect(visibleNames).toContain(remoteScreenShareName);
				expect(visibleNames).toContain(`${remoteScreenShareName}_SCREEN`);
				expect(participantCount).toBe(3);
			} finally {
				await removeAllParticipants();
				await Promise.all(pages.map((page) => leaveMeeting(page)));
				await Promise.all(pages.map((page) => page.close()));
			}
		});
	});

	test.describe('Hidden participants indicator', () => {
		test('should show hidden participants indicator when remote participants exceed the visible limit', async ({
			browser
		}) => {
			const prefix = `hidden-indicator-${Date.now()}`;
			const { pageA, pages, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants: [
					{ name: `${prefix}-viewer`, audioEnabled: true, videoEnabled: true },
					{ name: `${prefix}-remote-a`, audioEnabled: true, videoEnabled: true, headless: true },
					{ name: `${prefix}-remote-b`, audioEnabled: true, videoEnabled: true, headless: true }
				]
			});

			try {
				// Limit to 1 visible remote on A's view: 2 remotes present, 1 is hidden
				await setSmartMosaicSliderValue(pageA, 1);
				await waitForRemoteStream(pageA, 1, { requireAudioTracks: true });

				// The hidden participants indicator must be present and show "+1 more participant"
				await Promise.all([
					expect(pageA.locator('ov-hidden-participants-indicator')).toBeVisible({ timeout: 10_000 }),
					expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+1')
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
			const prefix = `hidden-pin-${Date.now()}`;
			const { pageA, pages, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants: [
					{ name: `${prefix}-viewer`, audioEnabled: true, videoEnabled: true },
					{ name: `${prefix}-remote-a`, audioEnabled: true, videoEnabled: true, headless: true },
					{ name: `${prefix}-remote-b`, audioEnabled: true, videoEnabled: true, headless: true }
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
			const prefix = `hidden-mosaic-${Date.now()}`;
			const { pageA, pages, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants: [
					{ name: `${prefix}-viewer`, audioEnabled: true, videoEnabled: true },
					{ name: `${prefix}-remote-a`, audioEnabled: true, videoEnabled: true, headless: true },
					{ name: `${prefix}-remote-b`, audioEnabled: true, videoEnabled: true, headless: true }
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

		test('should update indicator count correctly when the smart mosaic limit is raised', async ({ browser }) => {
			const prefix = `hidden-count-${Date.now()}`;
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
				// Limit 1: 3 remotes present, 1 visible, 2 hidden → indicator shows "+2"

				await setSmartMosaicSliderValue(pageA, 1);
				await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText(
					'+2',
					{
						timeout: 10_000
					}
				);

				// Raise limit to 2: 2 visible, 1 hidden → indicator shows "+1"
				await setSmartMosaicSliderValue(pageA, 2);
				await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText(
					'+1',
					{
						timeout: 10_000
					}
				);
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
			const prefix = `speaker-limit-1-${Date.now()}`;
			const participants = [
				{ name: `${prefix}-viewer`, audioEnabled: false },
				{ name: `${prefix}-remote-muted`, audioEnabled: false, headless: true },
				{ name: `${prefix}-remote-speaker`, audioEnabled: false, headless: true }
			];
			const { pageA, pages, byName, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants
			});

			try {
				await setSmartMosaicSliderValue(pageA, 1);
				await waitForVisibleRemoteParticipants(pageA, { count: 1 });

				await toggleMicrophone(byName[`${prefix}-remote-speaker`]);

				await waitForVisibleRemoteParticipants(pageA, {
					count: 1,
					includes: [`${prefix}-remote-speaker`],
					excludes: [`${prefix}-remote-muted`]
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
			test.setTimeout(120_000);

			const prefix = `speaker-rotate-${Date.now()}`;
			const participants = [
				{ name: `${prefix}-viewer`, audioEnabled: false },
				{ name: `${prefix}-remote-a`, audioEnabled: true, headless: true },
				{ name: `${prefix}-remote-b`, audioEnabled: false, headless: true },
				{ name: `${prefix}-remote-c`, audioEnabled: false, headless: true }
			];
			const { pageA, pages, byName } = await joinParticipants(browser, {
				roomId,
				participants
			});

			try {
				await setSmartMosaicSliderValue(pageA, 2);

				await waitForVisibleRemoteParticipants(pageA, {
					count: 2,
					includes: [`${prefix}-remote-a`]
				});

				await Promise.all([
					toggleMicrophone(byName[`${prefix}-remote-a`]),
					toggleMicrophone(byName[`${prefix}-remote-b`]),
					toggleMicrophone(byName[`${prefix}-remote-c`])
				]);

				await waitForVisibleRemoteParticipants(
					pageA,
					{
						count: 2,
						includes: [`${prefix}-remote-b`, `${prefix}-remote-c`],
						excludes: [`${prefix}-remote-a`]
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
			const prefix = `speaker-limit-3-${Date.now()}`;
			test.setTimeout(90_000);

			const participants = [
				{ name: `${prefix}-viewer`, audioEnabled: false },
				{ name: `${prefix}-remote-a`, audioEnabled: true, headless: true },
				{ name: `${prefix}-remote-b`, audioEnabled: false, headless: true },
				{ name: `${prefix}-remote-c`, audioEnabled: false, headless: true },
				{ name: `${prefix}-remote-d`, audioEnabled: false, headless: true }
			];
			const { pageA, pages, byName, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants,
				mode: 'parallel'
			});

			try {
				await setSmartMosaicSliderValue(pageA, 3);

				await Promise.all([
					toggleMicrophone(byName[`${prefix}-remote-a`]),
					toggleMicrophone(byName[`${prefix}-remote-b`]),
					toggleMicrophone(byName[`${prefix}-remote-c`])
				]);

				await waitForVisibleRemoteParticipants(
					pageA,
					{
						count: 3,
						includes: [`${prefix}-remote-a`, `${prefix}-remote-b`, `${prefix}-remote-c`],
						excludes: [`${prefix}-remote-d`]
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
			const prefix = `speaker-stable-${Date.now()}`;
			const participants = [
				{ name: `${prefix}-viewer`, audioEnabled: false },
				{ name: `${prefix}-remote-a`, audioEnabled: false, headless: true },
				{ name: `${prefix}-remote-b`, audioEnabled: false, headless: true }
			];
			const { pageA, pages, byName } = await joinParticipants(browser, {
				roomId,
				participants
			});

			try {
				await setSmartMosaicSliderValue(pageA, 1);

				await toggleMicrophone(byName[`${prefix}-remote-a`]);
				await waitForVisibleRemoteParticipants(pageA, {
					count: 1,
					includes: [`${prefix}-remote-a`],
					excludes: [`${prefix}-remote-b`]
				});

				await toggleMicrophone(byName[`${prefix}-remote-b`]);

				for (let i = 0; i < 5; i++) {
					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: [`${prefix}-remote-a`],
						excludes: [`${prefix}-remote-b`]
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
			const prefix = `speaker-new-join-${Date.now()}`;
			const participants = [
				{ name: `${prefix}-viewer`, audioEnabled: false },
				{ name: `${prefix}-remote-a`, audioEnabled: false, headless: true },
				{ name: `${prefix}-remote-b`, audioEnabled: false, headless: true }
			];
			const { pageA, pages, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants
			});

			try {
				await setSmartMosaicSliderValue(pageA, 1);

				await waitForVisibleRemoteParticipants(pageA, { count: 1 });

				const newSpeakerName = `${prefix}-remote-c`;
				const { byName: lateJoinByName } = await joinParticipants(browser, {
					roomId,
					participants: [
						{
							name: newSpeakerName,
							audioEnabled: true,
							headless: true
						}
					],
					skipInitialRemoteCountCheck: true
				});
				const newSpeakerPage = lateJoinByName[newSpeakerName];
				pages.push(newSpeakerPage);

				await waitForVisibleRemoteParticipants(
					pageA,
					{
						count: 1,
						includes: [newSpeakerName],
						excludes: [`${prefix}-remote-a`, `${prefix}-remote-b`]
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
			const prefix = `speaker-leave-${Date.now()}`;
			const leavingSpeakerName = `${prefix}-remote-a`;
			const remainingSpeakerName = `${prefix}-remote-b`;
			const silentName = `${prefix}-remote-c`;
			const participants = [
				{ name: `${prefix}-viewer`, audioEnabled: false },
				{ name: leavingSpeakerName, audioEnabled: true, headless: true },
				{ name: remainingSpeakerName, audioEnabled: false, headless: true },
				{ name: silentName, audioEnabled: false, headless: true }
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
						includes: [leavingSpeakerName]
					},
					20_000
				);

				const leavingPage = byName[leavingSpeakerName];
				await leaveMeeting(leavingPage);
				await waitForVisibleRemoteParticipants(
					pageA,
					{
						count: 1,
						excludes: [leavingSpeakerName]
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
			const prefix = `speaker-silent-join-${Date.now()}`;
			const speakerName = `${prefix}-remote-a`;
			const silentName = `${prefix}-remote-b`;
			const participants = [
				{ name: `${prefix}-viewer`, audioEnabled: false },
				{ name: speakerName, audioEnabled: true, headless: true },
				{ name: silentName, audioEnabled: false, headless: true }
			];
			const { pageA, pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants
			});

			try {
				await setSmartMosaicSliderValue(pageA, 1);

				await waitForVisibleRemoteParticipants(pageA, {
					count: 1,
					includes: [speakerName],
					excludes: [silentName]
				});

				const lateSilentName = `${prefix}-remote-c`;
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
						includes: [speakerName],
						excludes: [silentName, lateSilentName]
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

	// =========================================================================
	// These tests verify the hysteresis mechanisms that filter out:
	// 1. Low volume audio (below audioLevel threshold of 0.15)
	// 2. Brief sounds (below minimum speaking duration of 1.5s)
	// =========================================================================
	test.describe('Audio Level and Duration Filtering', () => {
		test('should keep the layout stable when a low-volume participant joins', async ({ browser }) => {
			const prefix = `af-low-${Date.now()}`;
			const initialVisibleName = `${prefix}-init`;
			const lowVolumeName = `${prefix}-low`;
			const participants = [{ name: `${prefix}-viewer`, audioEnabled: false }];
			const { pageA, pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants
			});

			try {
				await setSmartMosaicSliderValue(pageA, 1);
				await addParticipant({
					name: initialVisibleName,
					headless: true,
					audioFile: 'complete_silence.wav'
				});
				await waitForVisibleRemoteParticipants(pageA, {
					count: 1,
					includes: [initialVisibleName]
				});

				await addParticipant({
					name: lowVolumeName,
					headless: true,
					audioFile: 'low_volume_speech.wav'
				});

				await pageA.waitForTimeout(4_000);

				for (let i = 0; i < 5; i++) {
					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: [initialVisibleName],
						excludes: [lowVolumeName]
					});
				}
			} finally {
				await removeAllParticipants();
				await Promise.all(pages.map((page) => leaveMeeting(page)));
				await Promise.all(pages.map((page) => page.close()));
			}
		});

		test('should remain stable with multiple low-volume speakers', async ({ browser }) => {
			const prefix = `af-stable-${Date.now()}`;
			const initialVisibleName = `${prefix}-init`;
			const lowVolumeAName = `${prefix}-a`;
			const lowVolumeBName = `${prefix}-b`;
			const participants = [{ name: `${prefix}-viewer`, audioEnabled: false }];
			const { pageA, pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants
			});

			try {
				await setSmartMosaicSliderValue(pageA, 1);
				await addParticipant({
					name: initialVisibleName,
					headless: true,
					audioFile: 'complete_silence.wav'
				});

				await waitForVisibleRemoteParticipants(pageA, {
					count: 1,
					includes: [initialVisibleName]
				});

				await Promise.all([
					addParticipant({
						name: lowVolumeAName,
						headless: true,
						audioFile: 'ambient_pink_noise.wav'
					}),
					addParticipant({
						name: lowVolumeBName,
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
			const prefix = `af-brief-${Date.now()}`;
			const initialVisibleName = `${prefix}-init`;
			const coughLikeName = `${prefix}-cough`;
			const participants = [{ name: `${prefix}-viewer`, audioEnabled: false }];
			const { pageA, pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants
			});

			try {
				await setSmartMosaicSliderValue(pageA, 1);
				await addParticipant({
					name: initialVisibleName,
					headless: true,
					audioFile: 'complete_silence.wav'
				});

				await waitForVisibleRemoteParticipants(pageA, {
					count: 1,
					includes: [initialVisibleName],
					excludes: [coughLikeName]
				});

				await addParticipant({
					name: coughLikeName,
					headless: true,
					audioFile: 'brief_cough_at_5s.wav'
				});

				await pageA.waitForTimeout(5_000);

				for (let i = 0; i < 5; i++) {
					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: [initialVisibleName],
						excludes: [coughLikeName]
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
			const prefix = `af-1s-${Date.now()}`;
			const initialVisibleName = `${prefix}-init`;
			const briefSpeakerName = `${prefix}-brief`;
			const participants = [{ name: `${prefix}-viewer`, audioEnabled: false }];
			const { pageA, pages, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
				roomId,
				participants
			});

			try {
				await setSmartMosaicSliderValue(pageA, 1);
				await addParticipant({
					name: initialVisibleName,
					headless: true,
					audioFile: 'complete_silence.wav'
				});

				await waitForVisibleRemoteParticipants(pageA, {
					count: 1,
					includes: [initialVisibleName],
					excludes: [briefSpeakerName]
				});

				await addParticipant({
					name: briefSpeakerName,
					headless: true,
					audioFile: 'brief_sound_1s_at_5s.wav'
				});

				await pageA.waitForTimeout(5_000);

				for (let i = 0; i < 5; i++) {
					await waitForVisibleRemoteParticipants(pageA, {
						count: 1,
						includes: [initialVisibleName],
						excludes: [briefSpeakerName]
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
			const prefix = `speaker-mute-cycle-${Date.now()}`;
			const remoteAName = `${prefix}-remote-a`;
			const remoteBName = `${prefix}-remote-b`;
			const participants = [
				{ name: `${prefix}-viewer`, audioEnabled: false },
				{ name: remoteAName, audioEnabled: true, headless: true },
				{ name: remoteBName, audioEnabled: false, headless: true }
			];
			const { pageA, pages, byName } = await joinParticipants(browser, {
				roomId,
				participants
			});

			try {
				await setSmartMosaicSliderValue(pageA, 1);

				await waitForVisibleRemoteParticipants(pageA, {
					count: 1,
					includes: [remoteAName],
					excludes: [remoteBName]
				});

				await Promise.all([toggleMicrophone(byName[remoteAName]), toggleMicrophone(byName[remoteBName])]);

				await waitForVisibleRemoteParticipants(
					pageA,
					{
						count: 1,
						includes: [remoteBName],
						excludes: [remoteAName]
					},
					20_000
				);

				await toggleMicrophone(byName[remoteAName]);

				await waitForVisibleRemoteParticipants(pageA, {
					count: 1,
					includes: [remoteBName]
				});
			} finally {
				await Promise.all(pages.map((page) => leaveMeeting(page)));
				await Promise.all(pages.map((page) => page.close()));
			}
		});

		test('should hide a participant when they become audio-muted and promote the other active speaker', async ({
			browser
		}) => {
			const prefix = `speaker-mute-hide-${Date.now()}`;
			const remoteAName = `${prefix}-remote-a`;
			const remoteBName = `${prefix}-remote-b`;
			const participants = [
				{ name: `${prefix}-viewer`, audioEnabled: false },
				{ name: remoteAName, audioEnabled: false },
				{ name: remoteBName, audioEnabled: false }
			];
			const { pageA, pages, byName } = await joinParticipants(browser, {
				roomId,
				participants
			});

			try {
				await setSmartMosaicSliderValue(pageA, 1);

				await toggleMicrophone(byName[remoteAName]);
				await waitForVisibleRemoteParticipants(pageA, {
					count: 1,
					includes: [remoteAName],
					excludes: [remoteBName]
				});

				await toggleMicrophone(byName[remoteBName]);
				await pageA.waitForTimeout(1_000);

				await toggleMicrophone(byName[remoteAName]);

				await waitForVisibleRemoteParticipants(
					pageA,
					{
						count: 1,
						includes: [remoteBName],
						excludes: [remoteAName]
					},
					20_000
				);
			} finally {
				await Promise.all(pages.map((page) => leaveMeeting(page)));
				await Promise.all(pages.map((page) => page.close()));
			}
		});
	});
});

test.describe('Mosaic Layout and Smart Mosaic Layout Switching', () => {
	test('should filter remote participants after switching from mosaic to smart mosaic', async ({ browser }) => {
		const prefix = `smart-switch-${Date.now()}`;
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
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+1');

			// Switch to mosaic and verify all remotes are visible
			await selectMosaicLayout(pageA);
			await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });
			await expectHidden(pageA, 'ov-hidden-participants-indicator');

			// Switch back to smart mosaic and verify the previous limit is applied (2 visible remotes, 1 hidden)
			await selectSmartMosaicLayout(pageA);
			await waitForRemoteStream(pageA, 2, { requireAudioTracks: true });
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+1');

			await setSmartMosaicSliderValue(pageA, 1);
			await waitForRemoteStream(pageA, 1, { requireAudioTracks: true });
			await expectVisible(pageA, 'ov-hidden-participants-indicator');
			await expect(pageA.locator('.hidden-participants-container .participant-count-value')).toContainText('+2');

			await setSmartMosaicSliderValue(pageA, 4);
			await waitForRemoteStream(pageA, 3, { requireAudioTracks: true });
			await expectHidden(pageA, 'ov-hidden-participants-indicator');
		} finally {
			await removeAllParticipants();
			await Promise.all(pages.map((page) => leaveMeeting(page)));
			await Promise.all(pages.map((page) => page.close()));
		}
	});
});
