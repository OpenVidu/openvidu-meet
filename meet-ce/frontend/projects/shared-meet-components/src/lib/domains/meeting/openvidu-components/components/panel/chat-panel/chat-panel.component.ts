import { CommonModule } from '@angular/common';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	ElementRef,
	inject,
	signal,
	viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PanelType } from '../../../models/panel.model';
import { LinkifyPipe } from '../../../pipes/linkify.pipe';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { ChatService } from '../../../services/chat/chat.service';
import { E2eeService } from '../../../services/e2ee/e2ee.service';
import { PanelService } from '../../../services/panel/panel.service';
import { ParticipantService } from '../../../services/participant/participant.service';

/**
 *
 * The **ChatPanelComponent** is an integral part of the {@link PanelComponent} and serves as the interface for displaying the session chat.
 */
@Component({
	selector: 'ov-chat-panel',
	imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe, LinkifyPipe],
	templateUrl: './chat-panel.component.html',
	styleUrls: ['../panel.component.scss', './chat-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
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
	readonly messageList = computed(() => this.chatService.chatMessages());

	private readonly chatService = inject(ChatService);
	private readonly panelService = inject(PanelService);
	private readonly e2eeService = inject(E2eeService);
	private readonly participantService = inject(ParticipantService);

	private readonly scrollEffect = effect(() => {
		if (this.panelService.isChatPanelOpened()) {
			this.scrollToBottom();
		}
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
		if (!!this.message()) {
			await this.chatService.sendMessage(this.message());
			this.message.set('');
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
			} catch (err) {}
		}, 20);
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
