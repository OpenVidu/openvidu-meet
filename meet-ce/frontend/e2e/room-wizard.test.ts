import { expect, test, type Page } from '@playwright/test';
import { authenticate, createReadyUser, type ReadyUser } from './helpers/auth.helper';
import { deleteUsers, MEET_BASE_URL } from './helpers/meet-api.helper';

/**
 * Room-creation wizard E2E tests.
 *
 * Verifies that role permissions which only make sense when a room feature is enabled become
 * disabled (and cannot be toggled on) in the "Room Access" step when that feature is turned off in
 * the "Room Features" step — and are restored when the feature is turned back on ("keep as-is"):
 *   - Chat feature off        -> canReadChat / canWriteChat disabled for both roles.
 *   - Virtual background off  -> canChangeVirtualBackground disabled for both roles.
 *
 * These specs drive the console UI directly (no room is created — the wizard is never finished), so
 * the only cleanup needed is the admin user created to reach the wizard.
 */
test.describe('Room wizard E2E Tests', () => {
	const createdUserIds: string[] = [];
	let admin: ReadyUser;

	const ROLES = ['moderator', 'speaker'] as const;

	test.beforeAll(async () => {
		// The wizard's create route (/rooms/new) is gated to ADMIN / ROOM_MANAGER; createReadyUser
		// defaults to an admin whose first-login password change is already done.
		admin = (await createReadyUser('Wizard Admin')).user;
		createdUserIds.push(admin.userId);
	});

	test.afterAll(async () => {
		await deleteUsers(createdUserIds);
	});

	test.beforeEach(async ({ page }) => {
		await authenticate(page, { userId: admin.userId, password: admin.password });
	});

	// ── Wizard navigation helpers ──────────────────────────────────────────────

	/**
	 * Opens the create wizard, switches to advanced (multi-step) mode and advances to the
	 * "Room Features" step.
	 */
	const openWizardAtFeatures = async (page: Page): Promise<void> => {
		await page.goto(`${MEET_BASE_URL}/rooms/new`, { waitUntil: 'domcontentloaded' });
		await page.locator('#wizard-advanced-mode-btn').click(); // basic -> advanced (Room Details)
		await page.locator('#wizard-next-btn').click(); // Room Details -> Room Features
		await expect(page.locator('#room-feature-chat')).toBeVisible();
	};

	/** Advances from "Room Features" to the "Room Access" step. */
	const gotoRoomAccess = async (page: Page): Promise<void> => {
		await page.locator('#wizard-next-btn').click();
		// The role-permission toggles live in (collapsed) expansion panels, so they are attached but
		// not visible — waiting for one confirms the Room Access step has rendered.
		await expect(page.locator('#moderator-permission-canJoinMeeting')).toBeAttached();
	};

	/** Returns the role-permission toggle switch for the given role and permission key. */
	const permissionSwitch = (page: Page, role: (typeof ROLES)[number], key: string) =>
		page.locator(`#${role}-permission-${key} button`);

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
			await expect(permissionSwitch(page, role, 'canReadChat')).toBeEnabled();
			await expect(permissionSwitch(page, role, 'canWriteChat')).toBeEnabled();
			await expect(permissionSwitch(page, role, 'canChangeVirtualBackground')).toBeEnabled();
		}
	});

	test('chat disabled: chat role permissions are disabled and cannot be enabled', async ({ page }) => {
		await openWizardAtFeatures(page);
		await setFeature(page, 'room-feature-chat', false);
		await gotoRoomAccess(page);

		for (const role of ROLES) {
			await expect(permissionSwitch(page, role, 'canReadChat')).toBeDisabled();
			await expect(permissionSwitch(page, role, 'canWriteChat')).toBeDisabled();
			// Unrelated features stay interactive.
			await expect(permissionSwitch(page, role, 'canChangeVirtualBackground')).toBeEnabled();
		}
	});

	test('virtual background disabled: its role permission is disabled', async ({ page }) => {
		await openWizardAtFeatures(page);
		await setFeature(page, 'room-feature-virtual-background', false);
		await gotoRoomAccess(page);

		for (const role of ROLES) {
			await expect(permissionSwitch(page, role, 'canChangeVirtualBackground')).toBeDisabled();
			// Chat stays interactive.
			await expect(permissionSwitch(page, role, 'canReadChat')).toBeEnabled();
			await expect(permissionSwitch(page, role, 'canWriteChat')).toBeEnabled();
		}
	});

	test('re-enabling a feature restores its role permissions', async ({ page }) => {
		await openWizardAtFeatures(page);
		await setFeature(page, 'room-feature-chat', false);

		await gotoRoomAccess(page);
		await expect(permissionSwitch(page, 'moderator', 'canWriteChat')).toBeDisabled();
		await expect(permissionSwitch(page, 'speaker', 'canWriteChat')).toBeDisabled();

		// Back to Room Features and turn chat on again.
		await page.locator('#wizard-previous-btn').click();
		await expect(page.locator('#room-feature-chat')).toBeVisible();
		await setFeature(page, 'room-feature-chat', true);

		await gotoRoomAccess(page);
		await expect(permissionSwitch(page, 'moderator', 'canWriteChat')).toBeEnabled();
		await expect(permissionSwitch(page, 'speaker', 'canWriteChat')).toBeEnabled();
	});
});
