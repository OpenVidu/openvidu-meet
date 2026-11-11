import { MeetRoomMemberRole, MeetRoomStatus, type MeetRoomConfigOptions } from '@openvidu-meet/typings';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
	admitFromLobby,
	createRoom,
	createRoomMember,
	deleteRooms,
	getLobby,
	getMeetingParticipantIdentities,
	getRoomStatus,
	updateRoomConfig,
	waitForNoActiveMeeting
} from './helpers/meet-api.helper';
import { ensurePrejoinAudioState, ensurePrejoinVideoState } from './helpers/media-controls.helper';
import { openCrashablePage } from './helpers/participant-management.helper';
import {
	clickJoinMeeting,
	leaveMeeting,
	openJoinScreen,
	openMeeting,
	openPrejoin
} from './helpers/meeting-navigation.helper';
import {
	admitFromPanel,
	askToJoin,
	askToJoinAgain,
	closeParticipantsPanel,
	denyFromPanel,
	expectInMeeting,
	expectQueuePosition,
	expectWaitingScreen,
	holdBackLiveKitConnection,
	leaveWaitingRoom,
	lobbyNotification,
	lobbyRow,
	lobbySection,
	meetingFullMessage,
	newWaiterPage,
	openParticipantsPanel,
	routeRealtimeChannel,
	waitingOutcome
} from './helpers/waiting-room.helper';
import { click } from './helpers/ui-utils.helper';

/** The server forgets a waiter whose connection has been gone for a minute; its sweep runs every 5 s. */
const PLACE_LOST_TIMEOUT = 90_000;
/** A waiter's state is sent again at every answered ping, every 20 s. */
const NEXT_PING_TIMEOUT = 30_000;

test.describe('Waiting room E2E Tests', () => {
	const createdRoomIds: string[] = [];
	const openedPages: Page[] = [];

	let roomId: string;
	let moderatorUrl: string;
	let speakerUrl: string;

	const createRoomWith = async (config: MeetRoomConfigOptions): Promise<void> => {
		const room = await createRoom({ config });
		roomId = room.roomId;
		moderatorUrl = room.access.anonymous.moderator.url;
		speakerUrl = room.access.anonymous.speaker.url;
		createdRoomIds.push(roomId);
	};

	const createLobbyRoom = (config: MeetRoomConfigOptions = {}): Promise<void> =>
		createRoomWith({ lobby: { enabled: true }, ...config });

	/** A page of its own browser context, closed after the test. */
	const newPage = async (browser: Browser): Promise<Page> => {
		const page = await newWaiterPage(browser);
		openedPages.push(page);
		return page;
	};

	/** Asks to join as `name` from a fresh page and waits for the waiting screen. */
	const waiter = async (browser: Browser, name: string, accessUrl = speakerUrl): Promise<Page> => {
		const page = await newPage(browser);
		await askToJoin(page, accessUrl, name);
		await expectWaitingScreen(page);
		return page;
	};

	const host = async (browser: Browser, name = 'Host'): Promise<Page> => {
		const page = await newPage(browser);
		await openMeeting(page, moderatorUrl, { name });
		return page;
	};

	const lobbyNames = async (): Promise<string[]> =>
		(await getLobby(roomId)).participants.map(({ participantName }) => participantName);

	const identityOf = async (name: string): Promise<string> => {
		const listed = (await getLobby(roomId)).participants.find(({ participantName }) => participantName === name);

		if (!listed) throw new Error(`'${name}' is not waiting in room '${roomId}'`);

		return listed.participantIdentity;
	};

	test.afterEach(async () => {
		await Promise.all(
			openedPages.splice(0).map((page) =>
				page
					.context()
					.close()
					.catch(() => {})
			)
		);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test.describe('Asking to join', () => {
		test('should keep the devices chosen on the waiting screen and join with the identity listed once admitted', async ({
			browser
		}) => {
			await createLobbyRoom();

			// A holder of lobbyBypass still goes through the device setup screen.
			const hostPage = await newPage(browser);
			await openJoinScreen(hostPage, moderatorUrl);
			await hostPage.locator('#participant-name-input').fill('Host');
			const joinScreenSubmit = hostPage.locator('#participant-name-submit');
			await expect(joinScreenSubmit).not.toHaveText(/Ask to join/);
			await click(joinScreenSubmit);
			await clickJoinMeeting(hostPage);
			await expectInMeeting(hostPage);

			const ana = await waiter(browser, 'Ana');
			await expect(ana.locator('#join-button')).toHaveCount(0);
			await ensurePrejoinVideoState(ana, false);
			await ensurePrejoinAudioState(ana, false);
			const identity = await identityOf('Ana');

			await openParticipantsPanel(hostPage);
			await admitFromPanel(hostPage, 'Ana');

			await expectInMeeting(ana);
			await expect(ana.locator('#camera-btn #videocam_off')).toBeVisible();
			await expect(ana.locator('#mic-btn #mic_off')).toBeVisible();
			await expect.poll(() => getMeetingParticipantIdentities(roomId)).toContain(identity);
		});

		test('should list a participant in the panel as soon as they ask, before their waiting screen connects', async ({
			browser
		}) => {
			await createLobbyRoom();
			const hostPage = await host(browser);
			await openParticipantsPanel(hostPage);

			const ana = await newPage(browser);
			const realtime = await routeRealtimeChannel(ana);
			await realtime.cut();
			await askToJoin(ana, speakerUrl, 'Ana');

			await expect(lobbyRow(hostPage, 'Ana')).toBeVisible({ timeout: 5_000 });
		});

		test('should say the meeting has not started until a meeting starts', async ({ browser }) => {
			await createLobbyRoom();
			const ana = await waiter(browser, 'Ana');
			await expect(ana.locator('#waiting-screen-not-started')).toBeVisible({ timeout: 10_000 });

			await host(browser);

			await expect(ana.locator('#waiting-screen-not-started')).toBeHidden({ timeout: NEXT_PING_TIMEOUT });
			await expectWaitingScreen(ana);
		});

		test('should open the waiting screen when the waiting room is turned on while a speaker sets up devices', async ({
			page
		}) => {
			await createRoomWith({ lobby: { enabled: false } });

			await openPrejoin(page, speakerUrl, { name: 'Ana' });
			await updateRoomConfig(roomId, { lobby: { enabled: true } });
			await clickJoinMeeting(page);

			await expectWaitingScreen(page);
			await expect.poll(lobbyNames).toEqual(['Ana']);

			expect((await admitFromLobby(roomId, [await identityOf('Ana')])).status).toBe(200);
			await expectInMeeting(page);
		});
	});

	test.describe('The line', () => {
		test('should update the positions as the line moves', async ({ browser }) => {
			await createLobbyRoom();
			const ana = await waiter(browser, 'Ana');
			const ben = await waiter(browser, 'Ben');
			const cleo = await waiter(browser, 'Cleo');

			await expectQueuePosition(ana, '1st');
			await expectQueuePosition(ben, '2nd');
			await expectQueuePosition(cleo, '3rd');

			await leaveWaitingRoom(ben);
			await expectQueuePosition(cleo, '2nd');

			expect((await admitFromLobby(roomId, [await identityOf('Ana')])).status).toBe(200);
			await expectInMeeting(ana);
			await expectQueuePosition(cleo, '1st');
		});

		test('should put a member who reloads at the end of the line with the same identity', async ({ browser }) => {
			await createLobbyRoom();
			const member = await createRoomMember(roomId, { name: 'Mia', baseRole: MeetRoomMemberRole.SPEAKER });

			const mia = await waiter(browser, 'Mia', member.accessUrl);
			const identity = await identityOf('Mia');
			const xavi = await waiter(browser, 'Xavi');
			await expectQueuePosition(mia, '1st');
			await expectQueuePosition(xavi, '2nd');

			await mia.reload({ waitUntil: 'domcontentloaded' });
			const askButton = mia.locator('#participant-name-submit');
			await expect(askButton.or(mia.locator('#waiting-screen'))).toBeVisible({ timeout: 30_000 });

			if (await askButton.isVisible()) {
				await click(askButton, 10_000);
			}

			await expectQueuePosition(mia, '2nd');
			await expectQueuePosition(xavi, '1st');
			await expect.poll(lobbyNames).toEqual(['Xavi', 'Mia']);
			expect(await identityOf('Mia')).toBe(identity);
		});

		test('should let a rejected participant ask again after the pause, at the end of the line', async ({
			browser
		}) => {
			await createLobbyRoom();
			const hostPage = await host(browser);
			await openParticipantsPanel(hostPage);
			const ana = await waiter(browser, 'Ana');

			await denyFromPanel(hostPage, 'Ana');
			await expect(waitingOutcome(ana, 'rejected')).toBeVisible({ timeout: 10_000 });
			await expect(askToJoinAgain(ana)).toBeDisabled();

			await waiter(browser, 'Ben');

			await expect(askToJoinAgain(ana)).toBeEnabled({ timeout: 20_000 });
			await click(askToJoinAgain(ana));

			await expectWaitingScreen(ana);
			await expectQueuePosition(ana, '2nd');
			await expect.poll(lobbyNames).toEqual(['Ben', 'Ana']);
		});
	});

	test.describe('Leaving', () => {
		test('should leave the waiting room at once', async ({ browser }) => {
			await createLobbyRoom();
			const ana = await waiter(browser, 'Ana');
			await expect.poll(lobbyNames).toEqual(['Ana']);

			await leaveWaitingRoom(ana);

			await expect(waitingOutcome(ana, 'left')).toBeVisible();
			await expect.poll(lobbyNames, { timeout: 5_000 }).toEqual([]);
		});

		test('should leave the waiting room at once while the realtime connection is down', async ({ browser }) => {
			await createLobbyRoom();
			const ana = await newPage(browser);
			const realtime = await routeRealtimeChannel(ana);
			await askToJoin(ana, speakerUrl, 'Ana');
			await expectQueuePosition(ana, '1st');

			await realtime.cut();
			await expect(ana.locator('#waiting-screen-subtitle')).toContainText('Reconnecting', { timeout: 10_000 });

			await leaveWaitingRoom(ana);

			await expect(waitingOutcome(ana, 'left')).toBeVisible();
			await expect.poll(lobbyNames, { timeout: 5_000 }).toEqual([]);
		});

		test('should remove a participant whose page closed within about a minute', async ({ browser }) => {
			test.setTimeout(PLACE_LOST_TIMEOUT + 30_000);
			await createLobbyRoom();
			const ana = await waiter(browser, 'Ana');
			await expectQueuePosition(ana, '1st');

			await ana.context().close();

			expect(await lobbyNames()).toEqual(['Ana']);
			await expect.poll(lobbyNames, { timeout: PLACE_LOST_TIMEOUT, intervals: [2_000] }).toEqual([]);
		});
	});

	test.describe('Admitters', () => {
		test('should notify a knock only while the participants panel is closed', async ({ browser }) => {
			await createLobbyRoom();
			const hostPage = await host(browser);

			await waiter(browser, 'Ana');
			await expect(lobbyNotification(hostPage)).toContainText('Ana', { timeout: 10_000 });

			await openParticipantsPanel(hostPage);
			await expect(lobbyNotification(hostPage)).toHaveCount(0);

			await waiter(browser, 'Ben');
			await expect(lobbyRow(hostPage, 'Ben')).toBeVisible({ timeout: 10_000 });
			await expect(lobbyNotification(hostPage)).toHaveCount(0);

			await closeParticipantsPanel(hostPage);
			const cleo = await waiter(browser, 'Cleo');
			const notice = lobbyNotification(hostPage);
			await expect(notice).toContainText('Cleo', { timeout: 10_000 });
			await click(notice.locator('.notification-action:not(.secondary)'));

			await expectInMeeting(cleo);
		});

		test('should deny everyone waiting after the confirmation, also when one leaves before it', async ({
			browser
		}) => {
			await createLobbyRoom();
			const hostPage = await host(browser);
			await openParticipantsPanel(hostPage);
			const ana = await waiter(browser, 'Ana');
			const ben = await waiter(browser, 'Ben');
			const cleo = await waiter(browser, 'Cleo');
			await expect(lobbySection(hostPage).locator('.lobby-row')).toHaveCount(3, { timeout: 10_000 });

			await click(hostPage.locator('#lobby-deny-all-btn'));
			const confirm = hostPage.locator('.confirm-button');
			await expect(confirm).toBeVisible();

			await leaveWaitingRoom(cleo);
			await expect(waitingOutcome(cleo, 'left')).toBeVisible();
			await click(confirm);

			await expect(waitingOutcome(ana, 'rejected')).toBeVisible({ timeout: 10_000 });
			await expect(waitingOutcome(ben, 'rejected')).toBeVisible({ timeout: 10_000 });
			await expect(waitingOutcome(cleo, 'left')).toBeVisible();
			await expect.poll(lobbyNames).toEqual([]);
			await expect(lobbySection(hostPage)).toHaveCount(0);
		});

		test('should tell the waiting participants when a moderator ends the meeting', async ({ browser }) => {
			await createLobbyRoom();
			const hostPage = await host(browser);
			const ana = await waiter(browser, 'Ana');

			await click(hostPage.locator('#leave-btn'));
			await click(hostPage.locator('#end-meeting-option'));

			await expect(waitingOutcome(ana, 'meeting_ended')).toBeVisible({ timeout: 15_000 });
			await expect.poll(lobbyNames).toEqual([]);
		});

		test('should keep the waits when the host loses the connection', async ({ browser }) => {
			test.setTimeout(150_000);
			await createLobbyRoom();
			const crashingHost = await openCrashablePage();
			openedPages.push(crashingHost.page);
			await openMeeting(crashingHost.page, moderatorUrl, { name: 'Host' });
			const ana = await waiter(browser, 'Ana');
			await expect.poll(() => getRoomStatus(roomId)).toBe(MeetRoomStatus.ACTIVE_MEETING);

			await crashingHost.crash();
			await waitForNoActiveMeeting(roomId, 60_000);

			await expect(ana.locator('#waiting-screen-not-started')).toBeVisible({ timeout: NEXT_PING_TIMEOUT });
			await expectQueuePosition(ana, '1st');
			expect(await lobbyNames()).toEqual(['Ana']);

			const returningHost = await host(browser, 'Host again');
			await openParticipantsPanel(returningHost);
			await admitFromPanel(returningHost, 'Ana');
			await expectInMeeting(ana);
		});
	});

	test.describe('Capacity', () => {
		test('should refuse a second admission for the last place while the first participant connects, and free it a minute after', async ({
			browser
		}) => {
			test.setTimeout(PLACE_LOST_TIMEOUT + 60_000);
			await createLobbyRoom({ maxParticipants: 2 });
			const hostPage = await host(browser);
			await openParticipantsPanel(hostPage);

			const ana = await newPage(browser);
			await holdBackLiveKitConnection(ana);
			await askToJoin(ana, speakerUrl, 'Ana');
			await expectWaitingScreen(ana);
			await waiter(browser, 'Ben');
			await expect(hostPage.locator('#lobby-places-left')).toHaveText('1 place left', { timeout: 10_000 });

			await admitFromPanel(hostPage, 'Ana');

			await expect(hostPage.locator('#lobby-places-left')).toHaveText('No places left', { timeout: 10_000 });
			await expect(lobbyRow(hostPage, 'Ben').locator('.lobby-admit-btn')).toBeDisabled();
			expect((await admitFromLobby(roomId, [await identityOf('Ben')])).status).toBe(409);

			await expect
				.poll(async () => (await getLobby(roomId)).availablePlaces, {
					timeout: PLACE_LOST_TIMEOUT,
					intervals: [2_000]
				})
				.toBe(1);
			await expect(hostPage.locator('#lobby-places-left')).toHaveText('1 place left', { timeout: 35_000 });
		});

		test('should admit the first in line with "Admit N" when there are fewer places than waiters', async ({
			browser
		}) => {
			await createLobbyRoom({ maxParticipants: 3 });
			const hostPage = await host(browser);
			await openParticipantsPanel(hostPage);
			const ana = await waiter(browser, 'Ana');
			const ben = await waiter(browser, 'Ben');
			const cleo = await waiter(browser, 'Cleo');

			const admitShown = hostPage.locator('#lobby-admit-shown-btn');
			await expect(admitShown).toHaveText('Admit 2', { timeout: 10_000 });
			await click(admitShown);

			await expectInMeeting(ana);
			await expectInMeeting(ben);
			await expectQueuePosition(cleo, '1st');
			await expect.poll(lobbyNames).toEqual(['Cleo']);
		});

		test('should show the free place within a few seconds when a participant leaves a full meeting', async ({
			browser
		}) => {
			await createLobbyRoom({ maxParticipants: 2 });
			const hostPage = await host(browser);
			const secondHost = await host(browser, 'Second host');
			await openParticipantsPanel(hostPage);
			await waiter(browser, 'Ana');

			const placesLeft = hostPage.locator('#lobby-places-left');
			await expect(placesLeft).toHaveText('No places left', { timeout: 10_000 });
			await expect(lobbyRow(hostPage, 'Ana').locator('.lobby-admit-btn')).toBeDisabled();

			await leaveMeeting(secondHost);

			await expect(placesLeft).toHaveText('1 place left', { timeout: 10_000 });
			await expect(lobbyRow(hostPage, 'Ana').locator('.lobby-admit-btn')).toBeEnabled();
		});

		test('should let two of three in and show "Meeting full" to the third when the waiting room is turned off with two places', async ({
			browser
		}) => {
			await createLobbyRoom({ maxParticipants: 2 });
			const waiters = [await waiter(browser, 'Ana'), await waiter(browser, 'Ben'), await waiter(browser, 'Cleo')];

			await updateRoomConfig(roomId, { lobby: { enabled: false } });

			const count = async (visible: (page: Page) => Promise<boolean>) =>
				(await Promise.all(waiters.map(visible))).filter(Boolean).length;
			const inMeeting = () => count((page) => page.locator('#layout-container').isVisible());
			const meetingFull = () => count((page) => meetingFullMessage(page).isVisible());

			await expect
				.poll(async () => [await inMeeting(), await meetingFull()], { timeout: 45_000 })
				.toEqual([2, 1]);
			expect(await getMeetingParticipantIdentities(roomId)).toHaveLength(2);
		});
	});
});
