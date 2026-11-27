import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetChatMessage, MeetParticipantType } from '@openvidu-meet/typings';
import { BrowserStorageService } from '../../../../../shared/services/browser-storage.service';
import { AssetsService } from '../../../../../shared/services/assets.service';
import { HttpService } from '../../../../../shared/services/http.service';
import { NotificationService } from '../../../../../shared/services/notification.service';
import { MeetingContextService } from '../../../services/meeting-context.service';
import { ChatSender } from '../../models/chat.model';
import { MeetingUiConfigService } from '../config/meeting-ui-config.service';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { PanelService } from '../panel/panel.service';
import { ParticipantService } from '../participant/participant.service';
import { ChatService, MAX_FORWARDED_CHAT_MESSAGES } from './chat.service';

const roomMetadata = (persist: boolean) =>
	JSON.stringify({
		createdBy: 'openvidu-meet',
		roomOptions: { config: { chat: { enabled: true, persist }, e2ee: { enabled: false } } }
	});
const SAVES = roomMetadata(true);
const DOES_NOT_SAVE = roomMetadata(false);
const SAVER = 'meet.chatSaver';

const alice: ChatSender = { identity: 'alice', name: 'Alice', isAnonymous: false };
const dave: ChatSender = { identity: 'dave-1', name: 'Dave', isAnonymous: true };

describe('ChatService', () => {
	const NOTICE_ID = 7;

	const settle = async () => {
		for (let i = 0; i < 20; i++) await Promise.resolve();
	};

	const texts = () => service.chatMessages().map(({ message }) => message);

	let service: ChatService;
	let notificationService: jasmine.SpyObj<NotificationService>;
	let sendText: jasmine.Spy;
	let getRequest: jasmine.Spy;
	let remoteParticipants: { identity: string; canReadChat: boolean }[];
	let stored: MeetChatMessage[];
	let metadata: string;
	let meetingSid: string;
	let storage: Map<string, unknown>;
	let myIdentity: string;
	const chatPanelButton = signal(true);
	const chatInput = signal(true);
	const sessionActive = signal(true);

	const saved = (text: string, sender: ChatSender, messageId = text): MeetChatMessage => ({
		messageId,
		roomId: 'room1',
		meetingId: meetingSid,
		channel: 'all',
		sendDate: 0,
		meetingStartDate: 0,
		text,
		participant: {
			identity: sender.identity,
			name: sender.name,
			type: sender.isAnonymous ? MeetParticipantType.ANONYMOUS : MeetParticipantType.USER
		}
	});
	const store = (...messages: MeetChatMessage[]) => stored.push(...messages);

	function configure() {
		chatPanelButton.set(true);
		chatInput.set(true);
		sessionActive.set(true);
		notificationService = jasmine.createSpyObj<NotificationService>('NotificationService', [
			'showNotification',
			'dismissNotification'
		]);
		notificationService.showNotification.and.returnValue(NOTICE_ID);
		sendText = jasmine.createSpy('sendText').and.resolveTo();
		remoteParticipants = [];
		stored = [];
		meetingSid = 'RM_1';
		myIdentity = 'me';
		storage = new Map();

		// A history that pages like the server's: newest first, the next page named by a token.
		getRequest = jasmine.createSpy('getRequest').and.callFake(async (path: string) => {
			const offset = Number(new URLSearchParams(path.split('?')[1]).get('nextPageToken') ?? 0);
			const newestFirst = [...stored].reverse();
			const isTruncated = offset + 20 < newestFirst.length;

			return {
				items: newestFirst.slice(offset, offset + 20),
				pagination: { isTruncated, nextPageToken: isTruncated ? String(offset + 20) : undefined, maxItems: 20 }
			};
		});

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: NotificationService, useValue: notificationService },
				{ provide: PanelService, useValue: { isChatPanelOpened: () => false } },
				{
					provide: MeetingUiConfigService,
					useValue: { chatPanelButtonSignal: chatPanelButton, chatInputEnabledSignal: chatInput }
				},
				{
					provide: ParticipantService,
					useValue: {
						remoteParticipants: () => remoteParticipants,
						sendText,
						getMyName: () => 'Me',
						getMyIdentity: () => myIdentity
					}
				},
				{
					provide: MeetingLiveKitService,
					useValue: {
						connectionState: signal('connected'),
						isSessionActive: sessionActive,
						isInitialized: () => true,
						getRoom: () => ({ metadata, getSid: () => Promise.resolve(meetingSid) })
					}
				},
				{ provide: MeetingContextService, useValue: { roomId: () => 'room1' } },
				{ provide: HttpService, useValue: { getRequest } },
				{
					provide: BrowserStorageService,
					useValue: {
						get: (key: string) => storage.get(key) ?? null,
						set: (key: string, value: unknown) => storage.set(key, value)
					}
				},
				{ provide: AssetsService, useValue: { chatMessageSound: '' } }
			]
		});
	}

	function start(roomMetadataOfTheMeeting: string) {
		metadata = roomMetadataOfTheMeeting;
		service = TestBed.inject(ChatService);
		TestBed.tick();
	}

	afterEach(() => jasmine.clock().uninstall());

	describe('in a meeting that does not save its chat', () => {
		beforeEach(() => {
			configure();
			start(DOES_NOT_SAVE);
		});

		it('forgets the messages and the new-message notice of the meeting it clears', () => {
			service.addRemoteMessage('hello', alice);
			expect(service.chatMessages()).toEqual([
				{
					isLocal: false,
					participantName: 'Alice',
					message: 'hello',
					messageId: undefined,
					identity: 'alice',
					anonymous: false
				}
			]);

			service.clear();

			expect(service.chatMessages()).toEqual([]);
			expect(service.newMessageCount()).toBe(0);
			expect(notificationService.dismissNotification).toHaveBeenCalledOnceWith(NOTICE_ID);
		});

		it('sends a message as a text stream to the participants holding chatRead only', async () => {
			remoteParticipants = [
				{ identity: 'reader', canReadChat: true },
				{ identity: 'non-reader', canReadChat: false }
			];

			await service.sendMessage('hello  there');

			expect(sendText).toHaveBeenCalledOnceWith('hello there', {
				topic: 'chat',
				destinationIdentities: ['reader']
			});
			expect(texts()).toEqual(['hello there']);
			expect(service.chatMessages()[0].isLocal).toBeTrue();
		});

		['', ' ', '     '].forEach((blank) => {
			it(`does not send a message of ${blank.length} space(s)`, async () => {
				remoteParticipants = [{ identity: 'reader', canReadChat: true }];

				await service.sendMessage(blank);

				expect(sendText).not.toHaveBeenCalled();
				expect(service.chatMessages()).toEqual([]);
			});
		});

		it('sends nothing when no participant holds chatRead, and still shows the own message', async () => {
			remoteParticipants = [{ identity: 'non-reader', canReadChat: false }];

			await service.sendMessage('hello');

			expect(sendText).not.toHaveBeenCalled();
			expect(texts()).toEqual(['hello']);
		});

		it('announces the first message after a clear as new', () => {
			service.addRemoteMessage('hello', alice);
			service.clear();

			service.addRemoteMessage('hi again', { identity: 'bob', name: 'Bob', isAnonymous: false });

			expect(texts()).toEqual(['hi again']);
			expect(notificationService.showNotification).toHaveBeenCalledTimes(2);
			expect(notificationService.dismissNotification).toHaveBeenCalledOnceWith(NOTICE_ID);
		});

		it('marks the messages of an anonymous participant', () => {
			service.addRemoteMessage('hi', dave);

			expect(service.chatMessages()[0].anonymous).toBeTrue();
		});

		it('forwards nothing to a participant who starts reading the chat', async () => {
			await service.forwardUnconfirmedTo('carol');

			expect(sendText).not.toHaveBeenCalled();
		});

		it('loads no history and stores no message id', async () => {
			await settle();
			await service.sendMessage('hello');

			expect(getRequest).not.toHaveBeenCalled();
			expect(service.chatMessages()[0].messageId).toBeUndefined();
		});

		it('keeps a message that arrives before the chat appears and shows it quietly once it does', () => {
			chatPanelButton.set(false);
			TestBed.tick();

			service.addRemoteMessage('early', alice);
			service.addRemoteMessage('forwarded early', alice, { 'meet.forwarded': 'true', 'meet.messageId': 'f1' });

			expect(service.chatMessages()).toEqual([]);

			chatPanelButton.set(true);
			TestBed.tick();

			expect(texts()).toEqual(['early', 'forwarded early']);
			expect(service.newMessageCount()).toBe(0);
			expect(notificationService.showNotification).not.toHaveBeenCalled();
		});

		it('counts a message that arrives live as new', () => {
			service.addRemoteMessage('hello', alice);

			expect(service.newMessageCount()).toBe(1);
		});

		it('loads nothing when chatRead is revoked and granted again', async () => {
			service.addRemoteMessage('hello', alice);
			chatPanelButton.set(false);
			TestBed.tick();

			chatPanelButton.set(true);
			TestBed.tick();
			await settle();

			expect(getRequest).not.toHaveBeenCalled();
			expect(texts()).toEqual(['hello']);
		});
	});

	describe('in a meeting that saves its chat', () => {
		beforeEach(() => {
			jasmine.clock().install();
			configure();
			remoteParticipants = [{ identity: 'reader', canReadChat: true }];
		});

		const sentTo = (call: number) => sendText.calls.argsFor(call)[1].destinationIdentities;
		const idOf = (call: number): string => sendText.calls.argsFor(call)[1].attributes['meet.messageId'];

		describe('sending', () => {
			beforeEach(() => start(SAVES));

			it('sends the message to the readers and the server, with an id', async () => {
				await service.sendMessage('hello');

				expect(sendText).toHaveBeenCalledOnceWith('hello', {
					topic: 'chat',
					destinationIdentities: ['reader', SAVER],
					attributes: { 'meet.messageId': idOf(0) }
				});
				expect(idOf(0)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
			});

			it('sends the message to the server even when nobody reads the chat', async () => {
				remoteParticipants = [];

				await service.sendMessage('hello');

				expect(sentTo(0)).toEqual([SAVER]);
			});

			it('sends a message live without the server while an earlier one is unconfirmed, and keeps it in order', async () => {
				await service.sendMessage('one');
				await service.sendMessage('two');

				expect(sentTo(1)).toEqual(['reader']);
				expect(idOf(1)).not.toBe(idOf(0));
				expect(texts()).toEqual(['one', 'two']);
			});

			it('only buffers a message sent while one is unconfirmed and nobody reads the chat', async () => {
				remoteParticipants = [];
				await service.sendMessage('one');

				await service.sendMessage('two');

				expect(sendText).toHaveBeenCalledTimes(1);
				expect(texts()).toEqual(['one', 'two']);
			});

			it('neither shows nor buffers a message whose first send throws', async () => {
				sendText.and.rejectWith(new Error('connection lost'));

				await expectAsync(service.sendMessage('lost')).toBeRejected();
				jasmine.clock().tick(60_000);
				await settle();

				expect(service.chatMessages()).toEqual([]);
				expect(sendText).toHaveBeenCalledTimes(1);
			});

			it('sends only the first of two messages sent in quick succession to the server, the second once the first is confirmed', async () => {
				const first = service.sendMessage('one');
				const second = service.sendMessage('two');
				await Promise.all([first, second]);

				expect(sendText).toHaveBeenCalledTimes(2);
				expect(sentTo(0)).toEqual(['reader', SAVER]);
				expect(sentTo(1)).toEqual(['reader']);
				expect(texts()).toEqual(['one', 'two']);

				service.confirmSaved(idOf(0));
				await settle();

				expect(sendText).toHaveBeenCalledTimes(3);
				expect(sendText.calls.mostRecent().args[0]).toBe('two');
				expect(sentTo(2)).toEqual([SAVER]);
				expect(idOf(2)).toBe(idOf(1));
			});

			it('sends the second of two messages sent in quick succession to the server when the first one throws', async () => {
				sendText.and.rejectWith(new Error('connection lost'));
				const first = service.sendMessage('lost');
				sendText.and.resolveTo();
				const second = service.sendMessage('two');
				await expectAsync(first).toBeRejected();
				await second;
				await settle();

				expect(texts()).toEqual(['two']);
				expect(sendText).toHaveBeenCalledTimes(3);
				expect(sendText.calls.mostRecent().args[0]).toBe('two');
				expect(sentTo(2)).toEqual([SAVER]);

				service.confirmSaved(idOf(2));
				jasmine.clock().tick(60_000);
				await settle();

				expect(sendText).toHaveBeenCalledTimes(3);
			});

			it('shows the message and raises no error while the server never confirms it', async () => {
				await service.sendMessage('hello');
				jasmine.clock().tick(20_000);
				await settle();

				expect(texts()).toEqual(['hello']);
				expect(notificationService.showNotification).not.toHaveBeenCalled();
			});
		});

		describe('resending', () => {
			beforeEach(() => start(SAVES));

			it('sends the unconfirmed message again to the server only, every 5 seconds', async () => {
				await service.sendMessage('hello');
				sendText.calls.reset();

				jasmine.clock().tick(4_999);
				expect(sendText).not.toHaveBeenCalled();

				jasmine.clock().tick(1);
				await settle();
				jasmine.clock().tick(5_000);
				await settle();

				expect(sendText).toHaveBeenCalledTimes(2);
				expect(sentTo(0)).toEqual([SAVER]);
				expect(sentTo(1)).toEqual([SAVER]);
			});

			it('sends one message at a time, the oldest, and the next as soon as the previous is confirmed', async () => {
				await service.sendMessage('one');
				await service.sendMessage('two');
				await service.sendMessage('three');
				const [one, two, three] = [0, 1, 2].map(idOf);
				sendText.calls.reset();

				jasmine.clock().tick(5_000);
				await settle();
				expect(sendText).toHaveBeenCalledOnceWith(
					'one',
					jasmine.objectContaining({ destinationIdentities: [SAVER] })
				);

				service.confirmSaved(one);
				await settle();
				expect(sendText.calls.mostRecent().args[0]).toBe('two');
				expect(sendText.calls.mostRecent().args[1].attributes['meet.messageId']).toBe(two);

				service.confirmSaved(two);
				await settle();
				expect(sendText.calls.mostRecent().args[0]).toBe('three');
				expect(sendText.calls.mostRecent().args[1].attributes['meet.messageId']).toBe(three);
			});

			it('stops sending once every message is confirmed', async () => {
				await service.sendMessage('hello');
				service.confirmSaved(idOf(0));
				sendText.calls.reset();

				jasmine.clock().tick(60_000);
				await settle();

				expect(sendText).not.toHaveBeenCalled();
			});

			it('keeps trying when a resend fails', async () => {
				await service.sendMessage('hello');
				sendText.and.rejectWith(new Error('connection lost'));

				jasmine.clock().tick(5_000);
				await settle();
				jasmine.clock().tick(5_000);
				await settle();

				expect(sendText).toHaveBeenCalledTimes(3);
			});

			it('forgets the unconfirmed messages when the participant leaves', async () => {
				await service.sendMessage('hello');
				sendText.calls.reset();

				service.clear();
				jasmine.clock().tick(60_000);
				await settle();

				expect(sendText).not.toHaveBeenCalled();
			});

			it('forgets the unconfirmed messages when the participant loses chatWrite', async () => {
				await service.sendMessage('hello');
				sendText.calls.reset();

				chatInput.set(false);
				TestBed.tick();
				jasmine.clock().tick(60_000);
				await settle();

				expect(sendText).not.toHaveBeenCalled();
			});

			it('forgets the unconfirmed messages when the participant loses chatRead', async () => {
				await service.sendMessage('hello');
				sendText.calls.reset();

				chatPanelButton.set(false);
				TestBed.tick();
				jasmine.clock().tick(60_000);
				await settle();

				expect(sendText).not.toHaveBeenCalled();
			});
		});

		describe('messages still being saved reaching those who start reading', () => {
			beforeEach(() => start(SAVES));

			const forwardedTo = (identity: string) =>
				sendText.calls
					.all()
					.filter(({ args }) => args[1].destinationIdentities[0] === identity)
					.map(({ args }) => args[0]);

			it('forwards the unconfirmed messages, in order, to that participant only, marked as forwarded', async () => {
				await service.sendMessage('pending');
				sendText.calls.reset();

				await service.forwardUnconfirmedTo('carol');

				expect(sendText).toHaveBeenCalledOnceWith('pending', {
					topic: 'chat',
					destinationIdentities: ['carol'],
					attributes: { 'meet.messageId': jasmine.any(String), 'meet.forwarded': 'true' }
				});
			});

			it('forwards the 20 newest messages of more than 20 being saved, in order', async () => {
				for (let i = 1; i <= 25; i++) await service.sendMessage(`message-${i}`);

				sendText.calls.reset();

				await service.forwardUnconfirmedTo('carol');

				expect(forwardedTo('carol')).toEqual(
					Array.from({ length: MAX_FORWARDED_CHAT_MESSAGES }, (_, i) => `message-${i + 6}`)
				);
			});

			it('forwards them again to an identity that comes back', async () => {
				await service.sendMessage('pending');
				sendText.calls.reset();

				await service.forwardUnconfirmedTo('bob');
				await service.forwardUnconfirmedTo('bob');

				expect(forwardedTo('bob')).toEqual(['pending', 'pending']);
			});

			it('forwards nothing once the messages are confirmed', async () => {
				await service.sendMessage('pending');
				service.confirmSaved(idOf(0));
				sendText.calls.reset();

				await service.forwardUnconfirmedTo('carol');

				expect(sendText).not.toHaveBeenCalled();
			});

			it('shows a forwarded message quietly, and once when the history loads it too', async () => {
				service.addRemoteMessage('pending', alice, { 'meet.messageId': 'p1', 'meet.forwarded': 'true' });

				expect(texts()).toEqual(['pending']);
				expect(service.newMessageCount()).toBe(0);
				expect(notificationService.showNotification).not.toHaveBeenCalled();

				store(saved('pending', alice, 'p1'));
				chatPanelButton.set(false);
				TestBed.tick();
				chatPanelButton.set(true);
				TestBed.tick();
				await settle();

				expect(texts()).toEqual(['pending']);
			});

			it('shows a forwarded message and a live one received before the chat appears, once it appears', async () => {
				chatPanelButton.set(false);
				TestBed.tick();

				service.addRemoteMessage('forwarded', alice, { 'meet.messageId': 'p1', 'meet.forwarded': 'true' });
				service.addRemoteMessage('live', alice, { 'meet.messageId': 'p2' });
				expect(texts()).toEqual([]);

				chatPanelButton.set(true);
				TestBed.tick();
				await settle();

				expect(texts()).toEqual(['forwarded', 'live']);
				expect(service.newMessageCount()).toBe(0);
				expect(notificationService.showNotification).not.toHaveBeenCalled();
			});
		});

		describe('loading the history', () => {
			it('loads the last 20 messages on joining, oldest first, with no notice and no unread count', async () => {
				for (let i = 1; i <= 30; i++) store(saved(`message-${i}`, alice));

				start(SAVES);
				await settle();

				expect(texts()).toEqual(Array.from({ length: 20 }, (_, i) => `message-${i + 11}`));
				expect(service.newMessageCount()).toBe(0);
				expect(notificationService.showNotification).not.toHaveBeenCalled();
				expect(getRequest).toHaveBeenCalledOnceWith(
					'internal-api/v1/meetings/room1/chat/messages?maxItems=20',
					{ 'x-ov-skip-auth-recovery': 'true' }
				);
			});

			it('loads earlier messages above the ones shown, 20 at a time, until the history ends', async () => {
				for (let i = 1; i <= 50; i++) store(saved(`message-${i}`, alice));

				start(SAVES);
				await settle();
				expect(service.hasEarlierMessages()).toBeTrue();

				await service.loadEarlier();
				expect(texts()[0]).toBe('message-11');
				expect(texts().length).toBe(40);
				expect(service.hasEarlierMessages()).toBeTrue();

				await service.loadEarlier();
				expect(texts()).toEqual(Array.from({ length: 50 }, (_, i) => `message-${i + 1}`));
				expect(service.hasEarlierMessages()).toBeFalse();
				expect(getRequest.calls.mostRecent().args[0]).toContain('nextPageToken=40');
			});

			it('shows the loaded messages before a live one that arrived while loading, and once when both carry the same id', async () => {
				store(saved('old', alice), saved('both', alice, 'b1'));
				start(SAVES);
				service.addRemoteMessage('both', alice, { 'meet.messageId': 'b1' });
				service.addRemoteMessage('newest', alice, { 'meet.messageId': 'n1' });
				await settle();

				expect(texts()).toEqual(['old', 'both', 'newest']);
			});

			it('shows no error and keeps the live messages when the history cannot be loaded', async () => {
				getRequest.and.rejectWith(new HttpErrorResponse({ status: 401 }));
				start(SAVES);
				await settle();

				service.addRemoteMessage('hello', alice);

				expect(texts()).toEqual(['hello']);
				expect(getRequest.calls.mostRecent().args[1]).toEqual({ 'x-ov-skip-auth-recovery': 'true' });
			});

			it('discards a page answered after the participant left', async () => {
				store(saved('old', alice));
				start(SAVES);

				service.clear();
				await settle();

				expect(texts()).toEqual([]);
			});

			it('loads the history when the participant is granted chatRead, once its token allows it', async () => {
				chatPanelButton.set(false);
				store(saved('hello', alice));
				start(SAVES);
				await settle();
				expect(getRequest).not.toHaveBeenCalled();

				chatPanelButton.set(true);
				TestBed.tick();
				await settle();

				expect(texts()).toEqual(['hello']);
			});

			describe('after chatRead was revoked and granted again', () => {
				const revokeReading = async () => {
					chatPanelButton.set(false);
					TestBed.tick();
					await settle();
				};

				const grantReading = async () => {
					chatPanelButton.set(true);
					TestBed.tick();
					await settle();
				};

				beforeEach(async () => {
					store(saved('before-1', alice), saved('before-2', alice));
					start(SAVES);
					await settle();
				});

				it('shows the earlier messages, then the ones sent meanwhile, once and without notice', async () => {
					await revokeReading();
					const meanwhile = Array.from({ length: 25 }, (_, i) => `meanwhile-${i + 1}`);
					store(...meanwhile.map((text) => saved(text, alice)));

					await grantReading();

					expect(texts()).toEqual(['before-1', 'before-2', ...meanwhile]);
					expect(service.newMessageCount()).toBe(0);
					expect(notificationService.showNotification).not.toHaveBeenCalled();
				});

				it('puts the messages sent meanwhile before the ones received once the grant is back', async () => {
					await revokeReading();
					store(saved('meanwhile', alice), saved('newer', alice));
					chatPanelButton.set(true);
					TestBed.tick();
					service.addRemoteMessage('newer', alice, { 'meet.messageId': 'newer' });
					await settle();

					expect(texts()).toEqual(['before-1', 'before-2', 'meanwhile', 'newer']);
					expect(service.newMessageCount()).toBe(0);
				});

				it('keeps its place when the connection comes back while the participant cannot read', async () => {
					await revokeReading();
					store(saved('meanwhile', alice));

					service.connectionLost();
					await service.connectionRestored();
					await grantReading();

					expect(texts()).toEqual(['before-1', 'before-2', 'meanwhile']);
				});
			});

			it('shows a stored message of an anonymous participant labelled as such', async () => {
				store(saved('hello', dave));
				start(SAVES);
				await settle();

				expect(service.chatMessages()[0].anonymous).toBeTrue();
				expect(service.chatMessages()[0].participantName).toBe('Dave');
			});

			it('shows as the own the messages sent under the own identity', async () => {
				store(saved('mine', { identity: 'me', name: 'Me', isAnonymous: false }));
				start(SAVES);
				await settle();

				expect(service.chatMessages()[0].isLocal).toBeTrue();
			});

			it('recognizes the own messages of an anonymous participant after a reload, only by id and identity together', async () => {
				const previousIdentity: ChatSender = { identity: 'dave-old', name: 'Dave', isAnonymous: true };
				const other: ChatSender = { identity: 'mallory', name: 'Mallory', isAnonymous: true };

				myIdentity = 'dave-old';
				start(SAVES);
				await service.sendMessage('hello');
				const sentId = idOf(0);
				const storageOfThePage = storage;

				TestBed.resetTestingModule();
				configure();
				storage = storageOfThePage;
				store(saved('hello', previousIdentity, sentId), saved('copied id', other, sentId));
				myIdentity = 'dave-new';
				start(SAVES);
				await settle();

				expect(service.chatMessages().map(({ isLocal }) => isLocal)).toEqual([true, false]);
			});
		});

		it('does not recognize as the own a message sent in an earlier meeting of the room', async () => {
			storage.set('chatSent-room1', { meetingId: 'RM_0', sent: [['copied', 'dave-old']] });
			store(saved('hello', { identity: 'dave-old', name: 'Dave', isAnonymous: true }, 'copied'));
			start(SAVES);
			await settle();

			expect(service.chatMessages()[0].isLocal).toBeFalse();
		});

		describe('after the connection was lost', () => {
			const startShowing = async (...before: string[]) => {
				for (const text of before) store(saved(text, alice));

				start(SAVES);
				await settle();
			};

			it('puts the 25 missed messages between the ones before the drop and the one received after it', async () => {
				await startShowing('before-1', 'before-2');
				service.connectionLost();
				const missed = Array.from({ length: 25 }, (_, i) => `missed-${i + 1}`);
				store(...missed.map((text) => saved(text, alice)));
				store(saved('after', alice));
				service.addRemoteMessage('after', alice, { 'meet.messageId': 'after' });

				await service.connectionRestored();

				expect(texts()).toEqual(['before-1', 'before-2', ...missed, 'after']);
				expect(service.newMessageCount()).toBe(0);
			});

			it('does not stop at an own message that was unconfirmed when the connection was lost and stored after the missed ones', async () => {
				await startShowing('before-1', 'before-2');
				await service.sendMessage('mine');
				service.connectionLost();
				store(
					saved('missed-1', alice),
					saved('missed-2', alice),
					saved('mine', { identity: 'me', isAnonymous: false }, idOf(0))
				);

				await service.connectionRestored();

				expect(texts()).toEqual(['before-1', 'before-2', 'mine', 'missed-1', 'missed-2']);
			});

			it('loads only the first page when nothing was shown', async () => {
				await startShowing();
				service.connectionLost();

				for (let i = 1; i <= 50; i++) store(saved(`message-${i}`, alice));

				getRequest.calls.reset();

				await service.connectionRestored();

				expect(getRequest).toHaveBeenCalledTimes(1);
				expect(texts().length).toBe(20);
			});

			it('raises no notice for a message received while the connection was lost or until the history loads', async () => {
				await startShowing('before');
				service.connectionLost();

				service.addRemoteMessage('meanwhile', alice, { 'meet.messageId': 'm1' });
				expect(notificationService.showNotification).not.toHaveBeenCalled();
				expect(service.newMessageCount()).toBe(0);

				await service.connectionRestored();
				service.addRemoteMessage('later', alice, { 'meet.messageId': 'm2' });

				expect(notificationService.showNotification).toHaveBeenCalledTimes(1);
				expect(service.newMessageCount()).toBe(1);
			});

			it('keeps the live messages when the history cannot be loaded, and raises notices again', async () => {
				await startShowing('before');
				service.connectionLost();
				getRequest.and.rejectWith(new Error('offline'));

				await service.connectionRestored();
				service.addRemoteMessage('later', alice, { 'meet.messageId': 'm2' });

				expect(texts()).toEqual(['before', 'later']);
				expect(notificationService.showNotification).toHaveBeenCalledTimes(1);
			});
		});
	});
});
