import {
	MeetRecordingInfo,
	MeetRoom,
	MeetRoomMember,
	MeetRoomMemberRole,
	MeetUserRole
} from '@openvidu-meet/typings';
import { test, type Page } from '@playwright/test';
import {
	createReadyMemberUser,
	createReadyOwner,
	createReadyUser,
	expectLoginPage,
	expectNoLoginPage,
	performLogin,
	type ReadyUser
} from './helpers/auth.helper';
import { expectNameInput, expectRoomAccessDenied } from './helpers/access.helper';
import { createRoom, createRoomMember, deleteRooms, deleteUsers, getRecordingShareUrl } from './helpers/meet-api.helper';
import { openLobby } from './helpers/meeting-navigation.helper';
import { openRecording, openRoomRecordings, toRoomRecordingsUrl } from './helpers/recordings-navigation.helper';
import { expectRecordingViewShown, expectRoomRecordingsListShown, recordRoom } from './helpers/recordings.helper';

/**
 * Access tests verify only that each individual can *reach* the expected view (room lobby,
 * recordings list, or individual recording) — the view is shown, or the login form is shown when it
 * should be (after which we log in and confirm the view). For the room lobby we also check the
 * participant-name input (value + editability). Permissions are covered in `permissions.test.ts`.
 */
test.describe('Access E2E Tests', () => {
	const SPEAKER_GUEST_NAME = 'Speaker Guest';
	const INVITED_GUEST_NAME = 'Invited Guest';

	const createdUserIds: string[] = [];
	const createdRoomIds: string[] = [];

	// The shared room is created by the owner so both the owner and a (separate) admin are testable
	// against a single room. User access is left disabled (the default), so a non-member is denied.
	let room: MeetRoom;
	let ownerUser: ReadyUser;
	let adminUser: ReadyUser;
	let nonMemberUser: ReadyUser;
	let memberUser: ReadyUser;
	let memberUserMember: MeetRoomMember;
	let speakerGuest: MeetRoomMember;
	let invitedGuest: MeetRoomMember;
	let recording: MeetRecordingInfo;
	let publicRecordingUrl: string;
	let privateRecordingUrl: string;

	test.beforeAll(async ({ browser }) => {
		// Creating the recording drives a real meeting + egress, so allow extra time.
		test.setTimeout(180_000);

		const owner = await createReadyOwner('Room Owner');
		room = owner.room;
		ownerUser = owner.user;
		createdRoomIds.push(room.roomId);
		createdUserIds.push(ownerUser.userId);

		adminUser = await createReadyUser('Room Admin');
		nonMemberUser = await createReadyUser('Non Member', MeetUserRole.ROOM_MEMBER);
		createdUserIds.push(adminUser.userId, nonMemberUser.userId);

		[speakerGuest, invitedGuest] = await Promise.all([
			createRoomMember(room.roomId, { name: SPEAKER_GUEST_NAME, baseRole: MeetRoomMemberRole.SPEAKER }),
			createRoomMember(room.roomId, { name: INVITED_GUEST_NAME, baseRole: MeetRoomMemberRole.SPEAKER })
		]);

		const member = await createReadyMemberUser(room.roomId, {
			name: 'Member User',
			baseRole: MeetRoomMemberRole.SPEAKER
		});
		memberUser = member.user;
		memberUserMember = member.member;
		createdUserIds.push(memberUser.userId);

		recording = await recordRoom(browser, room.roomId);
		[publicRecordingUrl, privateRecordingUrl] = await Promise.all([
			getRecordingShareUrl(recording.recordingId, false),
			getRecordingShareUrl(recording.recordingId, true)
		]);
	});

	test.afterAll(async () => {
		await Promise.all([deleteRooms(createdRoomIds), deleteUsers(createdUserIds)]);
	});

	/**
	 * Establishes an authenticated session for a user by logging in through the room user URL (which
	 * prompts for login for owner/admin/member). Subsequent same-origin navigations then access as
	 * that authenticated user.
	 */
	const authenticate = async (page: Page, user: ReadyUser): Promise<void> => {
		await openLobby(page, room.access.user.url, { login: { userId: user.userId, password: user.password } });
	};

	// ── Room lobby access ──────────────────────────────────────────────────────

	test.describe('Room lobby access', () => {
		test('admin user must log in, then reaches the lobby with their name filled and locked', async ({ page }) => {
			await openLobby(page, room.access.user.url, {
				login: { userId: adminUser.userId, password: adminUser.password }
			});

			await expectNameInput(page, { value: adminUser.name, editable: false });
		});

		test('owner user must log in, then reaches the lobby with their name filled and locked', async ({ page }) => {
			await openLobby(page, room.access.user.url, {
				login: { userId: ownerUser.userId, password: ownerUser.password }
			});

			await expectNameInput(page, { value: ownerUser.name, editable: false });
		});

		test('member user must log in, then reaches the lobby with their name filled and locked', async ({ page }) => {
			await openLobby(page, memberUserMember.accessUrl, {
				login: { userId: memberUser.userId, password: memberUser.password }
			});

			await expectNameInput(page, { value: memberUser.name, editable: false });
		});

		test('non-member user is denied access when the room user access is disabled', async ({ page }) => {
			await page.goto(room.access.user.url, { waitUntil: 'domcontentloaded' });
			await performLogin(page, { userId: nonMemberUser.userId, password: nonMemberUser.password });

			await expectRoomAccessDenied(page);
		});

		for (const role of ['moderator', 'speaker'] as const) {
			test(`anonymous ${role} guest reaches the lobby without login, name empty and editable`, async ({
				page
			}) => {
				await openLobby(page, room.access.anonymous[role].url);

				await expectNoLoginPage(page);
				await expectNameInput(page, { value: '', editable: true });
			});
		}

		test('identified guest reaches the lobby without login, member name filled and not editable', async ({
			page
		}) => {
			await openLobby(page, speakerGuest.accessUrl);

			await expectNoLoginPage(page);
			await expectNameInput(page, { value: SPEAKER_GUEST_NAME, editable: false });
		});

		test('authenticated user via anonymous link skips login and keeps the user name', async ({ page }) => {
			await authenticate(page, adminUser);
			await openLobby(page, room.access.anonymous.speaker.url);

			await expectNoLoginPage(page);
			await expectNameInput(page, { value: adminUser.name, editable: false });
		});

		test('authenticated user via identified guest link skips login and shows the guest name', async ({ page }) => {
			await authenticate(page, adminUser);
			await openLobby(page, speakerGuest.accessUrl);

			await expectNoLoginPage(page);
			await expectNameInput(page, { value: SPEAKER_GUEST_NAME, editable: false });
		});

		test('member user via a different identified guest link skips login and shows the guest name', async ({
			page
		}) => {
			await authenticate(page, memberUser);
			await openLobby(page, invitedGuest.accessUrl);

			await expectNoLoginPage(page);
			await expectNameInput(page, { value: INVITED_GUEST_NAME, editable: false });
		});
	});

	// ── Room recordings list access ──────────────────────────────────────────────

	test.describe('Room recordings list access', () => {
		test('admin user can access the recordings list', async ({ page }) => {
			await authenticate(page, adminUser);
			await openRoomRecordings(page, toRoomRecordingsUrl(room.access.user.url));

			await expectRoomRecordingsListShown(page, recording.recordingId);
		});

		test('owner user can access the recordings list', async ({ page }) => {
			await authenticate(page, ownerUser);
			await openRoomRecordings(page, toRoomRecordingsUrl(room.access.user.url));

			await expectRoomRecordingsListShown(page, recording.recordingId);
		});

		test('member user can access the recordings list', async ({ page }) => {
			await authenticate(page, memberUser);
			await openRoomRecordings(page, toRoomRecordingsUrl(memberUserMember.accessUrl));

			await expectRoomRecordingsListShown(page, recording.recordingId);
		});

		test('anonymous moderator can access the recordings list', async ({ page }) => {
			await openRoomRecordings(page, toRoomRecordingsUrl(room.access.anonymous.moderator.url));

			await expectRoomRecordingsListShown(page, recording.recordingId);
		});

		test('anonymous speaker can access the recordings list', async ({ page }) => {
			await openRoomRecordings(page, toRoomRecordingsUrl(room.access.anonymous.speaker.url));

			await expectRoomRecordingsListShown(page, recording.recordingId);
		});

		test('anonymous recording link can access the recordings list', async ({ page }) => {
			await openRoomRecordings(page, room.access.anonymous.recording.url);

			await expectRoomRecordingsListShown(page, recording.recordingId);
		});

		test('identified guest can access the recordings list', async ({ page }) => {
			await openRoomRecordings(page, toRoomRecordingsUrl(speakerGuest.accessUrl));

			await expectRoomRecordingsListShown(page, recording.recordingId);
		});

		test('member without canRetrieveRecordings is denied access to the recordings list', async ({ page }) => {
			const denied = await createReadyMemberUser(room.roomId, {
				name: 'No Retrieve Member',
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: { canRetrieveRecordings: false }
			});
			createdUserIds.push(denied.user.userId);

			await authenticate(page, denied.user);
			await openRoomRecordings(page, toRoomRecordingsUrl(denied.member.accessUrl));

			await expectRoomAccessDenied(page);
		});

		test('a combined access method grants canRetrieveRecordings when one method lacks it', async ({ page }) => {
			// Fresh room whose speaker role cannot retrieve recordings. The anonymous speaker link alone
			// would be denied, but the authenticated admin identity is merged in (union) → access granted.
			const gatedRoom = await createRoom({
				roles: { speaker: { permissions: { canRetrieveRecordings: false } } }
			});
			createdRoomIds.push(gatedRoom.roomId);

			await openLobby(page, gatedRoom.access.user.url, {
				login: { userId: adminUser.userId, password: adminUser.password }
			});
			await openRoomRecordings(page, toRoomRecordingsUrl(gatedRoom.access.anonymous.speaker.url));

			await expectRoomRecordingsListShown(page);
		});
	});

	// ── Individual recording access (shared recording URLs) ─────────────────────────

	test.describe('Individual recording access', () => {
		test('public shared link opens without login', async ({ page }) => {
			await openRecording(page, publicRecordingUrl);

			await expectNoLoginPage(page);
			await expectRecordingViewShown(page);
		});

		test('private shared link requires login for an anonymous visitor', async ({ page }) => {
			await openRecording(page, privateRecordingUrl);

			await expectLoginPage(page);
		});

		test('private shared link opens after login for a non-member user', async ({ page }) => {
			await openRecording(page, privateRecordingUrl, {
				login: { userId: nonMemberUser.userId, password: nonMemberUser.password }
			});

			await expectRecordingViewShown(page);
		});

		test('private shared link opens after login for a member user', async ({ page }) => {
			await openRecording(page, privateRecordingUrl, {
				login: { userId: memberUser.userId, password: memberUser.password }
			});

			await expectRecordingViewShown(page);
		});

		test('authenticated user via public shared link opens without login', async ({ page }) => {
			await authenticate(page, adminUser);
			await openRecording(page, publicRecordingUrl);

			await expectNoLoginPage(page);
			await expectRecordingViewShown(page);
		});
	});
});
