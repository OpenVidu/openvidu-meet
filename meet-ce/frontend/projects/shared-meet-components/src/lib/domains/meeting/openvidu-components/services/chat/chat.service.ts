import { inject, Injectable, signal } from '@angular/core';
import { ChatMessage } from '../../models/chat.model';
import { ILogger } from '../../models/logger.model';
import { INotificationOptions } from '../../models/notification-options.model';

import { DataTopic } from '../../models/data-topic.model';
import { PanelType } from '../../models/panel.model';
import { ActionService } from '../action/action.service';
import { LoggerService } from '../logger/logger.service';
import { PanelService } from '../panel/panel.service';
import { ParticipantService } from '../participant/participant.service';
import { TranslateService } from '../translate/translate.service';
import { AssetsService } from '../../../../../shared/services/assets.service';

/**
 * @internal
 */
@Injectable({
	providedIn: 'root'
})
export class ChatService {
	private readonly participantService = inject(ParticipantService);
	private readonly panelService = inject(PanelService);
	private readonly actionService = inject(ActionService);
	private readonly translateService = inject(TranslateService);
	private readonly assets = inject(AssetsService);
	private log: ILogger = inject(LoggerService).get('ChatService');

	chatMessages = signal<ChatMessage[]>([]);
	// Chat notification sound served as a static asset (resolves in SPA & WC modes),
	// matching SoundService instead of inlining the audio as base64.
	private messageSound: HTMLAudioElement = new Audio(this.assets.chatMessageSound);
	private messageList: ChatMessage[] = [];
	constructor() {
		this.messageSound.volume = 0.6;
	}

	/** Adds a new message to the chat from a remote participant
	 * @param message
	 * @param participantName
	 */
	async addRemoteMessage(message: string, participantName: string) {
		this.addMessage(message, false, participantName);
		if (!this.panelService.isChatPanelOpened()) {
			const notificationMessage = this.translateService.translate('PANEL.CHAT.MESSAGE_SENT_NOTIFICATION');
			const action = this.translateService.translate('PANEL.CHAT.OPEN_CHAT');
			const notificationOptions: INotificationOptions = {
				message: `${participantName.toUpperCase()} ${notificationMessage}`,
				buttonActionText: action
			};
			this.launchNotification(notificationOptions);
			this.messageSound.play().catch(() => {});
		}
	}

	/**
	 * Sends a chat message through the data channel.
	 *
	 * @param message The message text to send
	 */
	async sendMessage(message: string) {
		const plainTextMessage = message.replace(/ +(?= )/g, '');
		if (plainTextMessage !== '' && plainTextMessage !== ' ') {
			try {
				// Create message payload
				const payload = JSON.stringify({ message: plainTextMessage });
				const data: Uint8Array = new TextEncoder().encode(payload);

				// Send through data channel
				await this.participantService.publishData(data, { topic: DataTopic.CHAT, reliable: true });

				// Add to local message list
				this.addMessage(plainTextMessage, true, this.participantService.getMyName()!);
			} catch (error) {
				this.log.e('Error sending chat message:', error);
				throw error;
			}
		}
	}

	private addMessage(message: string, isLocal: boolean, participantName: string) {
		this.messageList.push({
			isLocal,
			participantName,
			message
		});
		this.chatMessages.set([...this.messageList]);
	}

	private launchNotification(options: INotificationOptions) {
		this.actionService.launchNotification(
			options,
			this.panelService.togglePanel.bind(this.panelService, PanelType.CHAT)
		);
	}
}
