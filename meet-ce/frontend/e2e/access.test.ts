import { MeetRoom, MeetRoomMember, MeetRoomMemberRole, MeetUserRole } from '@openvidu-meet/typings';
import { test, type Page } from '@playwright/test';
import { createReadyMemberUser, expectNameInput, expectRoomAccessDenied } from './helpers/access.helper';
import {
	authenticate,
	createReadyUser,
	expectLoginPage,
	expectNoLoginPage,
	performLogin,
	type ReadyUser
} from './helpers/auth.helper';
import {
	createRoomAsUser,
	createRoomMember,
	deleteRooms,
	deleteUsers,
	getRecordingShareUrl,
	updateRoomRoles
} from './helpers/meet-api.helper';
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
 * same set of access methods is exercised against several views (room lobby, recordings list,
 * individual recording), which are reached through the same room URL: the recordings list and an
 * individual recording are opened by adding the `show-only-recordings` / `show-recording` query
 * params, so they inherit the room's access method. For the room lobby we also check the
 * participant-name input (value + editability). Permissions are covered in `permissions.test.ts`.
 */
test.describe('Access E2E Tests', () => {
	const createdUserIds: string[] = [];
	const createdRoomIds: string[] = [];

	let room: MeetRoom;
	let recordingId: string;
	let publicRecordingUrl: string;
	let privateRecordingUrl: string;

	let ownerUser: ReadyUser;
	let adminUser: ReadyUser;
	let nonMemberUser: ReadyUser;
	let memberUser: ReadyUser;
	let memberNoRetrieve: ReadyUser;
	let speakerGuest: MeetRoomMember;
	let guestNoRetrieve: MeetRoomMember;

	test.beforeAll(async ({ browser }) => {
		// Creating the recording drives a real meeting + egress, so allow extra time.
		test.setTimeout(180_000);

		// The shared room is created by the owner (a room manager) using their access token.
		const owner = await createReadyUser('Room Owner', MeetUserRole.ROOM_MANAGER);
		ownerUser = owner.user;
		createdUserIds.push(ownerUser.userId);

		room = await createRoomAsUser(owner.accessToken);
		createdRoomIds.push(room.roomId);

		adminUser = (await createReadyUser('Room Admin')).user;
		nonMemberUser = (await createReadyUser('Non Member', MeetUserRole.ROOM_MEMBER)).user;
		createdUserIds.push(adminUser.userId, nonMemberUser.userId);

		memberUser = (
			await createReadyMemberUser(room.roomId, {
				name: 'Member User',
				baseRole: MeetRoomMemberRole.SPEAKER
			})
		).user;
		createdUserIds.push(memberUser.userId);

		// A member without canRetrieveRecordings.
		memberNoRetrieve = (
			await createReadyMemberUser(room.roomId, {
				name: 'Member No Retrieve',
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: { canRetrieveRecordings: false }
			})
		).user;
		createdUserIds.push(memberNoRetrieve.userId);

		speakerGuest = await createRoomMember(room.roomId, {
			name: 'Speaker Guest',
			baseRole: MeetRoomMemberRole.SPEAKER
		});

		// A guest without canRetrieveRecordings.
		guestNoRetrieve = await createRoomMember(room.roomId, {
			name: 'Guest No Retrieve',
			baseRole: MeetRoomMemberRole.SPEAKER,
			customPermissions: { canRetrieveRecordings: false }
		});

		recordingId = (await recordRoom(browser, room.roomId)).recordingId;
		[publicRecordingUrl, privateRecordingUrl] = await Promise.all([
			getRecordingShareUrl(recordingId, false),
			getRecordingShareUrl(recordingId, true)
		]);
	});

	test.afterAll(async () => {
		await Promise.all([deleteRooms(createdRoomIds), deleteUsers(createdUserIds)]);
	});

	// ── Scenario / view model ────────────────────────────────────────────────────
	//
	// A scenario describes one way an individual reaches a view, with an `outcome`. It is run against
	// a `view` that decides how to build the URL, how to navigate, and what "shown" means. Getters are
	// used because the individuals are only created in `beforeAll` (after the scenarios are declared).

	type NameExpect = { value: string; editable: boolean };

	type Scenario = {
		title: string;
		/** anonymous → no login; login → login form then log in; preauth → establish a session first. */
		kind: 'anonymous' | 'login' | 'preauth';
		outcome: 'shown' | 'denied';
		getUrl: () => string;
		getUser?: () => ReadyUser;
		/** Only used by the lobby view (the expected participant-name input state). */
		getName?: () => NameExpect;
		/** Temporarily remove canRetrieveRecordings from the room's speaker role for this test. */
		gateSpeakerRetrieve?: boolean;
	};

	type View = {
		/** Builds the view URL from the scenario URL (identity when the URL is already final). */
		buildUrl: (url: string) => string;
		/** Navigates without logging in and without waiting for the final view. */
		navigate: (page: Page, url: string) => Promise<void>;
		/** Asserts the expected view is shown (the name is only used by the lobby). */
		expectShown: (page: Page, name?: NameExpect) => Promise<void>;
	};

	const lobbyView: View = {
		buildUrl: (url) => url,
		navigate: (page, url) => openLobby(page, url, { checkNameInput: false }),
		expectShown: (page, name) => expectNameInput(page, name!)
	};

	const recordingsListView: View = {
		buildUrl: (url) => toRoomRecordingsUrl(url),
		navigate: (page, url) => openRoomRecordings(page, url),
		expectShown: (page) => expectRoomRecordingsListShown(page, recordingId)
	};

	const individualRecordingView: View = {
		buildUrl: (url) => toIndividualRecordingUrl(url, recordingId),
		navigate: (page, url) => openRecording(page, url),
		expectShown: (page) => expectRecordingViewShown(page)
	};

	// Individual recording reached through a per-recording share link (the URL is already final).
	const recordingShareView: View = {
		buildUrl: (url) => url,
		navigate: (page, url) => openRecording(page, url),
		expectShown: (page) => expectRecordingViewShown(page)
	};

	/** Removes canRetrieveRecordings from the room's speaker role; returns a restore function. */
	const gateSpeakerRetrieve = async (): Promise<() => Promise<void>> => {
		await updateRoomRoles(room.roomId, { speaker: { permissions: { canRetrieveRecordings: false } } });
		return () => updateRoomRoles(room.roomId, { speaker: { permissions: { canRetrieveRecordings: true } } });
	};

	/** Extracts the `secret` query param from a room / guest access URL. */
	const secretOf = (accessUrl: string): string => new URL(accessUrl).searchParams.get('secret') ?? '';

	/** Appends a room access `secret` to a recording share link (combined secret access). */
	const withRoomSecret = (recordingShareUrl: string, roomSecret: string): string => {
		const url = new URL(recordingShareUrl);
		url.searchParams.set('secret', roomSecret);
		return url.toString();
	};

	const runScenarios = (view: View, scenarios: Scenario[]): void => {
		for (const scenario of scenarios) {
			test(scenario.title, async ({ page }) => {
				const restoreRoles = scenario.gateSpeakerRetrieve ? await gateSpeakerRetrieve() : undefined;

				try {
					const url = view.buildUrl(scenario.getUrl());

					if (scenario.kind === 'preauth') {
						await authenticate(page, scenario.getUser!());
					}

					await view.navigate(page, url);

					if (scenario.kind === 'login') {
						await expectLoginPage(page);
						await performLogin(page, scenario.getUser!());
					}

					if (scenario.outcome === 'denied') {
						await expectRoomAccessDenied(page);
						return;
					}

					if (scenario.kind !== 'login') {
						await expectNoLoginPage(page);
					}
					await view.expectShown(page, scenario.getName?.());
				} finally {
					await restoreRoles?.();
				}
			});
		}
	};

	// ── Scenarios ────────────────────────────────────────────────────────────────

	// Base access matrix — how each individual reaches the room. Run against every view.
	const accessScenarios: Scenario[] = [
		{
			title: 'admin user must log in first',
			kind: 'login',
			outcome: 'shown',
			getUrl: () => room.access.user.url,
			getUser: () => adminUser,
			getName: () => ({ value: adminUser.name, editable: false })
		},
		{
			title: 'owner user must log in first',
			kind: 'login',
			outcome: 'shown',
			getUrl: () => room.access.user.url,
			getUser: () => ownerUser,
			getName: () => ({ value: ownerUser.name, editable: false })
		},
		{
			title: 'member user must log in first',
			kind: 'login',
			outcome: 'shown',
			getUrl: () => room.access.user.url,
			getUser: () => memberUser,
			getName: () => ({ value: memberUser.name, editable: false })
		},
		{
			title: 'non-member user is denied access when room user access is disabled',
			kind: 'login',
			outcome: 'denied',
			getUrl: () => room.access.user.url,
			getUser: () => nonMemberUser
		},
		{
			title: 'anonymous moderator guest has access without login',
			kind: 'anonymous',
			outcome: 'shown',
			getUrl: () => room.access.anonymous.moderator.url,
			getName: () => ({ value: '', editable: true })
		},
		{
			title: 'anonymous speaker guest has access without login',
			kind: 'anonymous',
			outcome: 'shown',
			getUrl: () => room.access.anonymous.speaker.url,
			getName: () => ({ value: '', editable: true })
		},
		{
			title: 'identified guest has access without login',
			kind: 'anonymous',
			outcome: 'shown',
			getUrl: () => speakerGuest.accessUrl,
			getName: () => ({ value: speakerGuest.name, editable: false })
		},
		{
			title: 'non-member user gains access via an anonymous link',
			kind: 'preauth',
			outcome: 'shown',
			getUrl: () => room.access.anonymous.speaker.url,
			getUser: () => nonMemberUser,
			getName: () => ({ value: nonMemberUser.name, editable: false })
		},
		{
			title: 'non-member user gains access via an identified guest link',
			kind: 'preauth',
			outcome: 'shown',
			getUrl: () => speakerGuest.accessUrl,
			getUser: () => nonMemberUser,
			getName: () => ({ value: speakerGuest.name, editable: false })
		},
		{
			title: 'member user gains access via an identified guest link',
			kind: 'preauth',
			outcome: 'shown',
			getUrl: () => speakerGuest.accessUrl,
			getUser: () => memberUser,
			getName: () => ({ value: speakerGuest.name, editable: false })
		}
	];

	// canRetrieveRecordings gating — reaching a recording via a room access method. Run against the
	// recordings list and the individual recording (via the room URL, i.e. no recording secret).
	const recordingAccessScenarios: Scenario[] = [
		{
			title: 'anonymous speaker without canRetrieveRecordings is denied',
			kind: 'anonymous',
			outcome: 'denied',
			getUrl: () => room.access.anonymous.speaker.url,
			gateSpeakerRetrieve: true
		},
		{
			title: 'identified guest without canRetrieveRecordings is denied',
			kind: 'anonymous',
			outcome: 'denied',
			getUrl: () => guestNoRetrieve.accessUrl
		},
		{
			title: 'non-member user via anonymous speaker link without canRetrieveRecordings is denied',
			kind: 'preauth',
			outcome: 'denied',
			getUrl: () => room.access.anonymous.speaker.url,
			getUser: () => nonMemberUser,
			gateSpeakerRetrieve: true
		},
		{
			title: 'non-member user via identified guest link without canRetrieveRecordings is denied',
			kind: 'preauth',
			outcome: 'denied',
			getUrl: () => guestNoRetrieve.accessUrl,
			getUser: () => nonMemberUser
		},
		{
			title: 'member user without canRetrieveRecordings via anonymous speaker link gains access',
			kind: 'preauth',
			outcome: 'shown',
			getUrl: () => room.access.anonymous.speaker.url,
			getUser: () => memberNoRetrieve
		},
		{
			title: 'member user without canRetrieveRecordings via identified guest link gains access',
			kind: 'preauth',
			outcome: 'shown',
			getUrl: () => speakerGuest.accessUrl,
			getUser: () => memberNoRetrieve
		},
		{
			title: 'member user without canRetrieveRecordings via anonymous speaker link without canRetrieveRecordings is denied',
			kind: 'preauth',
			outcome: 'denied',
			getUrl: () => room.access.anonymous.speaker.url,
			getUser: () => memberNoRetrieve,
			gateSpeakerRetrieve: true
		},
		{
			title: 'member user without canRetrieveRecordings via identified guest link without canRetrieveRecordings is denied',
			kind: 'preauth',
			outcome: 'denied',
			getUrl: () => guestNoRetrieve.accessUrl,
			getUser: () => memberNoRetrieve
		}
	];

	// Per-recording share links (public / private secret). A share secret grants view access on its
	// own — regardless of the access method's canRetrieveRecordings — so these always show the
	// recording. Combined-access cases append the room access secret to the share link.
	const recordingShareScenarios: Scenario[] = [
		{
			title: 'public shared link opens without login',
			kind: 'anonymous',
			outcome: 'shown',
			getUrl: () => publicRecordingUrl
		},
		{
			title: 'private shared link opens for a non-member after login',
			kind: 'login',
			outcome: 'shown',
			getUrl: () => privateRecordingUrl,
			getUser: () => nonMemberUser
		},
		{
			title: 'private shared link opens for a member after login',
			kind: 'login',
			outcome: 'shown',
			getUrl: () => privateRecordingUrl,
			getUser: () => memberUser
		},
		{
			title: 'non-member user via public share link',
			kind: 'preauth',
			outcome: 'shown',
			getUrl: () => publicRecordingUrl,
			getUser: () => nonMemberUser
		},
		{
			title: 'member user without canRetrieveRecordings via private share link',
			kind: 'login',
			outcome: 'shown',
			getUrl: () => privateRecordingUrl,
			getUser: () => memberNoRetrieve
		},
		{
			title: 'member user without canRetrieveRecordings via public share link',
			kind: 'preauth',
			outcome: 'shown',
			getUrl: () => publicRecordingUrl,
			getUser: () => memberNoRetrieve
		},
		{
			title: 'anonymous speaker without canRetrieveRecordings via public share link',
			kind: 'anonymous',
			outcome: 'shown',
			getUrl: () => withRoomSecret(publicRecordingUrl, secretOf(room.access.anonymous.speaker.url)),
			gateSpeakerRetrieve: true
		},
		{
			title: 'identified guest without canRetrieveRecordings via public share link',
			kind: 'anonymous',
			outcome: 'shown',
			getUrl: () => withRoomSecret(publicRecordingUrl, secretOf(guestNoRetrieve.accessUrl))
		},
		{
			title: 'non-member user via anonymous speaker link without canRetrieveRecordings via private share link',
			kind: 'login',
			outcome: 'shown',
			getUrl: () => withRoomSecret(privateRecordingUrl, secretOf(room.access.anonymous.speaker.url)),
			getUser: () => nonMemberUser,
			gateSpeakerRetrieve: true
		},
		{
			title: 'non-member user via anonymous speaker link without canRetrieveRecordings via public share link',
			kind: 'preauth',
			outcome: 'shown',
			getUrl: () => withRoomSecret(publicRecordingUrl, secretOf(room.access.anonymous.speaker.url)),
			getUser: () => nonMemberUser,
			gateSpeakerRetrieve: true
		},
		{
			title: 'non-member user via identified guest link without canRetrieveRecordings via private share link',
			kind: 'login',
			outcome: 'shown',
			getUrl: () => withRoomSecret(privateRecordingUrl, secretOf(guestNoRetrieve.accessUrl)),
			getUser: () => nonMemberUser
		},
		{
			title: 'non-member user via identified guest link without canRetrieveRecordings via public share link',
			kind: 'preauth',
			outcome: 'shown',
			getUrl: () => withRoomSecret(publicRecordingUrl, secretOf(guestNoRetrieve.accessUrl)),
			getUser: () => nonMemberUser
		},
		{
			title: 'member user without canRetrieveRecordings via anonymous speaker link without canRetrieveRecordings via private share link',
			kind: 'login',
			outcome: 'shown',
			getUrl: () => withRoomSecret(privateRecordingUrl, secretOf(room.access.anonymous.speaker.url)),
			getUser: () => memberNoRetrieve,
			gateSpeakerRetrieve: true
		},
		{
			title: 'member user without canRetrieveRecordings via anonymous speaker link without canRetrieveRecordings via public share link',
			kind: 'preauth',
			outcome: 'shown',
			getUrl: () => withRoomSecret(publicRecordingUrl, secretOf(room.access.anonymous.speaker.url)),
			getUser: () => memberNoRetrieve,
			gateSpeakerRetrieve: true
		},
		{
			title: 'member user without canRetrieveRecordings via identified guest link without canRetrieveRecordings via private share link',
			kind: 'login',
			outcome: 'shown',
			getUrl: () => withRoomSecret(privateRecordingUrl, secretOf(guestNoRetrieve.accessUrl)),
			getUser: () => memberNoRetrieve
		},
		{
			title: 'member user without canRetrieveRecordings via identified guest link without canRetrieveRecordings via public share link',
			kind: 'preauth',
			outcome: 'shown',
			getUrl: () => withRoomSecret(publicRecordingUrl, secretOf(guestNoRetrieve.accessUrl)),
			getUser: () => memberNoRetrieve
		}
	];

	// ── Room lobby access ──────────────────────────────────────────────────────

	test.describe('Room lobby access', () => {
		runScenarios(lobbyView, accessScenarios);
	});

	// ── Room recordings list access ──────────────────────────────────────────────

	test.describe('Room recordings list access', () => {
		runScenarios(recordingsListView, accessScenarios);

		test('anonymous recording link can access the recordings list', async ({ page }) => {
			await openRoomRecordings(page, room.access.anonymous.recording.url);

			await expectRoomRecordingsListShown(page, recordingId);
		});

		runScenarios(recordingsListView, recordingAccessScenarios);
	});

	// ── Individual recording access ──────────────────────────────────────────────

	test.describe('Individual recording access', () => {
		runScenarios(individualRecordingView, accessScenarios);
		runScenarios(individualRecordingView, recordingAccessScenarios);
		runScenarios(recordingShareView, recordingShareScenarios);
	});
});
