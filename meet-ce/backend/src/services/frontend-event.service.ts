import type {
	MeetMeetingEndedByModeratorPayload,
	MeetMeetingEndingSoonPayload,
	MeetParticipantMediaMutedPayload,
	MeetParticipantMuteOptions,
	MeetParticipantPermissionsUpdatedPayload,
	MeetParticipantRoleUpdatedPayload,
	MeetRecordingInfo,
	MeetRecordingUpdatedPayload,
	MeetRoom,
	MeetRoomConfigUpdatedPayload,
	MeetRoomMemberUIBadge,
	MeetSignalPayload
} from '@openvidu-meet/typings';
import { MeetSignalType } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { SendDataOptions } from 'livekit-server-sdk';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';

/**
 * Service responsible for all communication with the frontend
 * Centralizes all signals and events sent to the frontend
 */
@injectable()
export class FrontendEventService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(LiveKitService) protected livekitService: LiveKitService
	) {}

	/**
	 * Sends a signal to notify participants about the latest recording state in a room.
	 */
	async sendRecordingUpdatedSignal(
		roomId: string,
		recordingInfo: MeetRecordingInfo,
		participantSid?: string
	): Promise<void> {
		this.logger.debug(`Sending recording updated signal for room '${roomId}'`);

		try {
			const payload: MeetRecordingUpdatedPayload = {
				roomId,
				recording: recordingInfo,
				timestamp: Date.now()
			};

			const options: SendDataOptions = {
				topic: MeetSignalType.MEET_RECORDING_UPDATED,
				...(participantSid ? { destinationSids: [participantSid] } : {})
			};

			await this.sendSignal(roomId, payload, options);
		} catch (error) {
			this.logger.warn(`Error sending recording updated signal for room '${roomId}'`, error);
		}
	}

	/**
	 * Sends a signal to notify participants in a room about updated room config.
	 */
	async sendRoomConfigUpdatedSignal(roomId: string, updatedRoom: MeetRoom): Promise<void> {
		this.logger.debug(`Sending room config updated signal for room '${roomId}'`);

		try {
			const payload: MeetRoomConfigUpdatedPayload = {
				roomId,
				config: updatedRoom.config,
				timestamp: Date.now()
			};

			const options: SendDataOptions = {
				topic: MeetSignalType.MEET_ROOM_CONFIG_UPDATED
			};

			await this.sendSignal(roomId, payload, options);
		} catch (error) {
			this.logger.warn(`Error sending room config updated signal for room '${roomId}'`, error);
		}
	}

	/**
	 * Sends a signal to notify a participant that their role has been updated, including the new badge they received.
	 */
	async sendParticipantRoleUpdatedSignal(
		roomId: string,
		participantIdentity: string,
		newBadge: MeetRoomMemberUIBadge
	): Promise<void> {
		this.logger.debug(
			`Sending participant role updated signal for participant '${participantIdentity}' in room '${roomId}'`
		);

		const signalPayload: MeetParticipantRoleUpdatedPayload = {
			roomId,
			participantIdentity,
			newBadge,
			timestamp: Date.now()
		};
		const signalOptions: SendDataOptions = {
			topic: MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED,
			destinationIdentities: [participantIdentity]
		};

		await this.sendSignal(roomId, signalPayload, signalOptions);
	}

	/**
	 * Sends a signal to notify a participant that their permissions changed and
	 * they must regenerate their room member token.
	 */
	async sendParticipantPermissionsUpdatedSignal(roomId: string, participantIdentity: string): Promise<void> {
		this.logger.debug(
			`Sending participant permissions updated signal for participant '${participantIdentity}' in room '${roomId}'`
		);

		const signalPayload: MeetParticipantPermissionsUpdatedPayload = {
			roomId,
			participantIdentity,
			timestamp: Date.now()
		};
		const signalOptions: SendDataOptions = {
			topic: MeetSignalType.MEET_PARTICIPANT_PERMISSIONS_UPDATED,
			destinationIdentities: [participantIdentity]
		};

		await this.sendSignal(roomId, signalPayload, signalOptions);
	}

	/**
	 * Sends a signal telling the given participants which of their devices a moderator just turned
	 * off, so their clients can attribute the change and stop reopening a device the moderator closed.
	 *
	 * One signal carries every recipient: they were all told the same thing, and the destinations are
	 * what scopes it to them.
	 */
	async sendParticipantMediaMutedSignal(
		roomId: string,
		participantIdentities: string[],
		media: MeetParticipantMuteOptions
	): Promise<void> {
		this.logger.debug(
			`Sending participant media muted signal to ${participantIdentities.length} participant(s) in room '${roomId}'`
		);

		const signalPayload: MeetParticipantMediaMutedPayload = {
			roomId,
			media,
			timestamp: Date.now()
		};
		const signalOptions: SendDataOptions = {
			topic: MeetSignalType.MEET_PARTICIPANT_MEDIA_MUTED,
			destinationIdentities: participantIdentities
		};

		await this.sendSignal(roomId, signalPayload, signalOptions);
	}

	/**
	 * Sends a signal warning every participant in a room that the meeting is about to reach its
	 * duration limit and will be force-ended. Errors are the caller's to handle: the max-duration
	 * sweep only marks the warning as sent after this resolves, so a failed send is retried.
	 */
	async sendMeetingEndingSoonSignal(roomId: string, remainingMinutes: number): Promise<void> {
		this.logger.debug(`Sending meeting ending soon signal for room '${roomId}'`);

		const payload: MeetMeetingEndingSoonPayload = {
			roomId,
			remainingMinutes,
			timestamp: Date.now()
		};

		const options: SendDataOptions = {
			topic: MeetSignalType.MEET_MEETING_ENDING_SOON
		};

		await this.sendSignal(roomId, payload, options);
	}

	/**
	 * Sends a signal telling every participant that a moderator's own request to end the meeting
	 * was just validated, moments before the room actually closes. The caller must send this before
	 * deleting the room — the room has to still exist for the data channel broadcast to reach anyone.
	 * Lets a client that locally attributed an earlier ending-soon warning to the duration limit
	 * correct itself before it sees the room disconnect.
	 */
	async sendMeetingEndedByModeratorSignal(roomId: string): Promise<void> {
		this.logger.debug(`Sending meeting ended by moderator signal for room '${roomId}'`);

		const payload: MeetMeetingEndedByModeratorPayload = {
			roomId,
			timestamp: Date.now()
		};

		const options: SendDataOptions = {
			topic: MeetSignalType.MEET_MEETING_ENDED_BY_MODERATOR
		};

		await this.sendSignal(roomId, payload, options);
	}

	/**
	 * Generic method to send signals to the frontend
	 */

	protected async sendSignal(roomId: string, rawData: MeetSignalPayload, options: SendDataOptions): Promise<void> {
		this.logger.verbose(`Notifying participants in room ${roomId}: "${options.topic}".`);
		await this.livekitService.sendData(roomId, rawData, options);
	}
}
