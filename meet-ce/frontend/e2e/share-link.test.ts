import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { createRoom, createRoomMember, deleteRooms } from './helpers/meet-api.helper';
import { leaveMeeting, openLobby, openMeeting } from './helpers/meeting-navigation.helper';
import { toggleParticipantsPanel } from './helpers/panels.helper';
import { waitForRemoteStream } from './helpers/stream.helper';
import { expectCopiedText, expectHidden, expectVisible, installClipboardCapture } from './helpers/ui-utils.helper';

test.describe('Share Link E2E Tests', () => {
	const createdRoomIds: string[] = [];

	let roomId: string;
	// Every share point copies the anonymous *speaker* room access link, regardless of who
	// triggers the copy or from which point. This is the URL the clipboard is expected to hold.
	let speakerAccessLink: string;

	test.beforeEach(async () => {
		const room = await createRoom();
		roomId = room.roomId;
		speakerAccessLink = room.access.anonymous.speaker.url;
		createdRoomIds.push(roomId);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	/**
	 * Creates a room member and returns its access URL. Visibility of the share access link is driven
	 * by the `canShareAccessLinks` permission — granted to moderators and denied to speakers by
	 * default — so we set it explicitly (via customPermissions) to test the permission in isolation
	 * from the base role.
	 */
	const createMemberAccessUrl = async (
		canShareAccessLinks: boolean,
		baseRole: MeetRoomMemberRole = MeetRoomMemberRole.MODERATOR
	): Promise<string> => {
		const member = await createRoomMember(roomId, {
			name: `member-${Date.now()}`,
			baseRole,
			customPermissions: { canShareAccessLinks }
		});
		return member.accessUrl;
	};

	test.describe('Lobby', () => {
		test('should render the share room access link in the lobby when member can share access links', async ({
			page
		}) => {
			const accessUrl = await createMemberAccessUrl(true);

			await openLobby(page, accessUrl);

			await expect(page.locator('ov-share-room-access-link')).toBeVisible();
			await expect(page.locator('ov-share-room-access-link .copy-url-btn')).toBeVisible();
		});

		test('should not render the share room access link in the lobby when member cannot share access links', async ({
			page
		}) => {
			const accessUrl = await createMemberAccessUrl(false);

			await openLobby(page, accessUrl);

			await expectHidden(page, 'ov-share-room-access-link');
		});
	});

	test.describe('In-meeting share points', () => {
		test('should render the toolbar button, layout overlay and invite panel when member can share access links', async ({
			page
		}) => {
			const accessUrl = await createMemberAccessUrl(true);

			await openMeeting(page, accessUrl);

			// Toolbar copy-link button
			await expectVisible(page, '#copy-speaker-link');

			// Layout overlay (only shown while the member is alone in the room)
			const shareOverlay = page.locator('#share-link-overlay');
			await expect(shareOverlay).toBeVisible();
			await expect(shareOverlay.locator('.main-share-room-access-link')).toBeVisible();
			await expect(shareOverlay.locator('.copy-url-btn')).toBeVisible();

			// Invite panel inside the participants panel
			await toggleParticipantsPanel(page);
			const invitePanel = page.locator('#invite-panel');
			await expect(invitePanel).toBeVisible();
			await expect(invitePanel.locator('ov-share-room-access-link')).toBeVisible();
		});

		test('should not render the toolbar button, layout overlay or invite panel when member cannot share access links', async ({
			page
		}) => {
			const accessUrl = await createMemberAccessUrl(false);

			await openMeeting(page, accessUrl);

			await expectHidden(page, '#copy-speaker-link');
			await expectHidden(page, '#share-link-overlay');

			await toggleParticipantsPanel(page);
			await expectHidden(page, '#invite-panel');
		});

		test('should hide the layout overlay when another participant joins the meeting', async ({ page, browser }) => {
			const moderatorAccessUrl = await createMemberAccessUrl(true);
			const speaker = await createRoomMember(roomId, {
				name: 'Speaker',
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			await openMeeting(page, moderatorAccessUrl);
			await expectVisible(page, '#share-link-overlay');

			const speakerContext = await browser.newContext();
			const speakerPage = await speakerContext.newPage();
			await openMeeting(speakerPage, speaker.accessUrl, { name: 'Speaker' });

			await waitForRemoteStream(page);
			await expectHidden(page, '#share-link-overlay');

			await leaveMeeting(speakerPage);
			await speakerPage.close();
			await speakerContext.close();
		});
	});

	test.describe('Copying the anonymous speaker access link', () => {
		test('should copy the anonymous speaker access link from the lobby', async ({ page }) => {
			const accessUrl = await createMemberAccessUrl(true);

			await openLobby(page, accessUrl);
			await installClipboardCapture(page);

			await page.locator('ov-share-room-access-link .copy-url-btn').click();
			await expectCopiedText(page, speakerAccessLink);
		});

		test('should copy the anonymous speaker access link from the toolbar copy-speaker-link button', async ({
			page
		}) => {
			const accessUrl = await createMemberAccessUrl(true);

			await openMeeting(page, accessUrl);
			await installClipboardCapture(page);

			await page.locator('#copy-speaker-link').click();
			await expectCopiedText(page, speakerAccessLink);
		});

		test('should copy the anonymous speaker access link from the layout overlay', async ({ page }) => {
			const accessUrl = await createMemberAccessUrl(true);

			await openMeeting(page, accessUrl);
			await installClipboardCapture(page);

			await page.locator('#share-link-overlay .copy-url-btn').click();
			await expectCopiedText(page, speakerAccessLink);
		});

		test('should copy the anonymous speaker access link from the participants panel', async ({ page }) => {
			const accessUrl = await createMemberAccessUrl(true);

			await openMeeting(page, accessUrl);
			await toggleParticipantsPanel(page);
			await expectVisible(page, '#invite-panel .copy-url-btn');
			await installClipboardCapture(page);

			await page.locator('#invite-panel .copy-url-btn').click();
			await expectCopiedText(page, speakerAccessLink);
		});
	});
});
