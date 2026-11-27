import {
	afterNextRender,
	AfterViewInit,
	Component,
	computed,
	effect,
	ElementRef,
	inject,
	Injector,
	signal,
	untracked,
	viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChatMessage, MAX_CHAT_MESSAGE_LENGTH } from '../../../models/chat.model';
import { PanelType } from '../../../models/panel.model';
import { LinkifyPipe } from '../../../pipes/linkify.pipe';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { ChatService } from '../../../services/chat/chat.service';
import { MeetingUiConfigService } from '../../../services/config/meeting-ui-config.service';
import { E2eeService } from '../../../services/e2ee/e2ee.service';
import { PanelService } from '../../../services/panel/panel.service';
import { ParticipantService } from '../../../services/participant/participant.service';

/** How close to the top of the list, in pixels, the participant must scroll to ask for earlier messages. */
const EARLIER_MESSAGES_SCROLL_THRESHOLD_PX = 24;

/**
 *
 * The **ChatPanelComponent** is an integral part of the {@link PanelComponent} and serves as the interface for displaying the session chat.
 */
@Component({
	selector: 'ov-chat-panel',
	imports: [FormsModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe, LinkifyPipe],
	templateUrl: './chat-panel.component.html',
	styleUrls: ['../panel.component.scss', './chat-panel.component.scss']
})
export class ChatPanelComponent implements AfterViewInit {
	/**
	 * @ignore
	 */
	readonly chatScroll = viewChild<ElementRef>('chatScroll');
	/**
	 * @ignore
	 */
	readonly chatInput = viewChild<ElementRef>('chatInput');
	/**
	 * @ignore
	 */
	readonly message = signal<string>('');
	/**
	 * @ignore
	 */
	readonly maxMessageLength = MAX_CHAT_MESSAGE_LENGTH;
	/**
	 * @ignore
	 */
	readonly messageList = computed(() => this.chatService.chatMessages());
	/**
	 * Whether the local participant may send messages (gated by the `chatWrite` permission).
	 */
	readonly canWrite = inject(MeetingUiConfigService).chatInputEnabledSignal;

	private readonly chatService = inject(ChatService);
	private readonly panelService = inject(PanelService);
	private readonly e2eeService = inject(E2eeService);
	private readonly participantService = inject(ParticipantService);
	private readonly injector = inject(Injector);
	private lastMessage?: ChatMessage;

	/**
	 * @ignore
	 */
	readonly savesChat = this.chatService.savesChat;
	/**
	 * @ignore
	 */
	readonly isEncrypted = (): boolean => this.e2eeService.isEnabled;

	/**
	 * A message added after the last one shown scrolls to the bottom; one added before it, like a page of
	 * earlier messages, keeps the list where the participant scrolled.
	 */
	private readonly scrollEffect = effect(() => {
		const lastMessage = this.messageList().at(-1);

		untracked(() => {
			const appended = lastMessage !== this.lastMessage;
			this.lastMessage = lastMessage;

			if (!this.panelService.isChatPanelOpened()) return;

			if (appended) {
				this.scrollToBottom();
			} else {
				this.keepScrollPosition();
			}
		});
	});

	/**
	 * @ignore
	 */
	ngAfterViewInit() {
		setTimeout(() => {
			this.scrollToBottom();
			this.chatInput()?.nativeElement.focus();
		}, 100);
	}

	/**
	 * @ignore
	 */
	eventKeyPress(event: KeyboardEvent): void {
		// Pressed 'Enter' key
		if (event && event.key === 'Enter') {
			event.preventDefault();
			this.sendMessage();
		}
	}

	/**
	 * @ignore
	 */
	async sendMessage(): Promise<void> {
		if (!this.canWrite()) return;

		if (this.message()) {
			await this.chatService.sendMessage(this.message());
			this.message.set('');
		}
	}

	/**
	 * @ignore
	 */
	onScroll(): void {
		const chatScroll = this.chatScroll()?.nativeElement;

		if (chatScroll && chatScroll.scrollTop <= EARLIER_MESSAGES_SCROLL_THRESHOLD_PX) {
			void this.chatService.loadEarlier();
		}
	}

	/**
	 * @ignore
	 */
	scrollToBottom(): void {
		const chatScroll = this.chatScroll();

		if (!chatScroll) return;

		setTimeout(() => {
			try {
				chatScroll.nativeElement.scrollTop = chatScroll.nativeElement.scrollHeight;
			} catch {
				// The panel can be torn down before the timeout fires; nothing to scroll then.
			}
		}, 20);
	}

	/**
	 * Keeps the distance to the bottom of the list through the render that follows, which moves the
	 * messages the participant was reading down when earlier ones are added above them, and asks for
	 * earlier messages while the list is too short to scroll.
	 */
	private keepScrollPosition(): void {
		const chatScroll = this.chatScroll()?.nativeElement;

		if (!chatScroll) return;

		const distanceFromBottom = chatScroll.scrollHeight - chatScroll.scrollTop;

		afterNextRender(
			() => {
				chatScroll.scrollTop = chatScroll.scrollHeight - distanceFromBottom;

				if (chatScroll.scrollHeight <= chatScroll.clientHeight) void this.chatService.loadEarlier();
			},
			{ injector: this.injector }
		);
	}

	/**
	 * @ignore
	 */
	close() {
		this.panelService.togglePanel(PanelType.CHAT);
	}

	/**
	 * @ignore
	 */
	hasEncryptionKeyMismatch = computed(() => {
		if (!this.e2eeService.isEnabled) {
			return false;
		}

		return this.participantService.hasRemoteEncryptionErrorsSignal();
	});
}
