import {
	MeetRoom,
	MeetRoomMember,
	MeetRoomMemberPermissions,
	MeetRoomMemberRole,
	MeetRoomMemberUIBadge,
	MeetUserRole
} from '@openvidu-meet/typings';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createReadyMemberUser, expectLobbyAccessRestricted, expectNameInput } from './helpers/access.helper';
import { authenticate, createReadyUser, type ReadyUser } from './helpers/auth.helper';
import { expectChatAvailable, expectNoChat, toggleChatPanel } from './helpers/chat.helper';
import {
	expectBackgroundsButtonAvailable,
	expectCameraButtonAvailable,
	expectMicButtonAvailable,
	expectNoBackgroundsButton,
	expectNoCameraButton,
	expectNoMicButton,
	expectNoScreenshareButton,
	expectScreenshareButtonAvailable
} from './helpers/media-controls.helper';
import {
	createRoom,
	createRoomAsUser,
	createRoomMember,
	deleteRooms,
	deleteUser,
	deleteUsers,
	updateRoomMemberPermissions,
	updateUserRole
} from './helpers/meet-api.helper';
import {
	expectEndMeetingOption,
	expectKickedFromMeeting,
	expectMeetingAccessRevoked,
	expectNoEndMeetingOption,
	openLobby,
	openMeeting
} from './helpers/meeting-navigation.helper';
import { toggleParticipantsPanel } from './helpers/panels.helper';
import {
	expectKickButton,
	expectMakeModeratorButton,
	expectNoKickButton,
	expectNoMakeModeratorButton,
	expectParticipantBadge,
	getLocalParticipantId,
	getParticipantIdByName,
	joinParticipants
} from './helpers/participant-management.helper';
import {
	openRecording,
	openRoomRecordings,
	toIndividualRecordingUrl,
	toRoomRecordingsUrl
} from './helpers/recordings-navigation.helper';
import {
	expectNoRecordButton,
	expectNoViewRecordingsButton,
	expectRecordButtonAvailable,
	expectRecordingDeletable,
	expectRecordingNotDeletable,
	expectViewRecordingDeletable,
	expectViewRecordingNotDeletable,
	expectViewRecordingsButtonAvailable,
	recordRoom
} from './helpers/recordings.helper';
import { expectNoShareAccessLink, expectShareAccessLinkAvailable } from './helpers/share-link.helper';

test.describe('Permissions E2E Tests', () => {
	const createdUserIds: string[] = [];
	const createdRoomIds: string[] = [];
	let memberSequence = 0;

	let room: MeetRoom;
	let adminUser: ReadyUser;
	// A speaker member and an identified moderator guest, used by the merged-permission scenarios: a
	// member user (speaker) combined with a moderator link gains the moderator's permissions.
	let mergedMemberUser: ReadyUser;
	let moderatorGuest: MeetRoomMember;

	test.beforeAll(async () => {
		room = await createRoom();
		createdRoomIds.push(room.roomId);

		adminUser = (await createReadyUser('Perm Admin')).user;
		createdUserIds.push(adminUser.userId);

		mergedMemberUser = (
			await createReadyMemberUser(room.roomId, {
				name: 'Merged Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			})
		).user;
		createdUserIds.push(mergedMemberUser.userId);

		moderatorGuest = await createRoomMember(room.roomId, {
			name: 'Moderator Guest',
			baseRole: MeetRoomMemberRole.MODERATOR
		});
	});

	test.afterAll(async () => {
		await Promise.all([deleteRooms(createdRoomIds), deleteUsers(createdUserIds)]);
	});

	/**
	 * Creates an identified-guest member of the shared room with the given base role and custom
	 * permission overrides — the access URL requires no login, so the member can be driven directly.
	 */
	const createGuest = (
		customPermissions: Partial<MeetRoomMemberPermissions>,
		baseRole = MeetRoomMemberRole.SPEAKER
	) => createRoomMember(room.roomId, { name: `perm-${memberSequence++}`, baseRole, customPermissions });

	/**
	 * Joins the meeting as a fresh guest with the given custom permissions and returns the member.
	 */
	const joinAsGuest = async (
		page: Page,
		customPermissions: Partial<MeetRoomMemberPermissions>,
		options: { baseRole?: MeetRoomMemberRole; skipPrejoinMediaCheck?: boolean } = {}
	) => {
		const member = await createGuest(customPermissions, options.baseRole);
		await openMeeting(page, member.accessUrl, { skipPrejoinMediaCheck: options.skipPrejoinMediaCheck });
		return member;
	};

	/**
	 * Lazily records the shared room the first time a recording-dependent test asks for it, caching the
	 * completed recording's id for the rest of the suite.
	 */
	let cachedRecordingId: string | undefined;

	const ensureRecording = async (browser: Browser): Promise<string> => {
		if (!cachedRecordingId) {
			test.setTimeout(180_000);
			const recording = await recordRoom(browser, room.roomId);
			cachedRecordingId = recording.recordingId;
		}

		return cachedRecordingId;
	};

	// ── Lobby permissions ─────────────────────────────────────────────────────────

	test.describe('Room lobby', () => {
		test('canJoinMeeting granted: the lobby join form is shown', async ({ page }) => {
			const member = await createGuest({ canJoinMeeting: true });
			await openLobby(page, member.accessUrl);

			await expectNameInput(page, { value: member.name, editable: false });
		});

		test('canJoinMeeting denied: the lobby shows the access-restricted card', async ({ page }) => {
			const member = await createGuest({ canJoinMeeting: false });
			await page.goto(member.accessUrl, { waitUntil: 'domcontentloaded' });

			await expectLobbyAccessRestricted(page);
		});
	});

	// ── Meeting permissions (single participant) ────────────────────────────────────

	test.describe('Meeting', () => {
		test('canRecord granted: the recording control is available', async ({ page }) => {
			await joinAsGuest(page, { canRecord: true });
			await expectRecordButtonAvailable(page);
		});

		test('canRecord denied: the recording control is not available', async ({ page }) => {
			await joinAsGuest(page, { canRecord: false });
			await expectNoRecordButton(page);
		});

		test('canRetrieveRecordings granted: the view-recordings control is available', async ({ page, browser }) => {
			// The button is gated by both the permission and the room actually having recordings
			// (`hasRecordings()`), so a completed recording must exist before joining.
			await ensureRecording(browser);
			await joinAsGuest(page, { canRetrieveRecordings: true });
			await expectViewRecordingsButtonAvailable(page);
		});

		test('canRetrieveRecordings denied: the view-recordings control is not available', async ({ page }) => {
			await joinAsGuest(page, { canRetrieveRecordings: false });
			await expectNoViewRecordingsButton(page);
		});

		test('canReadChat granted: the chat panel button is available', async ({ page }) => {
			await joinAsGuest(page, { canReadChat: true });
			await expectChatAvailable(page);
		});

		test('canReadChat denied: the chat panel button is not available', async ({ page }) => {
			await joinAsGuest(page, { canReadChat: false });
			await expectNoChat(page);
		});

		test('canWriteChat granted: the chat input is editable', async ({ page }) => {
			await joinAsGuest(page, { canReadChat: true, canWriteChat: true });
			await toggleChatPanel(page, 'open');
			await expect(page.locator('#chat-input')).toBeEnabled();
			await expect(page.locator('#send-btn')).toBeEnabled();
		});

		test('canWriteChat denied: the chat panel opens but the input is disabled', async ({ page }) => {
			await joinAsGuest(page, { canReadChat: true, canWriteChat: false });
			await toggleChatPanel(page, 'open');
			await expect(page.locator('#chat-input')).toBeDisabled();
			await expect(page.locator('#send-btn')).toBeDisabled();
		});

		test('canChangeVirtualBackground granted: the backgrounds control is available', async ({ page }) => {
			await joinAsGuest(page, { canChangeVirtualBackground: true });
			await expectBackgroundsButtonAvailable(page);
		});

		test('canChangeVirtualBackground denied: the backgrounds control is not available', async ({ page }) => {
			await joinAsGuest(page, { canChangeVirtualBackground: false });
			await expectNoBackgroundsButton(page);
		});

		test('canPublishVideo granted: the camera button is available', async ({ page }) => {
			await joinAsGuest(page, { canPublishVideo: true });
			await expectCameraButtonAvailable(page);
		});

		test('canPublishVideo denied: the camera button is not available', async ({ page }) => {
			await joinAsGuest(page, { canPublishVideo: false }, { skipPrejoinMediaCheck: true });
			await expectNoCameraButton(page);
		});

		test('canPublishAudio granted: the microphone button is available', async ({ page }) => {
			await joinAsGuest(page, { canPublishAudio: true });
			await expectMicButtonAvailable(page);
		});

		test('canPublishAudio denied: the microphone button is not available', async ({ page }) => {
			await joinAsGuest(page, { canPublishAudio: false }, { skipPrejoinMediaCheck: true });
			await expectNoMicButton(page);
		});

		test('canShareScreen granted: the screen-share button is available', async ({ page }) => {
			await joinAsGuest(page, { canShareScreen: true });
			await expectScreenshareButtonAvailable(page);
		});

		test('canShareScreen denied: the screen-share button is not available', async ({ page }) => {
			await joinAsGuest(page, { canShareScreen: false });
			await expectNoScreenshareButton(page);
		});

		test('canShareAccessLinks granted: the share-access-link button is available', async ({ page }) => {
			await joinAsGuest(page, { canShareAccessLinks: true });
			await expectShareAccessLinkAvailable(page);
		});

		test('canShareAccessLinks denied: the share-access-link button is not available', async ({ page }) => {
			await joinAsGuest(page, { canShareAccessLinks: false });
			await expectNoShareAccessLink(page);
		});

		test('canEndMeeting granted: the end-meeting option is available', async ({ page }) => {
			await joinAsGuest(page, { canEndMeeting: true });
			await expectEndMeetingOption(page);
		});

		test('canEndMeeting denied: the end-meeting option is not available', async ({ page }) => {
			await joinAsGuest(page, { canEndMeeting: false });
			await expectNoEndMeetingOption(page);
		});
	});

	// ── Meeting permissions (require a second participant) ───────────────────────────

	test.describe('Meeting (moderation over another participant)', () => {
		const withTarget = async (
			browser: Browser,
			actorPermissions: Partial<MeetRoomMemberPermissions>,
			assertion: (actorPage: Page, targetId: string) => Promise<void>
		): Promise<void> => {
			const { byName, removeAllParticipants } = await joinParticipants(browser, {
				roomId: room.roomId,
				// The moderation buttons key off the target's presence in the participants panel, not its
				// media, so the remote-stream wait is skipped to avoid unrelated media-timing flakiness.
				skipRemoteStreamCheck: true,
				participants: [
					{ name: 'Actor', baseRole: MeetRoomMemberRole.SPEAKER, customPermissions: actorPermissions },
					{ name: 'Target', baseRole: MeetRoomMemberRole.SPEAKER, headless: true }
				]
			});

			try {
				const actorPage = byName['Actor'];
				await toggleParticipantsPanel(actorPage);
				const targetId = await getParticipantIdByName(actorPage, 'Target');
				await assertion(actorPage, targetId);
			} finally {
				await removeAllParticipants();
			}
		};

		test('canMakeModerator granted: the make-moderator button is available', async ({ browser }) => {
			await withTarget(browser, { canMakeModerator: true }, expectMakeModeratorButton);
		});

		test('canMakeModerator denied: the make-moderator button is not available', async ({ browser }) => {
			await withTarget(browser, { canMakeModerator: false }, expectNoMakeModeratorButton);
		});

		test('canKickParticipants granted: the kick button is available', async ({ browser }) => {
			await withTarget(browser, { canKickParticipants: true }, expectKickButton);
		});

		test('canKickParticipants denied: the kick button is not available', async ({ browser }) => {
			await withTarget(browser, { canKickParticipants: false }, expectNoKickButton);
		});
	});

	// ── Recordings permissions (canDeleteRecordings) ─────────────────────────────────

	test.describe('Recordings', () => {
		test('canDeleteRecordings granted: the recording can be deleted from the list', async ({ page, browser }) => {
			const recordingId = await ensureRecording(browser);
			const member = await createGuest({ canDeleteRecordings: true });
			await openRoomRecordings(page, toRoomRecordingsUrl(member.accessUrl));

			await expectRecordingDeletable(page, recordingId);
		});

		test('canDeleteRecordings denied: the recording cannot be deleted from the list', async ({ page, browser }) => {
			const recordingId = await ensureRecording(browser);
			const member = await createGuest({ canDeleteRecordings: false });
			await openRoomRecordings(page, toRoomRecordingsUrl(member.accessUrl));

			await expectRecordingNotDeletable(page, recordingId);
		});

		test('canDeleteRecordings granted: the recording can be deleted from the individual view', async ({
			page,
			browser
		}) => {
			const recordingId = await ensureRecording(browser);
			const member = await createGuest({ canDeleteRecordings: true });
			await openRecording(page, toIndividualRecordingUrl(member.accessUrl, recordingId));

			await expectViewRecordingDeletable(page);
		});

		test('canDeleteRecordings denied: the recording cannot be deleted from the individual view', async ({
			page,
			browser
		}) => {
			const recordingId = await ensureRecording(browser);
			const member = await createGuest({ canDeleteRecordings: false });
			await openRecording(page, toIndividualRecordingUrl(member.accessUrl, recordingId));

			await expectViewRecordingNotDeletable(page);
		});
	});

	// ── Merged permissions (union of combined access methods) ─────────────────────────

	test.describe('Merged permissions', () => {
		test('authenticated admin via anonymous speaker link gains admin permissions (union)', async ({ page }) => {
			// The speaker link alone grants neither end-meeting nor the ADMIN badge; merged with the
			// authenticated admin identity it grants both.
			await authenticate(page, adminUser);
			await openMeeting(page, room.access.anonymous.speaker.url);

			await expectCameraButtonAvailable(page);
			await expectEndMeetingOption(page);

			await toggleParticipantsPanel(page);
			const participantId = await getLocalParticipantId(page);
			await expectParticipantBadge(page, participantId, MeetRoomMemberUIBadge.ADMIN);
		});

		// A speaker member combined with a moderator link gains the moderator's permissions (union),
		// validated across every view. The member alone is a speaker (no end-meeting, no delete recordings);
		// the moderator link adds those. Checked for both an anonymous moderator link and an identified
		// moderator guest link.
		const moderatorLinks = [
			{ label: 'anonymous moderator link', getUrl: () => room.access.anonymous.moderator.url },
			{ label: 'identified guest (moderator) link', getUrl: () => moderatorGuest.accessUrl }
		];

		for (const link of moderatorLinks) {
			test(`member user via ${link.label} gains moderator permissions in the meeting`, async ({ page }) => {
				await authenticate(page, mergedMemberUser);
				await openMeeting(page, link.getUrl());

				await expectEndMeetingOption(page);

				await toggleParticipantsPanel(page);
				const participantId = await getLocalParticipantId(page);
				await expectParticipantBadge(page, participantId, MeetRoomMemberUIBadge.MODERATOR);
			});

			test(`member user via ${link.label} gains canDeleteRecordings in the recordings list`, async ({
				page,
				browser
			}) => {
				const recordingId = await ensureRecording(browser);
				await authenticate(page, mergedMemberUser);
				await openRoomRecordings(page, toRoomRecordingsUrl(link.getUrl()));

				await expectRecordingDeletable(page, recordingId);
			});

			test(`member user via ${link.label} gains canDeleteRecordings in the individual recording`, async ({
				page,
				browser
			}) => {
				const recordingId = await ensureRecording(browser);
				await authenticate(page, mergedMemberUser);
				await openRecording(page, toIndividualRecordingUrl(link.getUrl(), recordingId));

				await expectViewRecordingDeletable(page);
			});
		}
	});

	// ── Live permission and role updates (participant already in the meeting) ─────────

	test.describe('Live permission and role updates', () => {
		/** Asserts the "permissions updated" snackbar the participant receives. */
		const expectPermissionsUpdatedNotification = async (page: Page): Promise<void> => {
			await expect(page.getByText('Your permissions have been updated')).toBeVisible({ timeout: 10_000 });
		};

		test("updating an identified guest's permissions updates the meeting UI live", async ({ page }) => {
			const guest = await createRoomMember(room.roomId, {
				name: 'Live Guest',
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: {
					canChangeVirtualBackground: true,
					canReadChat: false
				}
			});

			await openMeeting(page, guest.accessUrl);
			await expectBackgroundsButtonAvailable(page);
			await expectNoChat(page);

			await updateRoomMemberPermissions(room.roomId, guest.memberId, {
				customPermissions: {
					canChangeVirtualBackground: false,
					canReadChat: true
				}
			});

			await expectPermissionsUpdatedNotification(page);
			await expectNoBackgroundsButton(page);
			await expectChatAvailable(page);
		});

		test("updating a user member's permissions updates the meeting UI live", async ({ page }) => {
			const { user, member } = await createReadyMemberUser(room.roomId, {
				name: 'Live Member',
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: {
					canChangeVirtualBackground: true,
					canReadChat: false
				}
			});
			createdUserIds.push(user.userId);

			await openMeeting(page, member.accessUrl, { login: user });
			await expectBackgroundsButtonAvailable(page);
			await expectNoChat(page);

			await updateRoomMemberPermissions(room.roomId, member.memberId, {
				customPermissions: {
					canChangeVirtualBackground: false,
					canReadChat: true
				}
			});

			await expectPermissionsUpdatedNotification(page);
			await expectNoBackgroundsButton(page);
			await expectChatAvailable(page);
		});

		test('removing canJoinMeeting from an identified guest kicks them from the meeting', async ({ page }) => {
			const guest = await createRoomMember(room.roomId, {
				name: 'Kick Guest',
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			await openMeeting(page, guest.accessUrl);

			await updateRoomMemberPermissions(room.roomId, guest.memberId, {
				customPermissions: { canJoinMeeting: false }
			});

			await expectKickedFromMeeting(page);
		});

		test('removing canJoinMeeting from a user member kicks them from the meeting', async ({ page }) => {
			const { user, member } = await createReadyMemberUser(room.roomId, {
				name: 'Kick Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			createdUserIds.push(user.userId);

			await openMeeting(page, member.accessUrl, { login: user });

			await updateRoomMemberPermissions(room.roomId, member.memberId, {
				customPermissions: { canJoinMeeting: false }
			});

			await expectKickedFromMeeting(page);
		});

		test('demoting an in-meeting admin revokes their access (redirect to error page)', async ({ page }) => {
			const admin = (await createReadyUser('Live Admin')).user;
			createdUserIds.push(admin.userId);

			// The admin can access any room; joining via the user URL works regardless of user access.
			await openMeeting(page, room.access.user.url, { login: admin });

			// Demoted to room manager, they are neither owner nor member of this room → access revoked.
			await updateUserRole(admin.userId, MeetUserRole.ROOM_MANAGER);

			await expectMeetingAccessRevoked(page);
		});

		test('demoting an in-meeting room owner to room member revokes their access', async ({ page }) => {
			// A room manager owns their room; demoting to room member transfers ownership away, so their
			// access is revoked while they are in the meeting.
			const owner = await createReadyUser('Live Owner', MeetUserRole.ROOM_MANAGER);
			createdUserIds.push(owner.user.userId);
			const ownedRoom = await createRoomAsUser(owner.accessToken);
			createdRoomIds.push(ownedRoom.roomId);

			await openMeeting(page, ownedRoom.access.user.url, { login: owner.user });

			await updateUserRole(owner.user.userId, MeetUserRole.ROOM_MEMBER);

			await expectMeetingAccessRevoked(page);
		});

		test('promoting an in-meeting room member to admin grants elevated permissions live', async ({ page }) => {
			const { user, member } = await createReadyMemberUser(room.roomId, {
				name: 'Promote Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});
			createdUserIds.push(user.userId);

			await openMeeting(page, member.accessUrl, { login: user });
			// A speaker cannot end the meeting.
			await expectNoEndMeetingOption(page);

			await updateUserRole(user.userId, MeetUserRole.ADMIN);

			// As an admin they gain every permission live, including ending the meeting.
			await expectPermissionsUpdatedNotification(page);
			await expectEndMeetingOption(page);
		});

		test("deleting an in-meeting user's account kicks them from the meeting", async ({ page }) => {
			// Not tracked in createdUserIds — the account is deleted within the test.
			const { user, member } = await createReadyMemberUser(room.roomId, {
				name: 'Delete Member',
				baseRole: MeetRoomMemberRole.SPEAKER
			});

			await openMeeting(page, member.accessUrl, { login: user });

			await deleteUser(user.userId);

			await expectKickedFromMeeting(page);
		});
	});
});
