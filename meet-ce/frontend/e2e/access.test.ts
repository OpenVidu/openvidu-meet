import { MeetRecordingInfo, MeetRoom, MeetRoomMember, MeetRoomMemberRole, MeetUserRole } from '@openvidu-meet/typings';
import { test, type Page } from '@playwright/test';
import { expectNameInput, expectRoomAccessDenied } from './helpers/access.helper';
import {
	authenticate,
	createReadyMemberUser,
	createReadyOwner,
	createReadyUser,
	expectLoginPage,
	expectNoLoginPage,
	performLogin,
	type ReadyUser
} from './helpers/auth.helper';
import { createRoom, createRoomMember, deleteRooms, deleteUsers, getRecordingShareUrl } from './helpers/meet-api.helper';
import { openLobby } from './helpers/meeting-navigation.helper';
import {
	openRecording,
	openRoomRecordings,
	toIndividualRecordingUrl,
	toRoomRecordingsUrl
} from './helpers/recordings-navigation.helper';
import { expectRecordingViewShown, expectRoomRecordingsListShown, recordRoom } from './helpers/recordings.helper';

/**
 * Access tests verify only that each individual can *reach* the expected view — the view is shown,
 * or the login form is shown when it should be (after which we log in and confirm the view). The
 * same set of access methods is exercised against all three views (room lobby, recordings list,
 * individual recording), which are reached through the same room URL: the recordings list and an
 * individual recording are opened by adding the `show-only-recordings` / `show-recording` query
 * params, so they inherit the room's access method. For the room lobby we also check the
 * participant-name input (value + editability). Permissions are covered in `permissions.test.ts`.
 */
test.describe('Access E2E Tests', () => {
	const SPEAKER_GUEST_NAME = 'Speaker Guest';

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

		speakerGuest = await createRoomMember(room.roomId, {
			name: SPEAKER_GUEST_NAME,
			baseRole: MeetRoomMemberRole.SPEAKER
		});

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

	// ── Shared access-method matrix ──────────────────────────────────────────────
	//
	// Each scenario is one way an individual reaches a room. It is run against every view; the view
	// decides how to build the URL, how to navigate, and what "shown" means. Getters are used because
	// the individuals are only created in `beforeAll` (after the scenarios are declared).

	type NameExpect = { value: string; editable: boolean };

	type AccessScenario = {
		title: string;
		/** anonymous → no login; login → login form then log in; preauth → establish a session first. */
		kind: 'anonymous' | 'login' | 'preauth' | 'denied';
		getUrl: () => string;
		getUser?: () => ReadyUser;
		getName: () => NameExpect;
	};

	const accessScenarios: AccessScenario[] = [
		{
			title: 'admin user must log in first',
			kind: 'login',
			getUrl: () => room.access.user.url,
			getUser: () => adminUser,
			getName: () => ({ value: adminUser.name, editable: false })
		},
		{
			title: 'owner user must log in first',
			kind: 'login',
			getUrl: () => room.access.user.url,
			getUser: () => ownerUser,
			getName: () => ({ value: ownerUser.name, editable: false })
		},
		{
			title: 'member user must log in first',
			kind: 'login',
			getUrl: () => memberUserMember.accessUrl,
			getUser: () => memberUser,
			getName: () => ({ value: memberUser.name, editable: false })
		},
		{
			title: 'non-member user is denied access when room user access is disabled',
			kind: 'denied',
			getUrl: () => room.access.user.url,
			getUser: () => nonMemberUser,
			getName: () => ({ value: '', editable: false })
		},
		{
			title: 'anonymous moderator guest has access without login',
			kind: 'anonymous',
			getUrl: () => room.access.anonymous.moderator.url,
			getName: () => ({ value: '', editable: true })
		},
		{
			title: 'anonymous speaker guest has access without login',
			kind: 'anonymous',
			getUrl: () => room.access.anonymous.speaker.url,
			getName: () => ({ value: '', editable: true })
		},
		{
			title: 'identified guest has access without login',
			kind: 'anonymous',
			getUrl: () => speakerGuest.accessUrl,
			getName: () => ({ value: SPEAKER_GUEST_NAME, editable: false })
		},
		{
			title: 'non-member user gains access via an anonymous link',
			kind: 'preauth',
			getUrl: () => room.access.anonymous.speaker.url,
			getUser: () => nonMemberUser,
			getName: () => ({ value: nonMemberUser.name, editable: false })
		},
		{
			title: 'non-member user gains access via an identified guest link',
			kind: 'preauth',
			getUrl: () => speakerGuest.accessUrl,
			getUser: () => nonMemberUser,
			getName: () => ({ value: SPEAKER_GUEST_NAME, editable: false })
		},
		{
			title: 'member user gains access via an identified guest link',
			kind: 'preauth',
			getUrl: () => speakerGuest.accessUrl,
			getUser: () => memberUser,
			getName: () => ({ value: SPEAKER_GUEST_NAME, editable: false })
		}
	];

	type AccessView = {
		/** Builds the view URL from a room access URL (identity for the lobby). */
		buildUrl: (baseUrl: string) => string;
		/** Navigates without logging in and without waiting for the final view. */
		navigate: (page: Page, url: string) => Promise<void>;
		/** Asserts the expected view is shown (the name argument is only used by the lobby). */
		expectShown: (page: Page, name: NameExpect) => Promise<void>;
	};

	const lobbyView: AccessView = {
		buildUrl: (url) => url,
		navigate: (page, url) => openLobby(page, url, { checkNameInput: false }),
		expectShown: (page, name) => expectNameInput(page, name)
	};

	const recordingsView: AccessView = {
		buildUrl: (url) => toRoomRecordingsUrl(url),
		navigate: (page, url) => openRoomRecordings(page, url),
		expectShown: (page) => expectRoomRecordingsListShown(page, recording.recordingId)
	};

	const individualRecordingView: AccessView = {
		buildUrl: (url) => toIndividualRecordingUrl(url, recording.recordingId),
		navigate: (page, url) => openRecording(page, url),
		expectShown: (page) => expectRecordingViewShown(page)
	};

	const runAccessScenarios = (view: AccessView): void => {
		for (const scenario of accessScenarios) {
			test(scenario.title, async ({ page }) => {
				const url = view.buildUrl(scenario.getUrl());

				switch (scenario.kind) {
					case 'denied':
						await view.navigate(page, url);
						await performLogin(page, scenario.getUser!());
						await expectRoomAccessDenied(page);
						break;
					case 'login':
						await view.navigate(page, url);
						await expectLoginPage(page);
						await performLogin(page, scenario.getUser!());
						await view.expectShown(page, scenario.getName());
						break;
					case 'preauth':
						await authenticate(page, scenario.getUser!());
						await view.navigate(page, url);
						await expectNoLoginPage(page);
						await view.expectShown(page, scenario.getName());
						break;
					case 'anonymous':
						await view.navigate(page, url);
						await expectNoLoginPage(page);
						await view.expectShown(page, scenario.getName());
						break;
				}
			});
		}
	};

	// ── Room lobby access ──────────────────────────────────────────────────────

	test.describe('Room lobby access', () => {
		runAccessScenarios(lobbyView);
	});

	// ── Room recordings list access ──────────────────────────────────────────────

	test.describe('Room recordings list access', () => {
		runAccessScenarios(recordingsView);

		test('anonymous recording link can access the recordings list', async ({ page }) => {
			await openRoomRecordings(page, room.access.anonymous.recording.url);

			await expectRoomRecordingsListShown(page, recording.recordingId);
		});

		test('member without canRetrieveRecordings is denied access to the recordings list', async ({ page }) => {
			const deniedMember = await createRoomMember(room.roomId, {
				name: 'No Retrieve Member',
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: { canRetrieveRecordings: false }
			});

			await openRoomRecordings(page, toRoomRecordingsUrl(deniedMember.accessUrl));

			await expectRoomAccessDenied(page);
		});

		test('a combined access method grants canRetrieveRecordings when one method lacks it', async ({ page }) => {
			// Fresh room whose speaker role cannot retrieve recordings. The anonymous speaker link alone
			// would be denied, but the authenticated admin identity is merged in (union) → access granted.
			const gatedRoom = await createRoom({
				roles: { speaker: { permissions: { canRetrieveRecordings: false } } }
			});
			createdRoomIds.push(gatedRoom.roomId);

			await authenticate(page, adminUser);
			await openRoomRecordings(page, toRoomRecordingsUrl(gatedRoom.access.anonymous.speaker.url));

			await expectRoomRecordingsListShown(page);
		});
	});

	// ── Individual recording access ──────────────────────────────────────────────

	test.describe('Individual recording access', () => {
		runAccessScenarios(individualRecordingView);

		// Own cases: the per-recording shared links (public / private secrets).
		test('public shared link opens without login', async ({ page }) => {
			await openRecording(page, publicRecordingUrl);

			await expectNoLoginPage(page);
			await expectRecordingViewShown(page);
		});

		test('private shared link requires login for an anonymous visitor', async ({ page }) => {
			await openRecording(page, privateRecordingUrl);

			await expectLoginPage(page);
		});

		test('private shared link opens for a non-member after login', async ({ page }) => {
			await openRecording(page, privateRecordingUrl);
			await expectLoginPage(page);
			await performLogin(page, nonMemberUser);

			await expectRecordingViewShown(page);
		});

		test('private shared link opens for a member after login', async ({ page }) => {
			await openRecording(page, privateRecordingUrl);
			await expectLoginPage(page);
			await performLogin(page, memberUser);

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
