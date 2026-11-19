import { MeetRoom, MeetRoomMemberRole } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import {
	chooseRecordingStatuses,
	cleanupRooms,
	confirmDialog,
	gotoRoomDetail,
	newRunId,
	signInAdminBeforeEach
} from '../helpers/console.helper';
import { createRoom, createRoomMember, MEET_BASE_URL } from '../helpers/meet-api.helper';

const RUN_ID = newRunId();

signInAdminBeforeEach();

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
});
