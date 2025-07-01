import { Injectable } from '@angular/core';
import { AppDataService, ParticipantTokenService, RoomService } from '@lib/services';
import {
	WebComponentCommand,
	WebComponentEvent,
	WebComponentInboundCommandMessage,
	WebComponentOutboundEventMessage
} from '@lib/typings/ce';
import { LoggerService, OpenViduService, PanelService } from 'openvidu-components-angular';

/**
 * Service to manage the commands from OpenVidu Meet WebComponent/Iframe.
 * This service listens for messages from the iframe and processes them.
 * It also sends messages to the iframe.
 */
@Injectable({
	providedIn: 'root'
})
export class WebComponentManagerService {
	protected parentDomain: string = '';
	protected isListenerStarted = false;
	protected boundHandleMessage: (event: MessageEvent) => Promise<void>;
	protected log;

	constructor(
		protected loggerService: LoggerService,
		protected appDataService: AppDataService,
		protected participantService: ParticipantTokenService,
		protected panelService: PanelService,
		protected openviduService: OpenViduService,
		protected roomService: RoomService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - WebComponentManagerService');
		this.boundHandleMessage = this.handleMessage.bind(this);
	}

	startCommandsListener(): void {
		if (this.isListenerStarted) return;

		this.isListenerStarted = true;
		// Listen for messages from the iframe
		window.addEventListener('message', this.boundHandleMessage);
		// Send ready message to parent
		window.parent.postMessage(
			{
				event: WebComponentEvent.READY,
				payload: {}
			},
			'*'
		);
		this.log.d('Started commands listener');
	}

	stopCommandsListener(): void {
		if (!this.isListenerStarted) return;
		this.isListenerStarted = false;
		window.removeEventListener('message', this.boundHandleMessage);
		this.log.d('Stopped commands listener');
	}

	sendMessageToParent(event: WebComponentOutboundEventMessage) {
		if (!this.appDataService.isEmbeddedMode()) return;
		this.log.d('Sending message to parent :', event);
		window.parent.postMessage(event, this.parentDomain);
	}

	protected async handleMessage(event: MessageEvent): Promise<void> {
		const message: WebComponentInboundCommandMessage = event.data;
		const { command, payload } = message;

		if (!this.parentDomain) {
			if (command === WebComponentCommand.INITIALIZE) {
				if (!payload || !('domain' in payload)) {
					console.error('Parent domain not provided in message payload');
					return;
				}
				this.log.d(`Parent domain set: ${event.origin}`);
				this.parentDomain = payload['domain'];
			}
			return;
		}

		if (event.origin !== this.parentDomain) {
			// console.warn(`Untrusted origin: ${event.origin}`);
			return;
		}

		console.debug('Message received from parent:', event.data);
		// TODO: reject if room is not connected
		switch (command) {
			case WebComponentCommand.END_MEETING:
				// Moderator only
				if (this.participantService.isModeratorParticipant()) {
					const roomId = this.roomService.getRoomId();
					await this.roomService.endMeeting(roomId);
				}
				break;
			// case WebComponentCommand.TOGGLE_CHAT:
			// Toggle chat
			// this.panelService.togglePanel(PanelType.CHAT);
			// break;
			case WebComponentCommand.LEAVE_ROOM:
				// Leave room.
				await this.openviduService.disconnectRoom();
				break;
			default:
				break;
		}
	}
}
