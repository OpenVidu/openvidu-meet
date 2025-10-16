import { Injectable } from '@angular/core';
import { MeetingService, ParticipantService, RoomService } from '@openvidu-meet/shared/services';
import {
	WebComponentCommand,
	WebComponentEvent,
	WebComponentInboundCommandMessage,
	WebComponentOutboundEventMessage
} from '@openvidu-meet/typings';
import { LoggerService, OpenViduService } from 'openvidu-components-angular';

/**
 * Service to manage the commands from OpenVidu Meet WebComponent/Iframe.
 * This service listens for messages from the iframe and processes them.
 * It also sends messages to the iframe.
 */
@Injectable({
	providedIn: 'root'
})
export class WebComponentManagerService {
	protected isInitialized = false;

	protected parentDomain: string = '';
	protected boundHandleMessage: (event: MessageEvent) => Promise<void>;

	protected log;

	constructor(
		protected loggerService: LoggerService,
		protected participantService: ParticipantService,
		protected openviduService: OpenViduService,
		protected roomService: RoomService,
		protected meetingService: MeetingService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - WebComponentManagerService');
		this.boundHandleMessage = this.handleMessage.bind(this);
	}

	initialize() {
		if (this.isInitialized) return;

		this.log.d('Initializing service...');
		this.isInitialized = true;
		this.startCommandsListener();

		// Send READY event to parent
		this.sendMessageToParent(
			{
				event: WebComponentEvent.READY,
				payload: {}
			},
			'*'
		);
	}

	close() {
		if (!this.isInitialized) return;

		this.log.d('Closing service...');
		this.stopCommandsListener();

		// Send CLOSED event to parent
		this.sendMessageToParent({
			event: WebComponentEvent.CLOSED,
			payload: {}
		});
		this.isInitialized = false;
	}

	protected startCommandsListener() {
		// Listen for messages from the iframe
		window.addEventListener('message', this.boundHandleMessage);
		this.log.d('Started commands listener');
	}

	protected stopCommandsListener() {
		window.removeEventListener('message', this.boundHandleMessage);
		this.log.d('Stopped commands listener');
	}

	sendMessageToParent(event: WebComponentOutboundEventMessage, targetOrigin: string = this.parentDomain) {
		if (!this.isInitialized) return;

		this.log.d('Sending message to parent:', event);
		window.parent.postMessage(event, targetOrigin);
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
			console.warn(`Untrusted origin: ${event.origin}`);
			return;
		}

		// Check if participant is connected to room before processing command
		if (!this.openviduService.isRoomConnected()) {
			this.log.w('Received command but participant is not connected to the room');
			return;
		}

		console.debug('Message received from parent:', event.data);
		switch (command) {
			case WebComponentCommand.END_MEETING:
				// Only moderators can end the meeting
				if (!this.participantService.isModeratorParticipant()) {
					this.log.w('End meeting command received but participant is not a moderator');
					return;
				}

				try {
					this.log.d('Ending meeting...');
					const roomId = this.roomService.getRoomId();
					await this.meetingService.endMeeting(roomId);
				} catch (error) {
					this.log.e('Error ending meeting:', error);
				}

				break;
			case WebComponentCommand.LEAVE_ROOM:
				await this.openviduService.disconnectRoom();
				break;
			case WebComponentCommand.KICK_PARTICIPANT:
				// Only moderators can kick participants
				if (!this.participantService.isModeratorParticipant()) {
					this.log.w('Kick participant command received but participant is not a moderator');
					return;
				}

				if (!payload || !('participantIdentity' in payload)) {
					this.log.e('Kick participant command received without participant identity');
					return;
				}

				const participantIdentity = payload['participantIdentity'];

				try {
					this.log.d(`Kicking participant '${participantIdentity}' from the meeting...`);
					const roomId = this.roomService.getRoomId();
					await this.meetingService.kickParticipant(roomId, participantIdentity);
				} catch (error) {
					this.log.e(`Error kicking participant '${participantIdentity}':`, error);
				}

				break;
			default:
				break;
		}
	}
}
