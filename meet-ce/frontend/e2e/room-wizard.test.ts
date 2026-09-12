import { expect, test, type Page } from '@playwright/test';
import { authenticate, createReadyUser, type ReadyUser } from './helpers/auth.helper';
import {
	createRoom,
	deleteRooms,
	deleteUsers,
	getRoomConfig,
	getRoomRoles,
	MEET_BASE_URL
} from './helpers/meet-api.helper';

/**
 * Room-creation wizard E2E tests.
 *
 * Verifies that role permissions which only make sense when a room feature is enabled become
 * disabled (and cannot be toggled on) in the "Room Access" step when that feature is turned off in
 * the "Meeting Features" step — and are restored when the feature is turned back on ("keep as-is"):
 *   - Chat feature off        -> chatRead / chatWrite disabled for both roles.
 *   - Virtual background off  -> mediaChangeVirtualBackground disabled for both roles.
 *
 * The wizard's step order is Room Details -> Room Access -> Meeting Features, so these specs visit
 * Room Access first, hop forward to Meeting Features to set a toggle, then step back to Room Access
 * to assert on the role-permission switches.
 *
 * The round-trip specs at the end then finish the wizard — in create and in edit mode — and read the
 * room back through the API, which is what proves a permission switched off in the UI actually
 * reaches the stored role instead of being dropped on the way.
 */
test.describe('Room wizard E2E Tests', () => {
	const createdUserIds: string[] = [];
	const createdRoomIds: string[] = [];
	let admin: ReadyUser;

	const ROLES = ['moderator', 'speaker'] as const;

	test.beforeAll(async () => {
		// The wizard's create route (/rooms/new) is gated to ADMIN / ROOM_MANAGER; createReadyUser
		// defaults to an admin whose first-login password change is already done.
		admin = (await createReadyUser('Wizard Admin')).user;
		createdUserIds.push(admin.userId);
	});

	test.afterAll(async () => {
		await Promise.all([deleteRooms(createdRoomIds), deleteUsers(createdUserIds)]);
	});

	test.beforeEach(async ({ page }) => {
		await authenticate(page, { userId: admin.userId, password: admin.password });
	});

	// ── Wizard navigation helpers ──────────────────────────────────────────────

	/**
	 * Opens the create wizard, switches to advanced (multi-step) mode and advances to the
	 * "Meeting Features" step (Room Details -> Room Access -> Meeting Features).
	 */
	const openWizardAtFeatures = async (page: Page): Promise<void> => {
		await page.goto(`${MEET_BASE_URL}/rooms/new`, { waitUntil: 'domcontentloaded' });
		await page.locator('#wizard-advanced-mode-btn').click(); // basic -> advanced (Room Details)
		await page.locator('#wizard-next-btn').click(); // Room Details -> Room Access
		await page.locator('#wizard-next-btn').click(); // Room Access -> Meeting Features
		await expect(page.locator('#room-feature-chat')).toBeVisible();
	};

	/** Steps back from "Meeting Features" to the "Room Access" step. */
	const gotoRoomAccess = async (page: Page): Promise<void> => {
		await page.locator('#wizard-previous-btn').click();
		// The role-permission toggles live in (collapsed) expansion panels, so they are attached but
		// not visible — waiting for one confirms the Room Access step has rendered.
		await expect(page.locator('#moderator-permission-meetingJoin')).toBeAttached();
	};

	/** Returns the role-permission toggle switch for the given role and permission key. */
	const permissionSwitch = (page: Page, role: (typeof ROLES)[number], key: string) =>
		page.locator(`#${role}-permission-${key} button`);

	/** Expands a role's accordion panel, so its permission switches go from attached to clickable. */
	const openRolePermissions = async (page: Page, role: (typeof ROLES)[number]): Promise<void> => {
		await page.locator(`#${role}-permissions-panel mat-expansion-panel-header`).click();
		await expect(permissionSwitch(page, role, 'meetingJoin')).toBeVisible();
	};

	/** Sets a role-permission switch to the desired state, clicking only when it needs to change. */
	const setPermission = async (
		page: Page,
		role: (typeof ROLES)[number],
		key: string,
		enabled: boolean
	): Promise<void> => {
		const toggle = permissionSwitch(page, role, key);
		const isChecked = (await toggle.getAttribute('aria-checked')) === 'true';

		if (isChecked !== enabled) {
			await toggle.click();
		}

		await expect(toggle).toHaveAttribute('aria-checked', String(enabled));
	};

	/**
	 * Jumps to the wizard's last step, where the create/update button lives. Clicking the stepper header
	 * instead of walking "next" avoids racing the navigation bar, which is re-rendered on every step change.
	 */
	const gotoLastStep = async (page: Page): Promise<void> => {
		await page.locator('.wizard-stepper .mat-step-header').last().click();
		await expect(page.locator('#wizard-finish-btn')).toBeVisible();
	};

	/** Sets a room-feature toggle to the desired state, clicking only when it needs to change. */
	const setFeature = async (page: Page, featureId: string, enabled: boolean): Promise<void> => {
		const toggle = page.locator(`#${featureId} button`);
		const isChecked = (await toggle.getAttribute('aria-checked')) === 'true';

		if (isChecked !== enabled) {
			await toggle.click();
		}

		await expect(toggle).toHaveAttribute('aria-checked', String(enabled));
	};

	// ── Tests ───────────────────────────────────────────────────────────────────

	test('features enabled: dependent role permissions are interactive', async ({ page }) => {
		await openWizardAtFeatures(page);
		// Chat and virtual background are enabled by default.
		await gotoRoomAccess(page);

		for (const role of ROLES) {
			await expect(permissionSwitch(page, role, 'chatRead')).toBeEnabled();
			await expect(permissionSwitch(page, role, 'chatWrite')).toBeEnabled();
			await expect(permissionSwitch(page, role, 'mediaChangeVirtualBackground')).toBeEnabled();
		}
	});

	test('chat disabled: chat role permissions are disabled and cannot be enabled', async ({ page }) => {
		await openWizardAtFeatures(page);
		await setFeature(page, 'room-feature-chat', false);
		await gotoRoomAccess(page);

		for (const role of ROLES) {
			await expect(permissionSwitch(page, role, 'chatRead')).toBeDisabled();
			await expect(permissionSwitch(page, role, 'chatWrite')).toBeDisabled();
			// Unrelated features stay interactive.
			await expect(permissionSwitch(page, role, 'mediaChangeVirtualBackground')).toBeEnabled();
		}
	});

	test('virtual background disabled: its role permission is disabled', async ({ page }) => {
		await openWizardAtFeatures(page);
		await setFeature(page, 'room-feature-virtual-background', false);
		await gotoRoomAccess(page);

		for (const role of ROLES) {
			await expect(permissionSwitch(page, role, 'mediaChangeVirtualBackground')).toBeDisabled();
			// Chat stays interactive.
			await expect(permissionSwitch(page, role, 'chatRead')).toBeEnabled();
			await expect(permissionSwitch(page, role, 'chatWrite')).toBeEnabled();
		}
	});

	test('recording split: the five recording permission switches are present and interactive', async ({ page }) => {
		// The old canRetrieveRecordings checkbox became three (list / play / download); this pins the
		// full five-switch group so a permission dropped from PERMISSION_GROUPS loses its checkbox
		// loudly here instead of silently in production.
		const RECORDING_PERMISSION_KEYS = [
			'recordingControl',
			'recordingList',
			'recordingPlay',
			'recordingDownload',
			'recordingDelete'
		] as const;

		await openWizardAtFeatures(page);
		await gotoRoomAccess(page);

		for (const role of ROLES) {
			for (const key of RECORDING_PERMISSION_KEYS) {
				await expect(permissionSwitch(page, role, key)).toBeEnabled();
			}
		}
	});

	test('re-enabling a feature restores its role permissions', async ({ page }) => {
		await openWizardAtFeatures(page);
		await setFeature(page, 'room-feature-chat', false);

		await gotoRoomAccess(page);
		await expect(permissionSwitch(page, 'moderator', 'chatWrite')).toBeDisabled();
		await expect(permissionSwitch(page, 'speaker', 'chatWrite')).toBeDisabled();

		// Forward to Meeting Features again and turn chat on.
		await page.locator('#wizard-next-btn').click();
		await expect(page.locator('#room-feature-chat')).toBeVisible();
		await setFeature(page, 'room-feature-chat', true);

		await gotoRoomAccess(page);
		await expect(permissionSwitch(page, 'moderator', 'chatWrite')).toBeEnabled();
		await expect(permissionSwitch(page, 'speaker', 'chatWrite')).toBeEnabled();
	});

	// ── Role permissions round-trip (wizard -> API) ─────────────────────────────

	// `participantMute` is a permission with no deprecated `can*` spelling and `recordingControl` is
	// one with an alias, so flipping both covers each half of the compatibility-mode wire.
	const FLIPPED_PERMISSIONS = ['participantMute', 'recordingControl'] as const;

	test('create mode: role permissions switched off reach the created room', async ({ page }) => {
		await page.goto(`${MEET_BASE_URL}/rooms/new`, { waitUntil: 'domcontentloaded' });
		await page.locator('#wizard-advanced-mode-btn').click();
		await page.locator('input[formcontrolname="roomName"]').fill('wizard-role-create');
		await page.locator('#wizard-next-btn').click(); // Room Details -> Room Access

		await openRolePermissions(page, 'moderator');

		for (const key of FLIPPED_PERMISSIONS) {
			await setPermission(page, 'moderator', key, false);
		}

		await gotoLastStep(page);
		await page.locator('#wizard-finish-btn').click();

		// Creating redirects to the new room's lobby, which is where its id becomes readable.
		await page.waitForURL(/\/room\/[^/?]+/);
		const roomId = /\/room\/([^/?]+)/.exec(page.url())![1];
		createdRoomIds.push(roomId);

		const roles = await getRoomRoles(roomId);

		for (const key of FLIPPED_PERMISSIONS) {
			expect(roles.moderator.permissions[key], key).toBe(false);
		}
	});

	test('edit mode: role permissions switched off reach the existing room', async ({ page }) => {
		const room = await createRoom({ roomName: 'wizard-role-edit' });
		createdRoomIds.push(room.roomId);

		await page.goto(`${MEET_BASE_URL}/rooms/${room.roomId}/edit`, { waitUntil: 'domcontentloaded' });
		await openRolePermissions(page, 'moderator');

		for (const key of FLIPPED_PERMISSIONS) {
			await setPermission(page, 'moderator', key, false);
		}

		await gotoLastStep(page);
		await page.locator('#wizard-finish-btn').click();
		await page.waitForURL(`**/rooms/${room.roomId}`);

		const roles = await getRoomRoles(room.roomId);

		for (const key of FLIPPED_PERMISSIONS) {
			expect(roles.moderator.permissions[key], key).toBe(false);
		}
	});

	// ── Initial media state round-trip (wizard -> API) ──────────────────────────

	test('create mode: initial media toggled off reaches the created room', async ({ page }) => {
		await page.goto(`${MEET_BASE_URL}/rooms/new`, { waitUntil: 'domcontentloaded' });
		await page.locator('#wizard-advanced-mode-btn').click();
		await page.locator('input[formcontrolname="roomName"]').fill('wizard-initial-media-create');
		await page.locator('#wizard-next-btn').click(); // Room Details -> Room Access
		await page.locator('#wizard-next-btn').click(); // Room Access -> Meeting Features

		await setFeature(page, 'room-feature-initial-audio', false);
		await setFeature(page, 'room-feature-initial-video', false);

		await gotoLastStep(page);
		await page.locator('#wizard-finish-btn').click();

		await page.waitForURL(/\/room\/[^/?]+/);
		const roomId = /\/room\/([^/?]+)/.exec(page.url())![1];
		createdRoomIds.push(roomId);

		const config = await getRoomConfig(roomId);

		expect(config.initialAudioActive).toBe(false);
		expect(config.initialVideoActive).toBe(false);
	});

	test('edit mode: the stored initial media state prefills the toggles and can be flipped back', async ({ page }) => {
		const room = await createRoom({
			roomName: 'wizard-initial-media-edit',
			config: { initialAudioActive: false, initialVideoActive: false }
		});
		createdRoomIds.push(room.roomId);

		await page.goto(`${MEET_BASE_URL}/rooms/${room.roomId}/edit`, { waitUntil: 'domcontentloaded' });
		await page.locator('#wizard-next-btn').click(); // Room Access -> Meeting Features

		await expect(page.locator('#room-feature-initial-audio button')).toHaveAttribute('aria-checked', 'false');
		await expect(page.locator('#room-feature-initial-video button')).toHaveAttribute('aria-checked', 'false');

		await setFeature(page, 'room-feature-initial-audio', true);
		await setFeature(page, 'room-feature-initial-video', true);

		await gotoLastStep(page);
		await page.locator('#wizard-finish-btn').click();
		await page.waitForURL(`**/rooms/${room.roomId}`);

		const config = await getRoomConfig(room.roomId);

		expect(config.initialAudioActive).toBe(true);
		expect(config.initialVideoActive).toBe(true);
	});
});
