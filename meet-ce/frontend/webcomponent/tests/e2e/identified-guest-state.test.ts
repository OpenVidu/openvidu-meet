import { MeetRoomMemberRole, EmbeddedAttribute } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { createRoom, createRoomMember, deleteRooms } from '../helpers/meet-api.helper';
import { openWebcomponentWithAttributes } from '../helpers/webcomponent-attributes.helper';
import { wcLocator } from '../helpers/webcomponent.helper';

// ─── Identified-guest state cleanup on WC removal ────────────────────────────
//
// Regression: the identified-guest name (resolved from the per-guest access
// link) was kept in the root-provided meeting/room-member context, which
// survives a remount of the <openvidu-meet> Angular Element. Reusing the same
// page with a different access link then leaked the previous guest's name into
// the lobby name field. The fix clears that state when the custom element is
// removed from the DOM (App's DestroyRef.onDestroy → clearMeetingContext).
//
// `openWebcomponentWithAttributes` re-applies the testapp config, which the
// testapp implements as a remount (drops the element, then re-adds it) — the
// exact remove-then-re-add a real host performs, and the path the fix guards.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('WebComponent Identified Guest State E2E Tests', () => {
	const createdRoomIds: string[] = [];

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should not carry the identified-guest name over to a subsequent moderator access', async ({ page }) => {
		const guestName = 'Identified Guest';

		// Create a room and an identified guest with its own personal access link.
		const room = await createRoom();
		createdRoomIds.push(room.roomId);

		const guest = await createRoomMember(room.roomId, {
			name: guestName,
			baseRole: MeetRoomMemberRole.SPEAKER
		});
		const guestAccessUrl = guest.accessUrl;
		const moderatorAccessUrl = room.access.anonymous.moderator.url;

		// 1. Access via the identified-guest link WITHOUT a participant-name attribute.
		//    The name field must be pre-filled with the guest's name and disabled.
		await openWebcomponentWithAttributes(page, {
			[EmbeddedAttribute.ROOM_URL]: guestAccessUrl
		});

		const nameInput = wcLocator(page, '#participant-name-input');
		await expect(nameInput).toBeVisible();
		await expect(nameInput).toHaveValue(guestName);
		await expect(nameInput).toBeDisabled();

		// 2. Re-access the same page via the anonymous moderator link. Re-applying the
		//    config remounts the element (DOM removal → re-add), so the guest state must
		//    have been cleared on removal.
		await openWebcomponentWithAttributes(page, {
			[EmbeddedAttribute.ROOM_URL]: moderatorAccessUrl
		});

		// The name field must no longer hold the guest's name and must be editable.
		// (Empty here because this browser context never stored a name via an
		// anonymous link; otherwise it would carry the localStorage value.)
		await expect(nameInput).toBeVisible();
		await expect(nameInput).not.toHaveValue(guestName);
		await expect(nameInput).toHaveValue('');
		await expect(nameInput).toBeEnabled();
	});
});
