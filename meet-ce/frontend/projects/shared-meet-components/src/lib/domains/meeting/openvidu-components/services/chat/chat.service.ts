import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import {
	MEET_CHAT_SAVER_IDENTITY,
	MeetChatMessage,
	MeetChatStreamAttribute,
	MeetParticipantType
} from '@openvidu-meet/typings';
import { ChatMessage, ChatSender } from '../../models/chat.model';
import { DataTopic } from '../../models/data-topic.model';
import { PanelType } from '../../models/panel.model';
import { parseMeetingSavesChat } from '../../../utils/room-metadata.utils';
import { MeetingUiConfigService } from '../config/meeting-ui-config.service';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { PanelService } from '../panel/panel.service';
import { ParticipantService } from '../participant/participant.service';
import { HTTP_HEADERS } from '../../../../../shared/constants/http-headers.constants';
import { AssetsService } from '../../../../../shared/services/assets.service';
import { BrowserStorageService } from '../../../../../shared/services/browser-storage.service';
import { HttpService } from '../../../../../shared/services/http.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { NotificationService } from '../../../../../shared/services/notification.service';
import type { ILogger } from '../../../../../shared/models/logger.model';
import { MeetingContextService } from '../../../services/meeting-context.service';

/** Long enough to reach the button it offers, which three seconds was not. */
const CHAT_NOTIFICATION_DURATION_MS = 5_000;
/** How long the oldest unconfirmed message waits for the server's confirmation before it is sent again. */
const RESEND_AFTER_MS = 5_000;
const HISTORY_PAGE_SIZE = 20;
/** The newest unconfirmed messages a participant who starts reading the chat gets from their sender. */
export const MAX_FORWARDED_CHAT_MESSAGES = HISTORY_PAGE_SIZE;

interface ChatHistoryPage {
	items: MeetChatMessage[];
	pagination: { isTruncated: boolean; nextPageToken?: string; maxItems: number };
}

/** The messages of a page of the history, newest first, and the token of the next older page if any. */
interface LoadedPage {
	messages: ChatMessage[];
	next?: string;
}

/** A message this participant sent that the server has not confirmed storing. */
interface UnconfirmedMessage {
	messageId: string;
	text: string;
}

/** What the panel showed when the connection was lost: where the messages missed meanwhile go, and what to look for. */
interface ConnectionGap {
	after?: ChatMessage;
	shown: Set<string>;
}

/** The `[messageId, identity]` pairs this browser sent in a room's current meeting. */
interface SentMessages {
	meetingId: string;
	sent: [string, string][];
}

const messageKey = (identity: string | undefined, messageId: string): string => `${identity}|${messageId}`;

const keyOf = (message: ChatMessage): string | undefined =>
	message.messageId === undefined ? undefined : messageKey(message.identity, message.messageId);

/**
 * @internal
 */
@Service()
export class ChatService {
	private readonly participantService = inject(ParticipantService);
	private readonly panelService = inject(PanelService);
	private readonly uiConfig = inject(MeetingUiConfigService);
	private readonly notificationService = inject(NotificationService);
	private readonly assets = inject(AssetsService);
	private readonly meetingLiveKit = inject(MeetingLiveKitService);
	private readonly meetingContext = inject(MeetingContextService);
	private readonly httpService = inject(HttpService);
	private readonly storage = inject(BrowserStorageService);
	private log: ILogger = inject(LoggerService).get('ChatService');

	private readonly messages = signal<ChatMessage[]>([]);
	private readonly newMessages = signal(0);
	private readonly nextPageToken = signal<string | undefined>(undefined);

	/** The messages of the chat, in the order they are shown. */
	readonly chatMessages = this.messages.asReadonly();
	/** How many messages arrived live, not loaded and not quiet, in the meeting so far. */
	readonly newMessageCount = this.newMessages.asReadonly();
	/** Whether the history holds messages older than the ones shown. */
	readonly hasEarlierMessages = computed(() => this.nextPageToken() !== undefined);
	/**
	 * Whether the meeting saves its chat, by the room config its LiveKit room carries, which is fixed
	 * for the meeting and readable once the connection is up.
	 */
	readonly savesChat = computed(() => {
		this.meetingLiveKit.connectionState();

		return this.meetingLiveKit.isInitialized() && parseMeetingSavesChat(this.meetingLiveKit.getRoom().metadata);
	});

	private messageSound?: HTMLAudioElement;
	private shownId: number | undefined;
	private unconfirmed: UnconfirmedMessage[] = [];
	private resendTimer?: ReturnType<typeof setTimeout>;
	/** Messages that arrived before the participant's chat appeared. */
	private held: ChatMessage[] = [];
	private gap?: ConnectionGap;
	private readingChat = false;
	private loadingEarlier = false;
	/** Changes when the meeting ends, so an answer that arrives later is discarded. */
	private epoch = 0;

	private readonly chatAppearsEffect = effect(() => {
		const canRead = this.uiConfig.chatPanelButtonSignal();
		const inMeeting = this.meetingLiveKit.isSessionActive();

		untracked(() => {
			if (!canRead) {
				this.chatDisappears();
				return;
			}

			this.readingChat = true;
			this.showHeldMessages();

			if (this.gap) {
				void this.connectionRestored();
			} else if (inMeeting && this.savesChat()) {
				void this.loadFirstPage();
			}
		});
	});
	private readonly unconfirmedLimitEffect = effect(() => {
		if (!this.uiConfig.chatPanelButtonSignal() || !this.uiConfig.chatInputEnabledSignal()) {
			untracked(() => this.dropUnconfirmed());
		}
	});

	/**
	 * Adds a message from a remote participant. A participant whose chat is not shown yet gets nothing
	 * until it appears, and then no notice or sound either, like for a message forwarded because it was
	 * still unconfirmed when they started reading.
	 *
	 * @param message
	 * @param sender
	 * @param attributes The attributes of the text stream the message came in
	 */
	addRemoteMessage(message: string, sender: ChatSender, attributes: Record<string, string> = {}): void {
		const received: ChatMessage = {
			isLocal: false,
			participantName: sender.name || sender.identity || 'Unknown',
			message,
			messageId: attributes[MeetChatStreamAttribute.MESSAGE_ID],
			identity: sender.identity,
			anonymous: sender.isAnonymous
		};

		if (!this.uiConfig.chatPanelButtonSignal()) {
			this.held.push(received);
			return;
		}

		this.receive(received, attributes[MeetChatStreamAttribute.FORWARDED] === 'true');
	}

	/**
	 * Sends a chat message as a text stream to the participants holding `chatRead`, so the media server
	 * never delivers it to anyone else, even when the meeting is encrypted. In a meeting that saves its
	 * chat it also goes to the server, which confirms it once stored; until then it is kept to be sent again.
	 *
	 * @param message The message text to send
	 */
	async sendMessage(message: string) {
		const plainTextMessage = message.replace(/ +(?= )/g, '');

		if (plainTextMessage !== '' && plainTextMessage !== ' ') {
			try {
				const messageId = this.savesChat() ? crypto.randomUUID() : undefined;
				const identity = this.participantService.getMyIdentity()!;

				const sendToSaver = messageId !== undefined && this.unconfirmed.length === 0;

				if (messageId !== undefined) this.keepUntilConfirmed({ messageId, text: plainTextMessage });

				try {
					await this.deliver(plainTextMessage, messageId, sendToSaver);
				} catch (error) {
					if (messageId !== undefined) this.release(messageId);

					throw error;
				}

				this.append(
					{
						isLocal: true,
						participantName: this.participantService.getMyName()!,
						message: plainTextMessage,
						messageId,
						identity
					},
					false
				);

				if (messageId !== undefined) await this.rememberSent(messageId, identity);
			} catch (error) {
				this.log.e('Error sending chat message:', error);
				throw error;
			}
		}
	}

	/** The server stored the message: its sender stops sending it again, and the next one goes. */
	confirmSaved(messageId: string): void {
		this.release(messageId);
	}

	/**
	 * Delivers the messages still unconfirmed, the newest {@link MAX_FORWARDED_CHAT_MESSAGES}, to a participant
	 * who starts reading the chat, since they never received them.
	 */
	async forwardUnconfirmedTo(identity: string): Promise<void> {
		if (!this.savesChat()) return;

		for (const { messageId, text } of this.unconfirmed.slice(-MAX_FORWARDED_CHAT_MESSAGES)) {
			try {
				await this.participantService.sendText(text, {
					topic: DataTopic.CHAT,
					destinationIdentities: [identity],
					attributes: {
						[MeetChatStreamAttribute.MESSAGE_ID]: messageId,
						[MeetChatStreamAttribute.FORWARDED]: 'true'
					}
				});
			} catch (error) {
				this.log.w('Could not forward a chat message to a participant who started reading:', error);
				return;
			}
		}
	}

	/** Loads the next older page of the history. */
	async loadEarlier(): Promise<void> {
		const token = this.nextPageToken();

		if (token === undefined || this.loadingEarlier) return;

		this.loadingEarlier = true;

		try {
			await this.prependPage(token);
		} catch (error) {
			this.log.w('Could not load earlier chat messages:', error);
		} finally {
			this.loadingEarlier = false;
		}
	}

	/**
	 * The connection dropped: notes where the panel stands, so what was sent meanwhile goes there once
	 * the history is loaded again, and what arrives until then raises no notice.
	 */
	connectionLost(): void {
		if (this.uiConfig.chatPanelButtonSignal()) this.startGap();
	}

	/**
	 * The connection came back, or the participant was granted `chatRead` again: loads the history from the
	 * newest until it reaches what the panel showed when the gap began, and puts what is new there.
	 */
	async connectionRestored(): Promise<void> {
		const gap = this.gap;

		if (!gap || !this.uiConfig.chatPanelButtonSignal()) return;

		const epoch = this.epoch;

		try {
			const missed = await this.loadMissed(gap);

			if (epoch !== this.epoch) return;

			this.messages.update((shown) => {
				const at = gap.after ? shown.indexOf(gap.after) + 1 : 0;

				return [...shown.slice(0, at), ...this.notShown(missed, shown), ...shown.slice(at)];
			});
		} catch (error) {
			this.log.w('Could not load the chat messages missed while disconnected:', error);
		} finally {
			if (this.gap === gap) this.gap = undefined;
		}
	}

	/** Forgets the meeting's messages and its new-message notice, so the next meeting starts with an empty chat. */
	clear(): void {
		this.epoch++;
		this.messages.set([]);
		this.newMessages.set(0);
		this.nextPageToken.set(undefined);
		this.held = [];
		this.gap = undefined;
		this.readingChat = false;
		this.dropUnconfirmed();
		this.dismissAnnouncement();
	}

	/** Losing `chatRead` is the start of a gap that granting it again closes, as a lost connection's is. */
	private chatDisappears() {
		if (!this.readingChat) return;

		this.readingChat = false;
		this.startGap();
	}

	private startGap() {
		if (this.gap || !this.savesChat()) return;

		const identity = this.participantService.getMyIdentity();
		const unconfirmed = new Set(this.unconfirmed.map(({ messageId }) => messageKey(identity, messageId)));
		const shown = this.messages();

		this.gap = {
			after: shown.at(-1),
			shown: new Set(shown.map(keyOf).filter((key): key is string => key !== undefined && !unconfirmed.has(key)))
		};
	}

	private append(message: ChatMessage, quiet: boolean) {
		this.messages.update((shown) => [...shown, message]);

		if (!quiet) this.newMessages.update((count) => count + 1);
	}

	private receive(message: ChatMessage, forwarded: boolean) {
		const key = keyOf(message);

		if (key !== undefined && this.messages().some((shown) => keyOf(shown) === key)) return;

		const quiet = forwarded || this.gap !== undefined;
		this.append(message, quiet);

		if (!quiet && !this.panelService.isChatPanelOpened()) {
			this.announceMessage(message.participantName);
			this.playMessageSound();
		}
	}

	private showHeldMessages() {
		const held = this.held;
		this.held = [];

		for (const message of held) this.receive(message, true);
	}

	private async deliver(text: string, messageId: string | undefined, sendToSaver: boolean) {
		const readers = this.participantService
			.remoteParticipants()
			.filter((participant) => participant.canReadChat)
			.map((participant) => participant.identity);
		const destinationIdentities = sendToSaver ? [...readers, MEET_CHAT_SAVER_IDENTITY] : readers;

		if (destinationIdentities.length > 0) {
			await this.participantService.sendText(text, {
				topic: DataTopic.CHAT,
				destinationIdentities,
				...(messageId !== undefined && { attributes: { [MeetChatStreamAttribute.MESSAGE_ID]: messageId } })
			});
		}
	}

	private keepUntilConfirmed(message: UnconfirmedMessage) {
		this.unconfirmed.push(message);

		if (this.unconfirmed.length === 1) this.armResend();
	}

	/** Stops keeping a message, and when it was the oldest the next one goes to the server. */
	private release(messageId: string) {
		const index = this.unconfirmed.findIndex((unconfirmed) => unconfirmed.messageId === messageId);

		if (index === -1) return;

		this.unconfirmed.splice(index, 1);
		this.armResend();

		if (index === 0) void this.sendOldest();
	}

	private armResend() {
		clearTimeout(this.resendTimer);
		this.resendTimer =
			this.unconfirmed.length > 0 ? setTimeout(() => void this.sendOldest(), RESEND_AFTER_MS) : undefined;
	}

	/** Sends the oldest unconfirmed message to the server only: the others already have it. */
	private async sendOldest() {
		const oldest = this.unconfirmed[0];

		if (!oldest) return;

		try {
			await this.participantService.sendText(oldest.text, {
				topic: DataTopic.CHAT,
				destinationIdentities: [MEET_CHAT_SAVER_IDENTITY],
				attributes: { [MeetChatStreamAttribute.MESSAGE_ID]: oldest.messageId }
			});
		} catch (error) {
			this.log.w('Could not send a chat message to be saved:', error);
		}

		this.armResend();
	}

	private dropUnconfirmed() {
		this.unconfirmed = [];
		this.armResend();
	}

	private async loadFirstPage() {
		try {
			await this.prependPage();
		} catch (error) {
			this.log.w('Could not load the chat history:', error);
		}
	}

	/** Puts a page of the history above the messages shown, unless the meeting ended while it loaded. */
	private async prependPage(pageToken?: string) {
		const epoch = this.epoch;
		const { messages, next } = await this.fetchPage(pageToken);

		if (epoch !== this.epoch) return;

		this.nextPageToken.set(next);
		this.messages.update((shown) => [...this.notShown(messages, shown), ...shown]);
	}

	/** The messages stored since the panel last showed what `gap` holds, newest first. */
	private async loadMissed({ shown }: ConnectionGap): Promise<ChatMessage[]> {
		const missed: ChatMessage[] = [];
		let token: string | undefined;

		do {
			const page = await this.fetchPage(token);
			const known = page.messages.findIndex((message) => shown.has(keyOf(message)!));

			missed.push(...(known === -1 ? page.messages : page.messages.slice(0, known)));

			if (known !== -1) return missed;

			token = page.next;
		} while (token !== undefined && shown.size > 0);

		return missed;
	}

	/** Of messages from the history, newest first, the ones `shown` does not hold yet, oldest first. */
	private notShown(messages: ChatMessage[], shown: ChatMessage[]): ChatMessage[] {
		const keys = new Set(shown.map(keyOf));

		return messages.filter((message) => !keys.has(keyOf(message)!)).reverse();
	}

	private async fetchPage(pageToken?: string): Promise<LoadedPage> {
		const roomId = this.meetingContext.roomId();

		if (!roomId) throw new Error('There is no meeting to read the chat history of');

		const query = new URLSearchParams({ maxItems: String(HISTORY_PAGE_SIZE) });

		if (pageToken !== undefined) query.set('nextPageToken', pageToken);

		const [{ items, pagination }, sent] = await Promise.all([
			this.httpService.getRequest<ChatHistoryPage>(
				`${HttpService.INTERNAL_API_PATH_PREFIX}/meetings/${roomId}/chat/messages?${query}`,
				{ [HTTP_HEADERS.SKIP_AUTH_RECOVERY]: 'true' }
			),
			this.sentKeys()
		]);
		const myIdentity = this.participantService.getMyIdentity();

		return {
			messages: items.map(({ participant, messageId, text }) => ({
				isLocal: participant.identity === myIdentity || sent.has(messageKey(participant.identity, messageId)),
				participantName: participant.name ?? '',
				message: text,
				messageId,
				identity: participant.identity,
				anonymous: participant.type === MeetParticipantType.ANONYMOUS
			})),
			next: pagination.isTruncated ? pagination.nextPageToken : undefined
		};
	}

	private async rememberSent(messageId: string, identity: string) {
		try {
			const record = await this.sentMessages();

			this.storage.set(this.sentMessagesKey(), { ...record, sent: [...record.sent, [messageId, identity]] });
		} catch (error) {
			this.log.w('Could not remember a sent chat message:', error);
		}
	}

	private async sentKeys(): Promise<Set<string>> {
		try {
			const { sent } = await this.sentMessages();

			return new Set(sent.map(([messageId, identity]) => messageKey(identity, messageId)));
		} catch (error) {
			this.log.w('Could not read the chat messages this browser sent:', error);
			return new Set();
		}
	}

	/** What this browser sent in the room's current meeting: a record of an earlier meeting does not count. */
	private async sentMessages(): Promise<SentMessages> {
		const meetingId = await this.meetingLiveKit.getRoom().getSid();
		const stored = this.storage.get<SentMessages>(this.sentMessagesKey());

		return stored?.meetingId === meetingId ? stored : { meetingId, sent: [] };
	}

	private sentMessagesKey(): string {
		return `chatSent-${this.meetingContext.roomId()}`;
	}

	/**
	 * Tells the participant a message arrived while they had the chat closed, offering to open it.
	 * Only the latest message is announced: a burst of them must not stack up over the meeting.
	 */
	private announceMessage(participantName: string): void {
		this.dismissAnnouncement();
		this.shownId = this.notificationService.showNotification({
			kind: 'chat-message',
			icon: 'chat',
			message: {
				key: 'PANEL.CHAT.MESSAGE_SENT_NOTIFICATION',
				params: { name: participantName.toUpperCase() }
			},
			durationMs: CHAT_NOTIFICATION_DURATION_MS,
			action: {
				label: { key: 'PANEL.CHAT.OPEN_CHAT' },
				run: () => this.panelService.togglePanel(PanelType.CHAT)
			}
		});
	}

	private playMessageSound(): void {
		if (!this.messageSound) {
			this.messageSound = new Audio(this.assets.chatMessageSound);
			this.messageSound.volume = 0.6;
		}

		this.messageSound.play().catch(() => {});
	}

	private dismissAnnouncement(): void {
		if (this.shownId === undefined) return;

		this.notificationService.dismissNotification(this.shownId);
		this.shownId = undefined;
	}
}
