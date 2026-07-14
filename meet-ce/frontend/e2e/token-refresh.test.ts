import { MeetRoom, MeetRoomMemberRole, MeetRoomMemberUIBadge, MeetUserRole } from '@openvidu-meet/typings';
import { expect, test, type Page } from '@playwright/test';
import { createReadyMemberUser } from './helpers/access.helper';
import {
	authenticate,
	createReadyUser,
	expectLoginPage,
	expectNoLoginPage,
	type ReadyUser
} from './helpers/auth.helper';
import { createRoom, deleteRooms, deleteUsers, getRecordingShareUrl } from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';
import { toggleParticipantsPanel } from './helpers/panels.helper';
import {
	expectParticipantBadge,
	getParticipantIdByName,
	joinParticipants,
	makeParticipantModerator
} from './helpers/participant-management.helper';
import {
	openRecording,
	openRoomRecordings,
	toIndividualRecordingUrl,
	toRoomRecordingsUrl
} from './helpers/recordings-navigation.helper';
import {
	expectPublicRecordingUrlGenerated,
	expectRecordingViewShown,
	expectRoomRecordingsListShown,
	generatePublicRecordingUrl,
	openShareDialogFromList,
	openShareDialogFromRecordingView,
	recordRoom
} from './helpers/recordings.helper';
import { installTokenExpiryController, type TokenExpiryController } from './helpers/token-refresh.helper';

/**
 * Token-refresh tests drive the HTTP interceptor's refresh cascade. Tokens are not expired
 * server-side; {@link installTokenExpiryController} answers a request with a simulated 401 when the
 * token that *authorizes* it (per the backend's RMT-outranks-AT priority) is marked expired, while
 * letting the mint/refresh endpoints genuinely issue fresh tokens.
 *
 * Each scenario reaches a view with valid tokens, then arms one or more token expiries, then performs
 * an action that fires an authenticated request. The `outcome` is asserted from the resulting view
 * plus `blockedCount` (a 401 was actually simulated ⇒ the reactive cascade engaged):
 *
 * - `recover`   — the action succeeds after the cascade refreshes the expired token(s); `blockedCount > 0`.
 * - `no-refresh`— the action succeeds on the first try because a still-valid credential authorizes it
 *                 (e.g. a valid RMT outranks an expired access token); `blockedCount === 0`.
 * - `login`     — recovery is impossible (refresh token also expired) so the session ends at `/login`.
 *
 * Actions per view: **meeting** promotes a speaker to moderator (`PUT …/meetings/…/role`, RMT-only);
 * **recordings list** and **individual recording** generate a public URL via the share dialog
 * (`GET …/recordings/…/url`, RMT-then-AT); the **private-recording** block reloads the view (the
 * recording is re-fetched with the private secret + access token).
 */
test.describe('Token Refresh E2E Tests', () => {
	const createdUserIds: string[] = [];
	const createdRoomIds: string[] = [];

	let room: MeetRoom;
	let recordingId: string;
	let privateRecordingUrl: string;

	// A room member with the MODERATOR role: can retrieve recordings and promote participants, and can
	// log in via the room's user-access URL. Used as the authenticated "member" across every view.
	let memberModerator: ReadyUser;
	// A ROOM_MEMBER user who is NOT a member of this room: their access token never authorizes the
	// room's recordings, so a combined anonymous/guest link (its RMT) is what actually grants access.
	let nonMemberUser: ReadyUser;

	test.beforeAll(async ({ browser }) => {
		// Creating the recording drives a real meeting + egress, so allow extra time.
		test.setTimeout(180_000);

		room = await createRoom();
		createdRoomIds.push(room.roomId);

		memberModerator = (
			await createReadyMemberUser(room.roomId, {
				name: 'Refresh Member Moderator',
				baseRole: MeetRoomMemberRole.MODERATOR
			})
		).user;
		nonMemberUser = (await createReadyUser('Refresh Non Member', MeetUserRole.ROOM_MEMBER)).user;
		createdUserIds.push(memberModerator.userId, nonMemberUser.userId);

		recordingId = (await recordRoom(browser, room.roomId)).recordingId;
		privateRecordingUrl = await getRecordingShareUrl(recordingId, true);
	});

	test.afterAll(async () => {
		await Promise.all([deleteRooms(createdRoomIds), deleteUsers(createdUserIds)]);
	});

	// ── Shared scenario model ────────────────────────────────────────────────────

	/** Which tokens the scenario marks expired before performing its action. */
	type Expire = { rmt?: boolean; at?: boolean; rt?: boolean };
	type Outcome = 'recover' | 'no-refresh' | 'login';

	/** Arms the requested expiries. Access/refresh are read from storage; the RMT is captured live. */
	const armExpiry = async (ctrl: TokenExpiryController, expire: Expire): Promise<void> => {
		if (expire.at) {
			await ctrl.expireAccessToken();
		}
		if (expire.rt) {
			await ctrl.expireRefreshToken();
		}
		if (expire.rmt) {
			ctrl.expireRoomMemberToken();
		}
	};

	/** Asserts the resulting view + whether the reactive cascade engaged. `success` waits for the view. */
	const assertOutcome = async (
		page: Page,
		ctrl: TokenExpiryController,
		outcome: Outcome,
		success: () => Promise<void>
	): Promise<void> => {
		if (outcome === 'login') {
			await expectLoginPage(page);
			return;
		}

		await success();
		await expectNoLoginPage(page);

		if (outcome === 'recover') {
			expect(ctrl.blockedCount()).toBeGreaterThan(0);
		} else {
			expect(ctrl.blockedCount()).toBe(0);
		}
	};

	/**
	 * An access method for the recording views: who is acting and which URL carries their access.
	 * `anonymous` needs no login; `login` logs in through the target page; `preauth` establishes a user
	 * session first and then reaches the view through an anonymous/guest link.
	 */
	type Accessor = {
		label: string;
		kind: 'anonymous' | 'login' | 'preauth';
		getUrl: () => string;
		getUser?: () => ReadyUser;
	};

	const anonGuest: Accessor = {
		label: 'anonymous guest',
		kind: 'anonymous',
		// The anonymous moderator link grants canRetrieveRecordings (a speaker link would not).
		getUrl: () => room.access.anonymous.moderator.url
	};

	const memberAccessor: Accessor = {
		label: 'member user',
		kind: 'login',
		getUrl: () => room.access.user.url,
		getUser: () => memberModerator
	};

	const nonMemberGuest: Accessor = {
		label: 'non-member user + anonymous guest',
		kind: 'preauth',
		getUrl: () => room.access.anonymous.moderator.url,
		getUser: () => nonMemberUser
	};

	// ── Meeting view (action: promote a speaker to moderator) ─────────────────────

	test.describe('Meeting view', () => {
		type MeetingScenario = { title: string; actor: Accessor; expire: Expire; outcome: Outcome };

		const meetingScenarios: MeetingScenario[] = [
			{
				title: 'anonymous moderator guest recovers an expired room member token',
				actor: anonGuest,
				expire: { rmt: true },
				outcome: 'recover'
			},
			{
				title: 'member moderator recovers an expired room member token',
				actor: memberAccessor,
				expire: { rmt: true },
				outcome: 'recover'
			},
			{
				title: 'member moderator with an expired access token does not trigger a refresh (the room member token authorizes the action)',
				actor: memberAccessor,
				expire: { at: true },
				outcome: 'no-refresh'
			},
			{
				title: 'member moderator recovers an expired room member and access token',
				actor: memberAccessor,
				expire: { rmt: true, at: true },
				outcome: 'recover'
			},
			{
				title: 'member moderator with expired room member, access and refresh tokens is redirected to login',
				actor: memberAccessor,
				expire: { rmt: true, at: true, rt: true },
				outcome: 'login'
			}
		];

		for (const scenario of meetingScenarios) {
			test(scenario.title, async ({ page, browser }) => {
				const ctrl = await installTokenExpiryController(page);
				const target = await joinParticipants(browser, {
					roomId: room.roomId,
					// The make-moderator button keys off the target's presence in the panel, not its media.
					skipRemoteStreamCheck: true,
					participants: [{ name: 'Target', baseRole: MeetRoomMemberRole.SPEAKER, headless: true }]
				});

				try {
					const { actor } = scenario;
					await openMeeting(
						page,
						actor.getUrl(),
						actor.kind === 'login' ? { login: actor.getUser!() } : undefined
					);

					await toggleParticipantsPanel(page);
					const targetId = await getParticipantIdByName(page, 'Target');

					await armExpiry(ctrl, scenario.expire);
					await makeParticipantModerator(page, targetId);

					await assertOutcome(page, ctrl, scenario.outcome, () =>
						expectParticipantBadge(page, targetId, MeetRoomMemberUIBadge.MODERATOR)
					);
				} finally {
					await target.removeAllParticipants();
					await ctrl.dispose();
				}
			});
		}
	});

	// ── Recording views reached through a room access method ──────────────────────
	//
	// The recordings list and the individual recording are reached through the room URL (with the
	// `show-only-recordings` / `show-recording` params), so they inherit the room's access method and
	// always mint a room member token. The action opens the share dialog and generates a public URL —
	// a room-scoped request, so the RMT (when present) is what decides, and an expired access token is
	// ignored while the RMT is valid.

	type RecordingScenario = { title: string; actor: Accessor; expire: Expire; outcome: Outcome };

	const recordingScenarios: RecordingScenario[] = [
		{
			title: 'anonymous guest recovers an expired room member token',
			actor: anonGuest,
			expire: { rmt: true },
			outcome: 'recover'
		},
		// Corrected vs. a pure-OR assumption: the backend's withAuth is RMT-priority, so an expired RMT
		// 401s even though the member's access token is still valid — the cascade refreshes the RMT.
		{
			title: 'member user recovers an expired room member token',
			actor: memberAccessor,
			expire: { rmt: true },
			outcome: 'recover'
		},
		{
			title: 'member user with an expired access token does not trigger a refresh (the room member token authorizes the request)',
			actor: memberAccessor,
			expire: { at: true },
			outcome: 'no-refresh'
		},
		{
			title: 'member user recovers an expired room member and access token',
			actor: memberAccessor,
			expire: { rmt: true, at: true },
			outcome: 'recover'
		},
		{
			title: 'member user with expired room member, access and refresh tokens is redirected to login',
			actor: memberAccessor,
			expire: { rmt: true, at: true, rt: true },
			outcome: 'login'
		},
		{
			title: 'non-member user via anonymous guest recovers an expired room member token',
			actor: nonMemberGuest,
			expire: { rmt: true },
			outcome: 'recover'
		},
		{
			title: 'non-member user via anonymous guest with an expired access token does not trigger a refresh',
			actor: nonMemberGuest,
			expire: { at: true },
			outcome: 'no-refresh'
		},
		{
			title: 'non-member user via anonymous guest recovers an expired room member and access token',
			actor: nonMemberGuest,
			expire: { rmt: true, at: true },
			outcome: 'recover'
		},
		// The RMT is minted from the anonymous link's room secret, so it is re-mintable without a valid
		// access/refresh token — the session recovers even with all three expired (no logout).
		{
			title: 'non-member user via anonymous guest recovers with expired room member, access and refresh tokens (secret-based mint)',
			actor: nonMemberGuest,
			expire: { rmt: true, at: true, rt: true },
			outcome: 'recover'
		}
	];

	// ── Room recordings list view ─────────────────────────────────────────────────

	test.describe('Room recordings list view', () => {
		for (const scenario of recordingScenarios) {
			test(scenario.title, async ({ page }) => {
				const ctrl = await installTokenExpiryController(page);

				try {
					const { actor } = scenario;
					if (actor.kind === 'preauth') {
						await authenticate(page, actor.getUser!());
					}
					await openRoomRecordings(
						page,
						toRoomRecordingsUrl(actor.getUrl()),
						actor.kind === 'login' ? { login: actor.getUser!() } : undefined
					);
					await expectRoomRecordingsListShown(page, recordingId);

					await armExpiry(ctrl, scenario.expire);
					// Opening the dialog fires a room-scoped lookup that drives (and recovers) the cascade;
					// generating the URL is skipped for the `login` outcome, where the session has ended.
					await openShareDialogFromList(page, recordingId);

					await assertOutcome(page, ctrl, scenario.outcome, async () => {
						await generatePublicRecordingUrl(page);
						await expectPublicRecordingUrlGenerated(page);
					});
				} finally {
					await ctrl.dispose();
				}
			});
		}
	});

	// ── Individual recording view (reached through the room) ───────────────────────

	test.describe('Individual recording view', () => {
		for (const scenario of recordingScenarios) {
			test(scenario.title, async ({ page }) => {
				const ctrl = await installTokenExpiryController(page);

				try {
					const { actor } = scenario;
					if (actor.kind === 'preauth') {
						await authenticate(page, actor.getUser!());
					}
					await openRecording(
						page,
						toIndividualRecordingUrl(actor.getUrl(), recordingId),
						actor.kind === 'login' ? { login: actor.getUser!() } : undefined
					);
					await expectRecordingViewShown(page);

					await armExpiry(ctrl, scenario.expire);
					// Opening the dialog fires a room-scoped lookup that drives (and recovers) the cascade;
					// generating the URL is skipped for the `login` outcome, where the session has ended.
					await openShareDialogFromRecordingView(page);

					await assertOutcome(page, ctrl, scenario.outcome, async () => {
						await generatePublicRecordingUrl(page);
						await expectPublicRecordingUrlGenerated(page);
					});
				} finally {
					await ctrl.dispose();
				}
			});
		}
	});

	// ── Individual recording via a private shared link ─────────────────────────────
	//
	// Two groups, distinguished by whether a room member token exists:
	//
	// - A NON-member opens the link (no room member token is minted — the access token, validated
	//   against the private secret, is the only credential). Reloading re-fetches the recording,
	//   exercising the access-token path: an expired access token is refreshed, and once the refresh
	//   token is also expired the session ends at login. Expiring the (non-existent) RMT is a no-op.
	// - A MEMBER opens the link: the entry guard mints an RMT (they have room access), which then
	//   authorizes the room-scoped generate-URL action and outranks the access token — so the private
	//   secret is irrelevant and the outcomes match the room-reached member scenarios.

	test.describe('Individual recording via private link', () => {
		type PrivateScenario = { title: string; expire: Expire; outcome: Outcome };

		const privateScenarios: PrivateScenario[] = [
			{
				title: 'non-member recovers an expired access token',
				expire: { at: true },
				outcome: 'recover'
			},
			{
				title: 'non-member with expired access and refresh tokens is redirected to login',
				expire: { at: true, rt: true },
				outcome: 'login'
			}
		];

		for (const scenario of privateScenarios) {
			test(scenario.title, async ({ page }) => {
				const ctrl = await installTokenExpiryController(page);

				try {
					await openRecording(page, privateRecordingUrl, { login: nonMemberUser });
					await expectRecordingViewShown(page);

					await armExpiry(ctrl, scenario.expire);
					await page.reload({ waitUntil: 'domcontentloaded' });

					await assertOutcome(page, ctrl, scenario.outcome, () => expectRecordingViewShown(page));
				} finally {
					await ctrl.dispose();
				}
			});
		}

		// A MEMBER opening the same private link is different from the non-member above: because they
		// have room access, the entry guard mints a room member token, which then authorizes the
		// room-scoped generate-URL action and outranks the access token. So the outcomes mirror the
		// room-reached member scenarios — an expired RMT recovers, while an expired access (and even
		// refresh) token is ignored while the RMT is valid. These use the generate-public-URL action
		// (the member can retrieve recordings), so the private secret is irrelevant to the request.
		const memberPrivateScenarios: PrivateScenario[] = [
			{
				title: 'member user recovers an expired room member token',
				expire: { rmt: true },
				outcome: 'recover'
			},
			{
				title: 'member user with an expired access token does not trigger a refresh (the room member token authorizes the request)',
				expire: { at: true },
				outcome: 'no-refresh'
			},
			{
				title: 'member user with expired access and refresh tokens does not trigger a refresh (the room member token authorizes the request)',
				expire: { at: true, rt: true },
				outcome: 'no-refresh'
			},
			{
				title: 'member user recovers an expired room member and access token',
				expire: { rmt: true, at: true },
				outcome: 'recover'
			},
			{
				title: 'member user with expired room member, access and refresh tokens is redirected to login',
				expire: { rmt: true, at: true, rt: true },
				outcome: 'login'
			}
		];

		for (const scenario of memberPrivateScenarios) {
			test(scenario.title, async ({ page }) => {
				const ctrl = await installTokenExpiryController(page);

				try {
					await openRecording(page, privateRecordingUrl, { login: memberModerator });
					await expectRecordingViewShown(page);

					await armExpiry(ctrl, scenario.expire);
					// Opening the dialog fires a room-scoped lookup that drives (and recovers) the cascade;
					// generating the URL is skipped for the `login` outcome, where the session has ended.
					await openShareDialogFromRecordingView(page);

					await assertOutcome(page, ctrl, scenario.outcome, async () => {
						await generatePublicRecordingUrl(page);
						await expectPublicRecordingUrlGenerated(page);
					});
				} finally {
					await ctrl.dispose();
				}
			});
		}
	});
});
