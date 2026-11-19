import {
	MeetRoomMemberRole,
	MeetRoomStatus,
	type MeetRoomConfigOptions,
	type MeetRoomOptions
} from '@openvidu-meet/typings';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
	admitWaitingParticipants,
	createRoom,
	createRoomMember,
	deleteRooms,
	getWaitingParticipants,
	getMeetingParticipantIdentities,
	getRoomStatus,
	updateRoomAccess,
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
	expectWaitingScreen,
	holdBackLiveKitConnection,
	stopWaiting,
	knockNotification,
	waitingParticipantRow,
	waitingParticipantsSection,
	meetingFullMessage,
	newWaiterPage,
	notEnoughPlacesNotification,
	notWaitingNotification,
	openParticipantsPanel,
	routeRealtimeChannel,
	waitingOutcome
} from './helpers/waiting-participants.helper';
import { click } from './helpers/ui-utils.helper';

/** The test backend forgets a waiter whose connection has been gone for 20 s, and its sweep runs every second (`.env.test`). */
const PLACE_LOST_TIMEOUT = 35_000;
/** A waiter whose page closed is dropped as soon as the page tells the server. */
const PAGE_CLOSED_TIMEOUT = 10_000;
/** A waiter's state is sent again at every answered ping, every 4 s on the test backend. */
const NEXT_PING_TIMEOUT = 15_000;

test.describe('Locked room E2E Tests', () => {
	const createdRoomIds: string[] = [];
	const openedPages: Page[] = [];

	let roomId: string;
	let moderatorUrl: string;
	let speakerUrl: string;

	const createRoomWith = async (options: MeetRoomOptions): Promise<void> => {
		const room = await createRoom(options);
		roomId = room.roomId;
		moderatorUrl = room.access.anonymous.moderator.url;
		speakerUrl = room.access.anonymous.speaker.url;
		createdRoomIds.push(roomId);
	};

	const createLockedRoom = (config: MeetRoomConfigOptions = {}): Promise<void> =>
		createRoomWith({ config, access: { lock: { enabled: true } } });

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

	/** Closes the tab as a person does, so the page runs its unload handlers. */
	const closeTab = async (page: Page): Promise<void> => {
		await Promise.all([page.waitForEvent('close'), page.close({ runBeforeUnload: true })]);
		await page.context().close();
	};

	const host = async (browser: Browser, name = 'Host'): Promise<Page> => {
		const page = await newPage(browser);
		await openMeeting(page, moderatorUrl, { name });
		return page;
	};

	/** Who waits, by name, sorted: the list promises no order. */
	const waitingNames = async (): Promise<string[]> =>
		(await getWaitingParticipants(roomId)).participants.map(({ participantName }) => participantName).sort();

	const identityOf = async (name: string): Promise<string> => {
		const listed = (await getWaitingParticipants(roomId)).participants.find(
			({ participantName }) => participantName === name
		);

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
			await createLockedRoom();

			// A holder of accessBypassLock still goes through the device setup screen.
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
			await createLockedRoom();
			const hostPage = await host(browser);
			await openParticipantsPanel(hostPage);

			const ana = await newPage(browser);
			const realtime = await routeRealtimeChannel(ana);
			await realtime.cut();
			await askToJoin(ana, speakerUrl, 'Ana');

			await expect(waitingParticipantRow(hostPage, 'Ana')).toBeVisible({ timeout: 5_000 });
		});

		test('should say the meeting has not started until a meeting starts', async ({ browser }) => {
			await createLockedRoom();
			const ana = await waiter(browser, 'Ana');
			await expect(ana.locator('#waiting-screen-not-started')).toBeVisible({ timeout: 10_000 });

			await host(browser);

			await expect(ana.locator('#waiting-screen-not-started')).toBeHidden({ timeout: NEXT_PING_TIMEOUT });
			await expectWaitingScreen(ana);
		});

		test('should open the waiting screen when the room is locked while a speaker sets up devices', async ({
			page
		}) => {
			await createRoomWith({});

			await openPrejoin(page, speakerUrl, { name: 'Ana' });
			await updateRoomAccess(roomId, { lock: { enabled: true } });
			await clickJoinMeeting(page);

			await expectWaitingScreen(page);
			await expect.poll(waitingNames).toEqual(['Ana']);

			expect((await admitWaitingParticipants(roomId, await identityOf('Ana'))).status).toBe(200);
			await expectInMeeting(page);
		});
	});

	test.describe('Waiting', () => {
		test('should show no place in line, and leave the screen of the others alone when someone is admitted', async ({
			browser
		}) => {
			await createLockedRoom();
			const ana = await waiter(browser, 'Ana');
			const ben = await waiter(browser, 'Ben');
			await expect(ben.locator('#waiting-screen-title')).toHaveText('Waiting to be let in');

			expect((await admitWaitingParticipants(roomId, await identityOf('Ana'))).status).toBe(200);
			await expectInMeeting(ana);

			await expect(ben.locator('#waiting-screen-title')).toHaveText('Waiting to be let in');
			await expect(ben.locator('#waiting-screen')).not.toContainText('Ana');
			await expect.poll(waitingNames).toEqual(['Ben']);
		});

		test('should make a member who reloads ask again on their own, with the same identity', async ({ browser }) => {
			await createLockedRoom();
			const member = await createRoomMember(roomId, { name: 'Mia', baseRole: MeetRoomMemberRole.SPEAKER });

			const mia = await waiter(browser, 'Mia', member.accessUrl);
			const identity = await identityOf('Mia');
			await waiter(browser, 'Xavi');

			await mia.reload({ waitUntil: 'domcontentloaded' });

			await expectWaitingScreen(mia, 30_000);
			await expect(mia.locator('#participant-name-submit')).toHaveCount(0);
			await expect.poll(waitingNames).toEqual(['Mia', 'Xavi']);
			expect(await identityOf('Mia')).toBe(identity);
		});

		test('should not add another waiting participant each time an anonymous participant reloads', async ({
			browser
		}) => {
			await createLockedRoom();
			const ana = await waiter(browser, 'Ana');

			for (let reload = 0; reload < 3; reload++) {
				await ana.reload({ waitUntil: 'domcontentloaded' });
				await expectWaitingScreen(ana, 30_000);
			}

			await expect.poll(waitingNames).toEqual(['Ana']);

			expect((await admitWaitingParticipants(roomId, await identityOf('Ana'))).status).toBe(200);
			await expectInMeeting(ana);
		});

		test('should let a rejected participant ask again at once', async ({ browser }) => {
			await createLockedRoom();
			const hostPage = await host(browser);
			await openParticipantsPanel(hostPage);
			const ana = await waiter(browser, 'Ana');

			await denyFromPanel(hostPage, 'Ana');
			await expect(waitingOutcome(ana, 'rejected')).toBeVisible({ timeout: 10_000 });

			await waiter(browser, 'Ben');

			await click(askToJoinAgain(ana));

			await expectWaitingScreen(ana);
			await expect.poll(waitingNames).toEqual(['Ana', 'Ben']);
		});
	});

	test.describe('Leaving', () => {
		test('should stop waiting at once', async ({ browser }) => {
			await createLockedRoom();
			const ana = await waiter(browser, 'Ana');
			await expect.poll(waitingNames).toEqual(['Ana']);

			await stopWaiting(ana);

			await expect(waitingOutcome(ana, 'left')).toBeVisible();
			await expect.poll(waitingNames, { timeout: 5_000 }).toEqual([]);
		});

		test('should keep the place of a participant whose realtime connection a restarting proxy closes', async ({
			browser
		}) => {
			await createLockedRoom();
			await waiter(browser, 'Ana');
			const ben = await newPage(browser);
			const realtime = await routeRealtimeChannel(ben);
			await askToJoin(ben, speakerUrl, 'Ben');
			await expectWaitingScreen(ben);

			await realtime.restartProxy();
			await expect.poll(realtime.opened, { timeout: 15_000 }).toBe(2);

			await expect(ben.locator('#waiting-screen-subtitle')).not.toContainText('Reconnecting', {
				timeout: 15_000
			});
			expect(await waitingNames()).toEqual(['Ana', 'Ben']);
		});

		test('should stop waiting at once while the realtime connection is down', async ({ browser }) => {
			await createLockedRoom();
			const ana = await newPage(browser);
			const realtime = await routeRealtimeChannel(ana);
			await askToJoin(ana, speakerUrl, 'Ana');
			await expectWaitingScreen(ana);
			await expect(ana.locator('#waiting-screen-not-started')).toBeVisible();

			await realtime.cut();
			await expect(ana.locator('#waiting-screen-subtitle')).toContainText('Reconnecting', { timeout: 10_000 });

			await stopWaiting(ana);

			await expect(waitingOutcome(ana, 'left')).toBeVisible();
			await expect.poll(waitingNames, { timeout: 5_000 }).toEqual([]);
		});

		test('should remove a participant whose page closed from the waiting list and from the moderator panel within seconds', async ({
			browser
		}) => {
			await createLockedRoom();
			const hostPage = await host(browser);
			await openParticipantsPanel(hostPage);
			const ana = await waiter(browser, 'Ana');
			await expect(waitingParticipantRow(hostPage, 'Ana')).toBeVisible({ timeout: 10_000 });

			await closeTab(ana);

			await expect(waitingParticipantRow(hostPage, 'Ana')).toBeHidden({ timeout: PAGE_CLOSED_TIMEOUT });
			expect(await waitingNames()).toEqual([]);
		});
	});

	test.describe('Admitters', () => {
		test('should tell a moderator who admits a participant that already left, when their list was not updated yet', async ({
			browser
		}) => {
			await createLockedRoom();
			const hostPage = await host(browser);
			await openParticipantsPanel(hostPage);
			const ana = await waiter(browser, 'Ana');
			const identity = await identityOf('Ana');
			await expect(waitingParticipantRow(hostPage, 'Ana')).toBeVisible({ timeout: 10_000 });
			await hostPage.route(/\/meetings\/[^/]+\/waiting-participants$/, (route) => route.abort());

			await closeTab(ana);
			await expect.poll(waitingNames, { timeout: PAGE_CLOSED_TIMEOUT }).toEqual([]);
			await admitFromPanel(hostPage, 'Ana');

			await expect(notWaitingNotification(hostPage)).toContainText('Ana already left', { timeout: 10_000 });
			expect(await getMeetingParticipantIdentities(roomId)).not.toContain(identity);
		});

		test('should notify a knock only while the participants panel is closed', async ({ browser }) => {
			await createLockedRoom();
			const hostPage = await host(browser);

			await waiter(browser, 'Ana');
			await expect(knockNotification(hostPage)).toContainText('Ana', { timeout: 10_000 });
			await expect(hostPage.locator('#participants-waiting-dot')).toBeVisible();

			await openParticipantsPanel(hostPage);
			await expect(knockNotification(hostPage)).toHaveCount(0);

			await waiter(browser, 'Ben');
			await expect(waitingParticipantRow(hostPage, 'Ben')).toBeVisible({ timeout: 10_000 });
			await expect(knockNotification(hostPage)).toHaveCount(0);

			await closeParticipantsPanel(hostPage);
			const cleo = await waiter(browser, 'Cleo');
			const notice = knockNotification(hostPage);
			await expect(notice).toContainText('Cleo', { timeout: 10_000 });
			await click(notice.locator('.notification-action:not(.secondary)'));

			await expectInMeeting(cleo);
		});

		test('should deny everyone waiting after the confirmation, also when one leaves before it', async ({
			browser
		}) => {
			await createLockedRoom();
			const hostPage = await host(browser);
			await openParticipantsPanel(hostPage);
			const ana = await waiter(browser, 'Ana');
			const ben = await waiter(browser, 'Ben');
			const cleo = await waiter(browser, 'Cleo');
			await expect(waitingParticipantsSection(hostPage).locator('.waiting-participants-row')).toHaveCount(3, {
				timeout: 10_000
			});

			await click(hostPage.locator('#waiting-participants-deny-all-btn'));
			const confirm = hostPage.locator('.confirm-button');
			await expect(confirm).toBeVisible();

			await stopWaiting(cleo);
			await expect(waitingOutcome(cleo, 'left')).toBeVisible();
			await click(confirm);

			await expect(waitingOutcome(ana, 'rejected')).toBeVisible({ timeout: 10_000 });
			await expect(waitingOutcome(ben, 'rejected')).toBeVisible({ timeout: 10_000 });
			await expect(waitingOutcome(cleo, 'left')).toBeVisible();
			await expect.poll(waitingNames).toEqual([]);
			await expect(waitingParticipantsSection(hostPage)).toHaveCount(0);
		});

		test('should tell the waiting participants when a moderator ends the meeting', async ({ browser }) => {
			await createLockedRoom();
			const hostPage = await host(browser);
			const ana = await waiter(browser, 'Ana');

			await click(hostPage.locator('#leave-btn'));
			await click(hostPage.locator('#end-meeting-option'));

			await expect(waitingOutcome(ana, 'meeting_ended')).toBeVisible({ timeout: 15_000 });
			await expect.poll(waitingNames).toEqual([]);
		});

		test('should keep the waits when the host loses the connection', async ({ browser }) => {
			test.setTimeout(150_000);
			await createLockedRoom();
			const crashingHost = await openCrashablePage();
			openedPages.push(crashingHost.page);
			await openMeeting(crashingHost.page, moderatorUrl, { name: 'Host' });
			const ana = await waiter(browser, 'Ana');
			await expect.poll(() => getRoomStatus(roomId)).toBe(MeetRoomStatus.ACTIVE_MEETING);

			await crashingHost.crash();
			await waitForNoActiveMeeting(roomId, 60_000);

			await expect(ana.locator('#waiting-screen-not-started')).toBeVisible({ timeout: NEXT_PING_TIMEOUT });
			await expectWaitingScreen(ana);
			expect(await waitingNames()).toEqual(['Ana']);

			const returningHost = await host(browser, 'Host again');
			await openParticipantsPanel(returningHost);
			await admitFromPanel(returningHost, 'Ana');
			await expectInMeeting(ana);
		});
	});

	test.describe('Capacity', () => {
		test('should refuse a second admission for the last place while the first participant connects, and free it when their admission expires', async ({
			browser
		}) => {
			await createLockedRoom({ maxParticipants: 2 });
			const hostPage = await host(browser);
			await openParticipantsPanel(hostPage);

			const ana = await newPage(browser);
			await holdBackLiveKitConnection(ana);
			await askToJoin(ana, speakerUrl, 'Ana');
			await expectWaitingScreen(ana);
			const ben = await waiter(browser, 'Ben');
			const benIdentity = await identityOf('Ben');
			await expect(hostPage.locator('#waiting-participants-places-left')).toHaveText('1 place left', {
				timeout: 10_000
			});

			await admitFromPanel(hostPage, 'Ana');
			await expect(waitingParticipantRow(hostPage, 'Ana')).toBeHidden({ timeout: 10_000 });

			expect((await admitWaitingParticipants(roomId, benIdentity)).status).toBe(409);
			await expect
				.poll(async () => (await admitWaitingParticipants(roomId, benIdentity)).status, {
					timeout: PLACE_LOST_TIMEOUT,
					intervals: [1_000]
				})
				.toBe(200);
			await expectInMeeting(ben);
		});

		test('should disable Admit all while not everyone waiting fits, and admit them all once they do', async ({
			browser
		}) => {
			await createLockedRoom({ maxParticipants: 3 });
			const hostPage = await host(browser);
			await openParticipantsPanel(hostPage);
			const ana = await waiter(browser, 'Ana');
			const ben = await waiter(browser, 'Ben');
			await waiter(browser, 'Cleo');

			const admitAll = hostPage.locator('#waiting-participants-admit-all-btn');
			await expect(hostPage.locator('#waiting-participants-places-left')).toHaveText('2 places left', {
				timeout: 10_000
			});
			await expect(admitAll).toHaveText('Admit all');
			await expect(admitAll).toBeDisabled();
			await expect(
				waitingParticipantRow(hostPage, 'Ana').locator('.waiting-participants-admit-btn')
			).toBeEnabled();
			expect((await admitWaitingParticipants(roomId)).status).toBe(409);

			await denyFromPanel(hostPage, 'Cleo');
			await expect(admitAll).toBeEnabled({ timeout: 10_000 });
			await click(admitAll);

			await expectInMeeting(ana);
			await expectInMeeting(ben);
			await expect.poll(waitingNames).toEqual([]);
		});

		test('should say not everyone fits when Admit all finds a place taken by an admission on its way', async ({
			browser
		}) => {
			await createLockedRoom({ maxParticipants: 3 });
			const hostPage = await host(browser);
			await openParticipantsPanel(hostPage);

			const ana = await newPage(browser);
			await holdBackLiveKitConnection(ana);
			await askToJoin(ana, speakerUrl, 'Ana');
			await expectWaitingScreen(ana);
			const ben = await waiter(browser, 'Ben');
			const cleo = await waiter(browser, 'Cleo');
			await admitFromPanel(hostPage, 'Ana');
			await expect(waitingParticipantRow(hostPage, 'Ana')).toBeHidden({ timeout: 10_000 });

			const admitAll = hostPage.locator('#waiting-participants-admit-all-btn');
			await expect(admitAll).toBeEnabled({ timeout: 10_000 });
			await click(admitAll);

			await expect(notEnoughPlacesNotification(hostPage)).toContainText('Not everyone fits', { timeout: 10_000 });
			await expect.poll(waitingNames).toEqual(['Ben', 'Cleo']);
			await expectWaitingScreen(ben);
			await expectWaitingScreen(cleo);
		});

		test('should show the free place within a few seconds when a participant leaves a full meeting', async ({
			browser
		}) => {
			await createLockedRoom({ maxParticipants: 2 });
			const hostPage = await host(browser);
			const secondHost = await host(browser, 'Second host');
			await openParticipantsPanel(hostPage);
			await waiter(browser, 'Ana');

			const placesLeft = hostPage.locator('#waiting-participants-places-left');
			await expect(placesLeft).toHaveText('No places left', { timeout: 10_000 });
			await expect(
				waitingParticipantRow(hostPage, 'Ana').locator('.waiting-participants-admit-btn')
			).toBeDisabled();

			await leaveMeeting(secondHost);

			await expect(placesLeft).toHaveText('1 place left', { timeout: 10_000 });
			await expect(
				waitingParticipantRow(hostPage, 'Ana').locator('.waiting-participants-admit-btn')
			).toBeEnabled();
		});

		test('should let two of three in and show "Meeting full" to the third when the room is unlocked with two places', async ({
			browser
		}) => {
			await createLockedRoom({ maxParticipants: 2 });
			const waiters = [await waiter(browser, 'Ana'), await waiter(browser, 'Ben'), await waiter(browser, 'Cleo')];

			await updateRoomAccess(roomId, { lock: { enabled: false } });

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
