import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
	chatAlerts,
	expectChatAvailable,
	expectChatLinkCount,
	expectChatLinkHrefContains,
	expectChatMessageCount,
	expectChatMessageFromAt,
	expectChatMessageNotification,
	expectChatMessageTextAt,
	expectChatMessageTexts,
	expectFirstMessageSender,
	expectNoChat,
	expectNoUnreadChatMessages,
	expectOwnChatMessageAt,
	openChatFromNotification,
	receivedDataChannelText,
	recordChatAlerts,
	recordDataChannelMessages,
	sendChatMessage,
	toggleChatPanel,
	trackRoomMemberToken,
	waitForChatHistoryResponse,
	waitForChatStored
} from './helpers/chat.helper';
import {
	createRoom,
	createRoomAndGetAnonymousAccessUrl,
	createRoomMember,
	deleteRoomMember,
	deleteRooms,
	endMeeting,
	updateRoomConfig,
	updateRoomMemberPermissions,
	waitForNoActiveMeeting
} from './helpers/meet-api.helper';
import {
	clickJoinMeeting,
	leaveMeeting,
	openMeeting,
	openPrejoin,
	reopenPrejoin
} from './helpers/meeting-navigation.helper';
import { toggleParticipantsPanel } from './helpers/panels.helper';
import {
	cutNetwork,
	disconnectAllBrowserFakeParticipants,
	getParticipantIdByName,
	joinParticipants,
	makeParticipantModerator,
	tapSignalling
} from './helpers/participant-management.helper';
import { waitForRemoteStream } from './helpers/stream.helper';

test.describe('Chat E2E Tests', () => {
	const createdRoomIds: string[] = [];

	let roomId: string;
	let accessUrl: string;

	test.beforeEach(async () => {
		const { room, accessUrl: url } = await createRoomAndGetAnonymousAccessUrl();
		roomId = room.roomId;
		accessUrl = url;
		createdRoomIds.push(roomId);
	});

	test.afterAll(async () => {
		await Promise.all([disconnectAllBrowserFakeParticipants(), deleteRooms(createdRoomIds)]);
	});

	/** A room whose chat lives only as long as each meeting. */
	const createUnsavedRoom = async () => {
		const { room, accessUrl: url } = await createRoomAndGetAnonymousAccessUrl({
			config: { chat: { enabled: true, persist: false } }
		});
		createdRoomIds.push(room.roomId);
		return { roomId: room.roomId, accessUrl: url };
	};

	test('should send messages', async ({ page }) => {
		await openMeeting(page, accessUrl);
		await toggleChatPanel(page);

		let message = 'Test message';
		await sendChatMessage(page, message);
		await expectChatMessageCount(page, 1);
		await expectChatMessageTextAt(page, 0, message);

		message = 'Test message 2';
		await sendChatMessage(page, message);
		await expectChatMessageCount(page, 2);
		await expectChatMessageTextAt(page, 1, message);
	});

	test('should keep unread chat badge hidden at startup when there are no messages', async ({ page }) => {
		await openMeeting(page, accessUrl);

		const unreadBadge = page.locator('#chat-panel-btn .mat-badge-content:visible');
		await expect(unreadBadge).toHaveCount(0);

		await toggleChatPanel(page);
		await expectChatMessageCount(page, 0);
	});

	test('should auto-scroll when receiving new messages with chat panel open', async ({ browser }) => {
		const senderName = `sender`;
		const receiverName = `receiver`;
		const { byName, removeAllParticipants } = await joinParticipants(browser, {
			roomId,
			accessUrl,
			participants: [
				{ name: receiverName, headless: false },
				{ name: senderName, headless: true }
			]
		});
		const senderPage = byName[senderName];
		const receiverPage = byName[receiverName];

		try {
			await Promise.all([toggleChatPanel(receiverPage), toggleChatPanel(senderPage)]);

			for (let i = 0; i < 45; i++) {
				await sendChatMessage(senderPage, `seed-message-${i}`);
			}

			await expectChatMessageCount(receiverPage, 45);

			const scrollState = await receiverPage.evaluate(() => {
				const container = document.querySelector('.messages-container') as HTMLElement | null;

				if (!container) {
					return null;
				}

				container.scrollTop = 0;

				return {
					scrollTop: container.scrollTop,
					scrollHeight: container.scrollHeight,
					clientHeight: container.clientHeight
				};
			});

			expect(scrollState).not.toBeNull();
			expect(scrollState!.scrollHeight).toBeGreaterThan(scrollState!.clientHeight);
			expect(scrollState!.scrollTop).toBe(0);

			await sendChatMessage(senderPage, 'newest-message');

			await expect
				.poll(
					async () => {
						return await receiverPage.evaluate(() => {
							const container = document.querySelector('.messages-container') as HTMLElement | null;

							if (!container) {
								return Number.POSITIVE_INFINITY;
							}

							return Math.abs(container.scrollHeight - container.clientHeight - container.scrollTop);
						});
					},
					{ timeout: 8_000 }
				)
				.toBeLessThanOrEqual(3);
		} finally {
			await removeAllParticipants();
		}
	});

	test('should send an URL message and render it as link', async ({ page }) => {
		await openMeeting(page, accessUrl);
		await toggleChatPanel(page);
		await sendChatMessage(page, 'demos.openvidu.io');
		await expectChatLinkCount(page, 1);
		await expectChatLinkHrefContains(page, 0, 'demos\\.openvidu\\.io');
	});

	test('should notify a message received with the chat panel closed, open the chat from it and show none to a late joiner', async ({
		browser
	}) => {
		const senderName = `sender`;
		const receiverName = `receiver`;
		const unsaved = await createUnsavedRoom();
		const { byName, addParticipant, removeAllParticipants } = await joinParticipants(browser, {
			roomId: unsaved.roomId,
			accessUrl: unsaved.accessUrl,
			participants: [
				{ name: receiverName, headless: false },
				{ name: senderName, headless: true }
			]
		});

		const senderPage = byName[senderName];
		const receiverPage = byName[receiverName];

		try {
			const message = 'message while chat is closed';
			await toggleChatPanel(senderPage);
			await sendChatMessage(senderPage, message);

			await expectChatMessageNotification(receiverPage);

			await openChatFromNotification(receiverPage);
			await expectChatMessageCount(receiverPage, 1);
			await expectChatMessageTextAt(receiverPage, 0, message);
			await expectFirstMessageSender(receiverPage, senderName);

			const latePage = await addParticipant({ name: 'late' });
			await toggleChatPanel(latePage);
			await sendChatMessage(senderPage, 'message after the late join');
			await expectChatMessageCount(latePage, 1);
			await expectChatMessageTextAt(latePage, 0, 'message after the late join');
		} finally {
			await removeAllParticipants();
		}
	});

	test('should preserve message order when sending multiple messages quickly', async ({ page }) => {
		await openMeeting(page, accessUrl);
		await toggleChatPanel(page);

		await sendChatMessage(page, 'message-1');
		await sendChatMessage(page, 'message-2');
		await sendChatMessage(page, 'message-3');

		await expectChatMessageCount(page, 3);
		await expectChatMessageTextAt(page, 0, 'message-1');
		await expectChatMessageTextAt(page, 1, 'message-2');
		await expectChatMessageTextAt(page, 2, 'message-3');
	});

	test('should deliver messages only to the participants holding chatRead', async ({ browser }) => {
		const [sender, reader, nonReader] = await Promise.all([
			createRoomMember(roomId, { name: 'sender', baseRole: MeetRoomMemberRole.MODERATOR }),
			createRoomMember(roomId, { name: 'reader', baseRole: MeetRoomMemberRole.SPEAKER }),
			createRoomMember(roomId, {
				name: 'non-reader',
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: { chatRead: false }
			})
		]);

		const pages: Page[] = [];

		const openMeetingPage = async (accessUrl: string, recordData = false): Promise<Page> => {
			const page = await browser.newPage();
			pages.push(page);

			if (recordData) {
				await recordDataChannelMessages(page);
			}

			await openMeeting(page, accessUrl);
			return page;
		};

		try {
			const readerPage = await openMeetingPage(reader.accessUrl, true);
			const nonReaderPage = await openMeetingPage(nonReader.accessUrl, true);
			const senderPage = await openMeetingPage(sender.accessUrl);
			await waitForRemoteStream(senderPage, 2);

			const message = 'only for chat readers';
			await toggleChatPanel(senderPage);
			await sendChatMessage(senderPage, message);

			await expect.poll(() => receivedDataChannelText(readerPage)).toContain(message);
			// The media server fans a packet out to its recipients at once, so a copy would be here by now
			await nonReaderPage.waitForTimeout(1_000);
			expect(await receivedDataChannelText(nonReaderPage)).not.toContain(message);
		} finally {
			await Promise.all(pages.map((page) => page.close()));
		}
	});

	test.describe('Saved chat', () => {
		const pages: Page[] = [];

		test.afterEach(async () => {
			await Promise.all(pages.splice(0).map((page) => page.close().catch(() => undefined)));
		});

		type Joined = {
			page: Page;
			roomMemberToken: () => Promise<string>;
			historyLoaded?: ReturnType<typeof waitForChatHistoryResponse>;
		};

		/**
		 * Opens the meeting in a browser of its own, following the room member token it uses so a test can read what
		 * the server stored as that participant.
		 */
		const join = async (
			browser: Browser,
			url: string,
			name: string,
			options: {
				alerts?: boolean;
				history?: boolean;
				before?: (page: Page) => Promise<unknown>;
				e2eeKey?: string;
			} = {}
		): Promise<Joined> => {
			const page = await browser.newPage();
			pages.push(page);
			const roomMemberToken = trackRoomMemberToken(page);

			if (options.alerts) await recordChatAlerts(page);

			await options.before?.(page);
			const historyLoaded = options.history ? waitForChatHistoryResponse(page) : undefined;
			await openMeeting(page, url, { name, e2eeKey: options.e2eeKey });

			return { page, roomMemberToken, historyLoaded };
		};

		/** Two participants in the meeting who can send each other messages. */
		const joinPair = async (browser: Browser, url: string, names: [string, string]) => {
			const first = await join(browser, url, names[0]);
			const second = await join(browser, url, names[1]);
			await Promise.all([waitForRemoteStream(first.page, 1), waitForRemoteStream(second.page, 1)]);
			await Promise.all([toggleChatPanel(first.page), toggleChatPanel(second.page)]);

			return [first, second] as const;
		};

		test('should say in the panel of a room that does not save its chat that messages are removed at the end of the meeting, and not in the panel of one that does', async ({
			browser
		}) => {
			const unsaved = await createUnsavedRoom();
			const saving = await join(browser, accessUrl, 'saving');
			const notSaving = await join(browser, unsaved.accessUrl, 'not-saving');

			await Promise.all([toggleChatPanel(saving.page), toggleChatPanel(notSaving.page)]);

			await expect(notSaving.page.locator('#chat-container .text-info')).toHaveText(
				/removed at the end of the meeting/i
			);
			await expect(saving.page.locator('#chat-container .text-info')).toHaveCount(0);
		});

		test('should show a late joiner the messages sent before they entered', async ({ browser }) => {
			const [alice, bob] = await joinPair(browser, accessUrl, ['alice', 'bob']);

			await sendChatMessage(alice.page, 'hello');
			await expectChatMessageTexts(bob.page, ['hello']);
			await sendChatMessage(bob.page, 'hi alice');
			await expectChatMessageTexts(alice.page, ['hello', 'hi alice']);
			await waitForChatStored(roomId, alice.roomMemberToken, ['hello', 'hi alice']);

			const carol = await join(browser, accessUrl, 'carol');
			await toggleChatPanel(carol.page);

			await expectChatMessageTexts(carol.page, ['hello', 'hi alice']);
			await expectChatMessageFromAt(carol.page, 0, 'alice', true);
			await expectChatMessageFromAt(carol.page, 1, 'bob', true);
		});

		test('should save the chat of a room whose saving was turned on while a participant waited to join', async ({
			browser
		}) => {
			const unsaved = await createUnsavedRoom();
			const page = await browser.newPage();
			pages.push(page);
			const roomMemberToken = trackRoomMemberToken(page);

			await openPrejoin(page, unsaved.accessUrl, { name: 'waiting' });
			await updateRoomConfig(unsaved.roomId, { chat: { enabled: true, persist: true } });
			await clickJoinMeeting(page);
			await expect(page.locator('#layout-container')).toBeVisible();
			await toggleChatPanel(page);
			await sendChatMessage(page, 'hello');

			await waitForChatStored(unsaved.roomId, roomMemberToken, ['hello']);
		});

		test('should not show the messages of an earlier meeting in the next one', async ({ browser }) => {
			const alice = await join(browser, accessUrl, 'alice');
			await toggleChatPanel(alice.page);
			await sendChatMessage(alice.page, 'hello');
			await waitForChatStored(roomId, alice.roomMemberToken, ['hello']);

			await endMeeting(roomId);
			await waitForNoActiveMeeting(roomId);

			const bob = await join(browser, accessUrl, 'bob', { history: true });
			await bob.historyLoaded;
			await toggleChatPanel(bob.page);

			await expectChatMessageTexts(bob.page, []);
		});

		test('should load earlier messages, 20 at a time, as the participant scrolls up', async ({ browser }) => {
			test.setTimeout(120_000);
			const texts = Array.from({ length: 30 }, (_, i) => `message-${i + 1}`);
			const alice = await join(browser, accessUrl, 'alice');
			await toggleChatPanel(alice.page);

			for (const text of texts) {
				await sendChatMessage(alice.page, text);
			}

			await waitForChatStored(roomId, alice.roomMemberToken, texts);

			const carol = await join(browser, accessUrl, 'carol', { history: true });
			await carol.historyLoaded;
			await toggleChatPanel(carol.page);
			await expectChatMessageTexts(carol.page, texts.slice(10));

			const list = carol.page.locator('.messages-container');
			const anchor = carol.page.getByText('message-11', { exact: true });
			const distanceFromTop = () =>
				anchor.evaluate((element) => {
					const container = element.closest('.messages-container')!;
					return element.getBoundingClientRect().top - container.getBoundingClientRect().top;
				});
			let releasePage!: () => void;
			const pageHeld = new Promise<void>((resolve) => (releasePage = resolve));
			await carol.page.route(/\/chat\/messages\?.*nextPageToken/, async (route) => {
				await pageHeld;
				await route.continue();
			});
			await list.evaluate((element) => (element.scrollTop = 0));
			const before = await distanceFromTop();

			releasePage();
			await expectChatMessageTexts(carol.page, texts);
			await expect.poll(async () => Math.abs((await distanceFromTop()) - before)).toBeLessThanOrEqual(2);
		});

		test('should show the live messages and no error when the history cannot be loaded', async ({ browser }) => {
			let attempts = 0;
			const alice = await join(browser, accessUrl, 'alice');
			const carol = await join(browser, accessUrl, 'carol', {
				before: (page) =>
					page.route(/\/chat\/messages\?/, (route) => {
						attempts++;
						return route.fulfill({
							status: 503,
							contentType: 'application/json',
							body: JSON.stringify({ error: 'Unavailable', message: 'The history cannot be read' })
						});
					})
			});
			await Promise.all([waitForRemoteStream(alice.page, 1), waitForRemoteStream(carol.page, 1)]);
			await Promise.all([toggleChatPanel(alice.page), toggleChatPanel(carol.page)]);

			await sendChatMessage(alice.page, 'hello');

			await expectChatMessageTexts(carol.page, ['hello']);
			expect(attempts).toBeGreaterThan(0);
			await expect(
				carol.page.locator('.error-page, .disconnected-container, .ov-notification[data-kind="error"]')
			).toHaveCount(0);
		});

		test('should show the messages again when the participant reloads the page during the meeting', async ({
			browser
		}) => {
			const [alice, bob] = await joinPair(browser, accessUrl, ['alice', 'bob']);
			await sendChatMessage(alice.page, 'hello');
			await expectChatMessageTexts(bob.page, ['hello']);
			await sendChatMessage(bob.page, 'hi alice');
			await waitForChatStored(roomId, alice.roomMemberToken, ['hello', 'hi alice']);

			const loaded = waitForChatHistoryResponse(alice.page);
			await reopenPrejoin(alice.page, accessUrl);
			await clickJoinMeeting(alice.page);
			await loaded;
			await toggleChatPanel(alice.page);

			await expectChatMessageTexts(alice.page, ['hello', 'hi alice']);
		});

		test('should show a message sent while the connection was lost once it resumes, without a notice', async ({
			browser
		}) => {
			test.setTimeout(120_000);
			const viewer = await join(browser, accessUrl, 'viewer', { alerts: true });
			const alice = await join(browser, accessUrl, 'alice');
			await Promise.all([waitForRemoteStream(viewer.page, 1), waitForRemoteStream(alice.page, 1)]);
			await toggleChatPanel(alice.page);

			const outage = await cutNetwork(viewer.page);
			await outage.clientResuming;
			await sendChatMessage(alice.page, 'missed you');
			await waitForChatStored(roomId, alice.roomMemberToken, ['missed you']);

			const reloaded = waitForChatHistoryResponse(viewer.page);
			expect(await outage.restore()).toBe('reconnect');
			await reloaded;
			await toggleChatPanel(viewer.page);

			await expectChatMessageTexts(viewer.page, ['missed you']);
			expect(await chatAlerts(viewer.page)).toEqual({ notices: 0, sounds: 0, unread: 0 });
		});

		test('should show a message sent while the connection was lost once it is back after a full reconnect, without a notice', async ({
			browser
		}) => {
			let signalling!: Awaited<ReturnType<typeof tapSignalling>>;
			const viewer = await join(browser, accessUrl, 'viewer', {
				alerts: true,
				before: async (page) => {
					signalling = await tapSignalling(page);
				}
			});
			const alice = await join(browser, accessUrl, 'alice');
			await Promise.all([waitForRemoteStream(viewer.page, 1), waitForRemoteStream(alice.page, 1)]);
			await toggleChatPanel(alice.page);

			const reloaded = waitForChatHistoryResponse(viewer.page);
			await signalling.requestFullReconnect();
			await sendChatMessage(alice.page, 'missed you');
			await waitForChatStored(roomId, alice.roomMemberToken, ['missed you']);
			signalling.completeReconnect();
			await reloaded;
			await toggleChatPanel(viewer.page);

			await expectChatMessageTexts(viewer.page, ['missed you']);
			expect(await chatAlerts(viewer.page)).toEqual({ notices: 0, sounds: 0, unread: 0 });
		});

		test('should show the messages sent before a participant was granted chatRead once they are', async ({
			browser
		}) => {
			const reader = await createRoomMember(roomId, {
				name: 'reader',
				baseRole: MeetRoomMemberRole.SPEAKER,
				customPermissions: { chatRead: false }
			});
			const alice = await join(browser, accessUrl, 'alice');
			const readerJoined = await join(browser, reader.accessUrl, 'reader');
			await expectNoChat(readerJoined.page);
			await toggleChatPanel(alice.page);
			await sendChatMessage(alice.page, 'hello');
			await waitForChatStored(roomId, alice.roomMemberToken, ['hello']);

			await updateRoomMemberPermissions(roomId, reader.memberId, { customPermissions: { chatRead: true } });
			await expectChatAvailable(readerJoined.page);
			await toggleChatPanel(readerJoined.page);

			await expectChatMessageTexts(readerJoined.page, ['hello']);
		});

		test('should show the messages sent before a participant was promoted to a role with chatRead once they are', async ({
			browser
		}) => {
			const chatRoom = await createRoom({
				roles: { speaker: { permissions: { chatRead: false, chatWrite: false } } }
			});
			createdRoomIds.push(chatRoom.roomId);
			const [promoter, promoted] = await Promise.all([
				createRoomMember(chatRoom.roomId, { name: 'Promoter', baseRole: MeetRoomMemberRole.MODERATOR }),
				createRoomMember(chatRoom.roomId, { name: 'Promoted', baseRole: MeetRoomMemberRole.SPEAKER })
			]);
			const promoterPage = await join(browser, promoter.accessUrl, 'Promoter');
			const promotedPage = await join(browser, promoted.accessUrl, 'Promoted');
			await expectNoChat(promotedPage.page);
			await toggleChatPanel(promoterPage.page);
			await sendChatMessage(promoterPage.page, 'hello');
			await waitForChatStored(chatRoom.roomId, promoterPage.roomMemberToken, ['hello']);

			await toggleParticipantsPanel(promoterPage.page);
			await makeParticipantModerator(
				promoterPage.page,
				await getParticipantIdByName(promoterPage.page, 'Promoted')
			);
			await expectChatAvailable(promotedPage.page);
			await toggleChatPanel(promotedPage.page);

			await expectChatMessageTexts(promotedPage.page, ['hello']);
		});

		test('should raise no notice, sound or unread count for the history of a meeting a participant joins', async ({
			browser
		}) => {
			const alice = await join(browser, accessUrl, 'alice');
			await toggleChatPanel(alice.page);
			const texts = ['one', 'two', 'three'];

			for (const text of texts) {
				await sendChatMessage(alice.page, text);
			}

			await waitForChatStored(roomId, alice.roomMemberToken, texts);

			const bob = await join(browser, accessUrl, 'bob', { alerts: true, history: true });
			await bob.historyLoaded;
			await toggleChatPanel(bob.page);
			await expectChatMessageTexts(bob.page, texts);
			expect(await chatAlerts(bob.page)).toEqual({ notices: 0, sounds: 0, unread: 0 });

			await toggleChatPanel(bob.page, 'close');
			await waitForRemoteStream(alice.page, 1);
			await sendChatMessage(alice.page, 'live');
			await expectChatMessageNotification(bob.page);
			expect(await chatAlerts(bob.page)).toMatchObject({ notices: 1, sounds: 1 });
		});

		test('should show an anonymous participant their own saved messages as their own after they reload', async ({
			browser
		}) => {
			const [alice, bob] = await joinPair(browser, accessUrl, ['alice', 'bob']);
			await sendChatMessage(alice.page, 'hello');
			await expectChatMessageTexts(bob.page, ['hello']);
			await waitForChatStored(roomId, alice.roomMemberToken, ['hello']);

			const loaded = waitForChatHistoryResponse(alice.page);
			await reopenPrejoin(alice.page, accessUrl);
			await clickJoinMeeting(alice.page);
			await loaded;
			await toggleChatPanel(alice.page);

			await expectChatMessageTexts(alice.page, ['hello']);
			await expectOwnChatMessageAt(alice.page, 0);
		});

		test('should show an anonymous participant their saved messages as those of another participant when they join again from another browser', async ({
			browser
		}) => {
			const [dave, bob] = await joinPair(browser, accessUrl, ['dave', 'bob']);
			await sendChatMessage(dave.page, 'hello');
			await expectChatMessageTexts(bob.page, ['hello']);
			await waitForChatStored(roomId, bob.roomMemberToken, ['hello']);
			await dave.page.close();

			const again = await join(browser, accessUrl, 'dave', { history: true });
			await again.historyLoaded;
			await toggleChatPanel(again.page);

			await expectChatMessageTexts(again.page, ['hello']);
			await expectChatMessageFromAt(again.page, 0, 'dave', true);
		});

		test('should label the messages of an anonymous participant in a room that does not save its chat', async ({
			browser
		}) => {
			const unsaved = await createUnsavedRoom();
			const [sara, bob] = await joinPair(browser, unsaved.accessUrl, ['sara', 'bob']);

			await sendChatMessage(sara.page, 'hi');

			await expectChatMessageTexts(bob.page, ['hi']);
			await expectChatMessageFromAt(bob.page, 0, 'sara', true);
		});

		test('should keep the messages of a member removed from the room during the meeting', async ({ browser }) => {
			const diego = await createRoomMember(roomId, { name: 'diego', baseRole: MeetRoomMemberRole.SPEAKER });
			const bob = await join(browser, accessUrl, 'bob');
			const diegoPage = await join(browser, diego.accessUrl, 'diego');
			await Promise.all([waitForRemoteStream(bob.page, 1), waitForRemoteStream(diegoPage.page, 1)]);
			await toggleChatPanel(diegoPage.page);
			await sendChatMessage(diegoPage.page, 'see you');
			await waitForChatStored(roomId, bob.roomMemberToken, ['see you']);

			await deleteRoomMember(roomId, diego.memberId);

			const carol = await join(browser, accessUrl, 'carol', { history: true });
			await carol.historyLoaded;
			await toggleChatPanel(carol.page);

			await expectChatMessageTexts(carol.page, ['see you']);
			await expectChatMessageFromAt(carol.page, 0, 'diego', false);
		});

		test('should show a late joiner of an encrypted room no earlier messages and say that messages are not saved', async ({
			browser
		}) => {
			const e2eeKey = 'chat-history-key';
			const encrypted = await createRoomAndGetAnonymousAccessUrl({ config: { e2ee: { enabled: true } } });
			createdRoomIds.push(encrypted.room.roomId);
			const alice = await join(browser, encrypted.accessUrl, 'alice', { e2eeKey });
			const bob = await join(browser, encrypted.accessUrl, 'bob', { e2eeKey });
			await Promise.all([waitForRemoteStream(alice.page, 1), waitForRemoteStream(bob.page, 1)]);
			await Promise.all([toggleChatPanel(alice.page), toggleChatPanel(bob.page)]);
			await sendChatMessage(alice.page, 'secret');
			await expectChatMessageTexts(bob.page, ['secret']);

			const carol = await join(browser, encrypted.accessUrl, 'carol', { e2eeKey });
			await toggleChatPanel(carol.page);
			await expect(carol.page.locator('#chat-container .text-info')).toHaveText(/not saved/i);
			await sendChatMessage(alice.page, 'after');

			await expectChatMessageTexts(carol.page, ['after']);
		});

		test('should show none of the messages of one room in a meeting of another room entered in the same tab', async ({
			browser
		}) => {
			const [alice, bob] = await joinPair(browser, accessUrl, ['alice', 'bob']);
			await sendChatMessage(alice.page, 'from A');
			await expectChatMessageTexts(bob.page, ['from A']);
			await sendChatMessage(bob.page, 'to A');
			await expectChatMessageTexts(alice.page, ['from A', 'to A']);
			await waitForChatStored(roomId, alice.roomMemberToken, ['from A', 'to A']);
			await leaveMeeting(alice.page);

			const other = await createRoomAndGetAnonymousAccessUrl();
			createdRoomIds.push(other.room.roomId);
			const loaded = waitForChatHistoryResponse(alice.page);
			await openMeeting(alice.page, other.accessUrl, { name: 'alice' });
			await loaded;

			await expectNoUnreadChatMessages(alice.page);
			await toggleChatPanel(alice.page);
			await expectChatMessageTexts(alice.page, []);
		});
	});
});
