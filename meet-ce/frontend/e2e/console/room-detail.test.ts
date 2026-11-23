import { MeetRoom, MeetRoomMemberRole, MeetUserRole } from '@openvidu-meet/typings';
import { expect, test, type Page } from '@playwright/test';
import { createReadyUser } from '../helpers/auth.helper';
import {
	asUser,
	chooseRecordingStatuses,
	cleanupRooms,
	cleanupUsers,
	confirmDialog,
	gotoRoomDetail,
	newRunId,
	signInAdminBeforeEach,
	startMeeting
} from '../helpers/console.helper';
import {
	createRoom,
	createRoomMember,
	deleteRoomMember,
	MEET_BASE_URL,
	updateRoomRoles
} from '../helpers/meet-api.helper';
import { expectCopiedText, installClipboardCapture } from '../helpers/ui-utils.helper';

const RUN_ID = newRunId();

signInAdminBeforeEach();

const notificationText = (page: Page) => page.locator('.ov-notification[data-kind="message"] .notification-message');
const membersTab = (page: Page) => page.getByRole('tab', { name: /member/i });

test.describe('Console Room detail E2E Tests', () => {
	let room: MeetRoom;

	test.beforeEach(async () => {
		room = await createRoom({ roomName: `${RUN_ID}-detail` });
	});

	test.afterEach(async () => {
		await cleanupRooms([room.roomId]);
	});

	test('renders the recordings tab and the members tab lists independently', async ({ page }) => {
		await gotoRoomDetail(page, room.roomId);

		// The recordings tab is selected first.
		await expect(page.locator('ov-recording-lists')).toBeVisible({ timeout: 20_000 });

		await page
			.getByRole('tab')
			.filter({ hasText: /member/i })
			.first()
			.click();

		await expect(page.locator('ov-room-members-list')).toBeVisible({ timeout: 20_000 });
	});

	test('the recordings tab filters by several statuses', async ({ page }) => {
		const statusesRequested: (string | null)[] = [];
		await page.route('**/api/v1/recordings?*', (route) => {
			statusesRequested.push(new URL(route.request().url()).searchParams.get('status'));
			return route.fulfill({
				json: {
					recordings: [
						{
							recordingId: 'room--EG_1--x',
							roomId: room.roomId,
							roomName: room.roomName,
							status: 'complete'
						}
					],
					pagination: { isTruncated: false, maxItems: 50 }
				}
			});
		});
		await gotoRoomDetail(page, room.roomId);
		await expect(page.locator('ov-recording-lists')).toBeVisible({ timeout: 20_000 });

		await chooseRecordingStatuses(page, ['Failed', 'Aborted']);

		await expect.poll(() => statusesRequested.at(-1)).toBe('failed,aborted');
	});

	test('the member form disables a permission while the one it needs is off', async ({ page }) => {
		const permissionSwitch = (key: string) => page.locator(`#member-permission-${key} button`);

		await page.goto(`${MEET_BASE_URL}/rooms/${room.roomId}/members/new`, { waitUntil: 'domcontentloaded' });
		await page.locator('.permissions-panel mat-expansion-panel-header').click();
		await expect(permissionSwitch('chatRead')).toBeVisible({ timeout: 20_000 });

		// The speaker base role denies broadcastControl, so adding destinations starts unavailable.
		await expect(permissionSwitch('broadcastEdit')).toBeDisabled();

		for (const [dependent, parent] of [
			['chatWrite', 'chatRead'],
			['mediaChangeVirtualBackground', 'mediaPublishVideo']
		]) {
			await permissionSwitch(parent).click();
			await expect(permissionSwitch(dependent)).toBeDisabled();
			await expect(permissionSwitch(dependent)).toHaveAttribute('aria-checked', 'true');

			await permissionSwitch(parent).click();
			await expect(permissionSwitch(dependent)).toBeEnabled();
		}

		await page.locator('mat-select[formcontrolname="role"]').click();
		await page.getByRole('option', { name: /moderator/i }).click();
		await expect(permissionSwitch('broadcastEdit')).toBeEnabled();
	});

	test('shows the notice of copying a member link in the selected language', async ({ page }) => {
		const member = await createRoomMember(room.roomId, {
			name: 'Invitada',
			baseRole: MeetRoomMemberRole.SPEAKER
		});
		await gotoRoomDetail(page, room.roomId);
		await page.locator('#language-selector-btn').click();
		await page.locator('#lang-opt-es').click();
		await page.getByRole('tab').nth(1).click();

		await page.locator(`#copy-member-link-btn-${member.memberId}`).click();

		await expect(page.locator('.ov-notification[data-kind="message"] .notification-message')).toHaveText(
			'Enlace de acceso del miembro copiado al portapapeles'
		);
	});

	test('shows the notice of deleting the room in the selected language', async ({ page }) => {
		await gotoRoomDetail(page, room.roomId);
		await page.locator('#language-selector-btn').click();
		await page.locator('#lang-opt-es').click();

		await page.locator('.icon-action-btn.delete-btn').click();
		await confirmDialog(page);

		await expect(page.locator('.ov-notification[data-kind="message"] .notification-message')).toHaveText(
			'Sala eliminada correctamente'
		);
	});

	test('copying the link of an identified guest puts its access URL in the clipboard', async ({ page }) => {
		const guest = await createRoomMember(room.roomId, { name: 'Invitada', baseRole: MeetRoomMemberRole.SPEAKER });
		await gotoRoomDetail(page, room.roomId);
		await installClipboardCapture(page);
		await membersTab(page).click();

		await page.locator(`#copy-member-link-btn-${guest.memberId}`).click();

		await expectCopiedText(page, guest.accessUrl);
	});

	test('marks only the identified guest whose access link carries its member ID as the secret', async ({ page }) => {
		const { user } = await createReadyUser('Console member', MeetUserRole.ROOM_MEMBER);

		try {
			const [oldGuest, currentGuest] = await Promise.all([
				createRoomMember(room.roomId, { name: 'Old guest', baseRole: MeetRoomMemberRole.SPEAKER }),
				createRoomMember(room.roomId, { name: 'Current guest', baseRole: MeetRoomMemberRole.SPEAKER }),
				createRoomMember(room.roomId, { userId: user.userId, baseRole: MeetRoomMemberRole.SPEAKER })
			]);
			await page.route(
				(url) => url.pathname.endsWith(`/api/v1/rooms/${room.roomId}/members`),
				async (route) => {
					const response = await route.fetch();
					const body = await response.json();

					for (const member of body.members) {
						if (member.memberId === oldGuest.memberId) {
							const accessUrl = new URL(member.accessUrl);
							accessUrl.searchParams.set('secret', member.memberId);
							member.accessUrl = accessUrl.toString();
						}
					}

					await route.fulfill({ response, json: body });
				}
			);
			await gotoRoomDetail(page, room.roomId);
			await membersTab(page).click();
			await expect(page.locator(`#member-name-${user.userId}`)).toBeVisible({ timeout: 20_000 });

			await expect(page.locator(`#member-deprecated-access-link-${currentGuest.memberId}`)).toHaveCount(0);
			await expect(page.locator(`#member-deprecated-access-link-${user.userId}`)).toHaveCount(0);
			await page.locator(`#member-deprecated-access-link-${oldGuest.memberId}`).hover();
			await expect(page.locator('.mat-mdc-tooltip')).toContainText(
				'This link may be insecure because it was created before OpenVidu Meet 3.10.0. Remove this member and add them again to get a secure link.'
			);
		} finally {
			await cleanupUsers([user.userId]);
		}
	});

	test('keeps the room members tab in the URL when a member is edited and the user goes back', async ({ page }) => {
		const guest = await createRoomMember(room.roomId, { name: 'Invitada', baseRole: MeetRoomMemberRole.SPEAKER });
		await gotoRoomDetail(page, room.roomId);
		await membersTab(page).click();
		await expect(page).toHaveURL(/tab=members/);

		await page.locator(`#edit-member-btn-${guest.memberId}`).click();
		await expect(page).toHaveURL(new RegExp(`/members/${guest.memberId}/edit`));
		await page.goBack();

		await expect(membersTab(page)).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 });
		await expect(page.locator('ov-room-members-list')).toBeVisible();
	});

	test('removing a member warns of the ongoing meeting only while the room has one', async ({ page, browser }) => {
		const guest = await createRoomMember(room.roomId, { name: 'Invitada', baseRole: MeetRoomMemberRole.SPEAKER });

		const openRemoveDialog = async () => {
			await page.goto(`${MEET_BASE_URL}/rooms/${room.roomId}?tab=members`, { waitUntil: 'domcontentloaded' });
			await page.locator(`#delete-member-btn-${guest.memberId}`).click();
			await expect(page.locator('.dialog-message')).toContainText('Invitada');
		};

		await openRemoveDialog();
		await expect(page.locator('.warning-box')).toHaveCount(0);
		await page.locator('.cancel-button').click();

		const meeting = await startMeeting(browser, room);

		try {
			await openRemoveDialog();

			await expect(page.locator('.warning-box')).toContainText('they will be kicked immediately');
		} finally {
			await meeting.end();
		}
	});

	test('a bulk removal reports the members removed and the one that could not be', async ({ page }) => {
		const members = await Promise.all(
			['Ana', 'Beto', 'Carla'].map((name) =>
				createRoomMember(room.roomId, { name, baseRole: MeetRoomMemberRole.SPEAKER })
			)
		);
		await gotoRoomDetail(page, room.roomId);
		await membersTab(page).click();

		for (const { memberId } of members) {
			await page.locator(`#select-member-${memberId}`).click();
		}

		await deleteRoomMember(room.roomId, members[0].memberId);

		await page.locator('#members-bulk-delete-btn').click();
		await confirmDialog(page);

		await expect(notificationText(page)).toHaveText(
			'2 members removed successfully. 1 member could not be removed.'
		);
	});

	test.describe('member form', () => {
		const guestName = 'Invitada';

		const openAddForm = async (page: Page) => {
			await page.goto(`${MEET_BASE_URL}/rooms/${room.roomId}/members/new`, { waitUntil: 'domcontentloaded' });
			await page.getByRole('radio', { name: 'Identified Guest' }).click();
			await page.locator('input[formcontrolname="memberName"]').fill(guestName);
		};

		const openPermissions = async (page: Page) => {
			await page.locator('.permissions-panel mat-expansion-panel-header').click();
			await expect(page.locator('#member-permission-chatRead button')).toBeVisible({ timeout: 20_000 });
		};

		const permissionSwitch = (page: Page, key: string) => page.locator(`#member-permission-${key} button`);

		const chooseRole = async (page: Page, role: RegExp) => {
			await page.locator('mat-select[formcontrolname="role"]').click();
			await page.getByRole('option', { name: role }).click();
		};

		const submitRequest = (page: Page, method: string) =>
			page.waitForRequest((request) => request.method() === method && /\/members(\/[^/]+)?$/.test(request.url()));

		test('adding a member sends as custom permissions only the toggles that differ from its role', async ({
			page
		}) => {
			await openAddForm(page);
			await openPermissions(page);
			await permissionSwitch(page, 'recordingControl').click();
			const request = submitRequest(page, 'POST');

			await page.locator('.submit-button').click();

			expect((await request).postDataJSON()).toEqual({
				name: guestName,
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: { recordingControl: true }
			});
		});

		test('editing a member back to the values of its role sends an empty custom permissions object', async ({
			page
		}) => {
			const guest = await createRoomMember(room.roomId, {
				name: guestName,
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: { recordingControl: true }
			});
			await page.goto(`${MEET_BASE_URL}/rooms/${room.roomId}/members/${guest.memberId}/edit`, {
				waitUntil: 'domcontentloaded'
			});
			await openPermissions(page);
			await expect(permissionSwitch(page, 'recordingControl')).toHaveAttribute('aria-checked', 'true');
			await permissionSwitch(page, 'recordingControl').click();
			const request = submitRequest(page, 'PUT');

			await page.locator('.submit-button').click();

			expect((await request).postDataJSON()).toEqual({
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: {}
			});
		});

		test('a role change resets the toggles and keeps a dependent one on while the one it needs is off', async ({
			page
		}) => {
			await updateRoomRoles(room.roomId, { speaker: { permissions: { chatRead: false } } });
			await openAddForm(page);
			await chooseRole(page, /moderator/i);
			await openPermissions(page);
			await permissionSwitch(page, 'participantKick').click();
			await expect(permissionSwitch(page, 'participantKick')).toHaveAttribute('aria-checked', 'false');

			await chooseRole(page, /speaker/i);
			await chooseRole(page, /moderator/i);

			await expect(permissionSwitch(page, 'participantKick')).toHaveAttribute('aria-checked', 'true');

			await chooseRole(page, /speaker/i);

			await expect(permissionSwitch(page, 'chatWrite')).toBeDisabled();
			await expect(permissionSwitch(page, 'chatWrite')).toHaveAttribute('aria-checked', 'true');
			const request = submitRequest(page, 'POST');

			await page.locator('.submit-button').click();

			const { customPermissions } = (await request).postDataJSON();
			expect(customPermissions ?? {}).not.toHaveProperty('chatWrite');
		});
	});
});

test.describe('Console Room detail by user E2E Tests', () => {
	const RUN_ID = newRunId();
	let rooms: MeetRoom[];
	const userIds: string[] = [];

	test.afterEach(async () => {
		await cleanupRooms(rooms.map((room) => room.roomId));
		await cleanupUsers(userIds.splice(0));
	});

	test('a member who does not manage the room sees its recordings and no members tab', async ({ browser }) => {
		const { user } = await createReadyUser('Console member', MeetUserRole.ROOM_MEMBER);
		userIds.push(user.userId);
		rooms = [await createRoom({ roomName: `${RUN_ID}-member` })];
		await createRoomMember(rooms[0].roomId, { userId: user.userId, baseRole: MeetRoomMemberRole.SPEAKER });

		await asUser(browser, user, async (page) => {
			await gotoRoomDetail(page, rooms[0].roomId);

			await expect(page.locator('ov-recording-lists')).toBeVisible({ timeout: 20_000 });
			await expect(page.getByRole('tab')).toHaveCount(1);
		});
	});

	test('a member without recordingList sees that they have no access to the recordings', async ({ browser }) => {
		const { user } = await createReadyUser('Console member', MeetUserRole.ROOM_MEMBER);
		userIds.push(user.userId);
		rooms = [await createRoom({ roomName: `${RUN_ID}-blind` })];
		await createRoomMember(rooms[0].roomId, {
			userId: user.userId,
			baseRole: MeetRoomMemberRole.SPEAKER,
			customPermissions: { recordingList: false }
		});

		await asUser(browser, user, async (page) => {
			await gotoRoomDetail(page, rooms[0].roomId);

			await expect(page.locator('.no-permission-state')).toContainText('No access to recordings');
			await expect(page.locator('ov-recording-lists')).toHaveCount(0);
			await expect(page.getByRole('tab')).toHaveCount(1);
		});
	});

	test('a room the user cannot read takes them back to the Rooms page', async ({ browser }) => {
		const { user } = await createReadyUser('Console member', MeetUserRole.ROOM_MEMBER);
		userIds.push(user.userId);
		rooms = [await createRoom({ roomName: `${RUN_ID}-private` })];

		await asUser(browser, user, async (page) => {
			await page.goto(`${MEET_BASE_URL}/rooms/${rooms[0].roomId}`, { waitUntil: 'domcontentloaded' });

			await expect(page).toHaveURL(/\/rooms$/, { timeout: 20_000 });
			await expect(page.locator('ov-rooms-lists')).toBeVisible({ timeout: 20_000 });
		});
	});
});
