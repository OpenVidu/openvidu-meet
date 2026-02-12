import { effect, inject, Injectable } from '@angular/core';
import {
	WebComponentCommand,
	WebComponentEvent,
	WebComponentInboundCommandMessage,
	WebComponentOutboundEventMessage
} from '@openvidu-meet/typings';
import { LoggerService, OpenViduService } from 'openvidu-components-angular';
import { AppContextService } from '../../../shared/services/app-context.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { MeetingContextService } from './meeting-context.service';
import { MeetingService } from './meeting.service';

/**
 * Service to manage the commands from OpenVidu Meet WebComponent/Iframe.
 * This service listens for messages from the iframe and processes them.
 * It also sends messages to the iframe.
 */
@Injectable({
	providedIn: 'root'
})
export class MeetingWebComponentManagerService {
	protected meetingService = inject(MeetingService);
	protected meetingContextService = inject(MeetingContextService);
	protected roomMemberContextService = inject(RoomMemberContextService);
	protected appCtxService = inject(AppContextService);
	protected openviduService = inject(OpenViduService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - WebComponentManagerService');

	protected isInitialized = false;
	protected parentDomain: string = '';
	protected boundHandleMessage: (event: MessageEvent) => Promise<void>;

	constructor() {
		this.boundHandleMessage = this.handleMessage.bind(this);
		effect(() => {
			if (this.appCtxService.isEmbeddedMode()) {
				this.initialize();
			}
		});
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

		// If parent domain is not set, only accept INITIALIZE command to set the parent domain
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

		// For security, only accept messages from the parent domain
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
				// Only participants with canEndMeeting permission can end the meeting
				if (!this.roomMemberContextService.hasPermission('canEndMeeting')) {
					this.log.w(
						'End meeting command received but participant does not have permissions to end the meeting'
					);
					return;
				}

				try {
					this.log.d('Ending meeting...');
					const roomId = this.meetingContextService.roomId();
					if (!roomId) throw new Error('Room ID is undefined while trying to end meeting');
					await this.meetingService.endMeeting(roomId);
				} catch (error) {
					this.log.e('Error ending meeting:', error);
				}

				break;
			case WebComponentCommand.LEAVE_ROOM:
				await this.openviduService.disconnectRoom();
				break;
			case WebComponentCommand.KICK_PARTICIPANT:
				// Only participants with canKickParticipants permission can kick participants
				if (!this.roomMemberContextService.hasPermission('canKickParticipants')) {
					this.log.w(
						'Kick participant command received but participant does not have permissions to kick participants'
					);
					return;
				}

				if (!payload || !('participantIdentity' in payload)) {
					this.log.e('Kick participant command received without participant identity');
					return;
				}

				const participantIdentity = payload['participantIdentity'];

				try {
					this.log.d(`Kicking participant '${participantIdentity}' from the meeting...`);
					const roomId = this.meetingContextService.roomId();
					if (!roomId) throw new Error('Room ID is undefined while trying to kick participant');
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
