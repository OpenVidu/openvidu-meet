import { MeetRoomMember, MeetRoomMemberPermissions, MeetRoomMemberRole, MeetUserRole } from '@openvidu-meet/typings';
import { expect, type Page } from '@playwright/test';
import { createReadyUser, type ReadyUser } from './auth.helper';
import { createRoomMember } from './meet-api.helper';

// ─── Member users ─────────────────────────────────────────────────────────────

/**
 * Creates a ready-to-login user (defaults to {@link MeetUserRole.ROOM_MEMBER}) and registers them as
 * a USER-type member of the given room. The member's access URL is the plain room URL (`/room/:id`),
 * which requires the user to log in. Returns the user and the created member.
 */
export const createReadyMemberUser = async (
	roomId: string,
	options: {
		name?: string;
		role?: MeetUserRole;
		baseRole?: MeetRoomMemberRole;
		customPermissions?: Partial<MeetRoomMemberPermissions>;
	} = {}
): Promise<{ user: ReadyUser; member: MeetRoomMember }> => {
	const {
		name = 'Member User',
		role = MeetUserRole.ROOM_MEMBER,
		baseRole = MeetRoomMemberRole.SPEAKER,
		customPermissions
	} = options;

	const { user } = await createReadyUser(name, role);
	const member = await createRoomMember(roomId, { userId: user.userId, baseRole, customPermissions });
	return { user, member };
};

// ─── Lobby name input ─────────────────────────────────────────────────────────

/**
 * Asserts the value and editability of the lobby participant-name input.
 */
export const expectNameInput = async (page: Page, expected: { value: string; editable: boolean }): Promise<void> => {
	const nameInput = page.locator('#participant-name-input');
	await expect(nameInput).toBeVisible({ timeout: 10_000 });
	await expect(nameInput).toHaveValue(expected.value);

	if (expected.editable) {
		await expect(nameInput).toBeEditable();
	} else {
		await expect(nameInput).not.toBeEditable();
	}
};

// ─── Access-denied / restricted views ───────────────────────────────────────────

/**
 * Asserts that access to the room/recordings was denied: the app renders the error page and no
 * lobby name input is shown. Used for individuals that cannot access the resource at all (e.g. a
 * non-member user when the room's user access is disabled).
 */
export const expectRoomAccessDenied = async (page: Page): Promise<void> => {
	await expect(page.locator('.error-page')).toBeVisible({ timeout: 15_000 });
	await expect(page.locator('#participant-name-input')).toHaveCount(0);
};

/**
 * Asserts that the lobby is reached but joining is restricted (the `canJoinMeeting` permission is
 * denied): the "no permission" card is shown instead of the name input / join form.
 */
export const expectLobbyAccessRestricted = async (page: Page): Promise<void> => {
	await expect(page.locator('.room-closed-message')).toBeVisible({ timeout: 15_000 });
	await expect(page.locator('#participant-name-input')).toHaveCount(0);
};
