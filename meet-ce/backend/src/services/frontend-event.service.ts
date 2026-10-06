import type {
	MeetParticipantMediaMutedPayload,
	MeetParticipantMuteOptions,
	MeetParticipantPermissionsUpdatedPayload,
	MeetRecordingInfo,
	MeetRecordingUpdatedPayload,
	MeetRoom,
	MeetRoomConfigUpdatedPayload,
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
	}

	/**
	 * Sends a signal to notify participants in a room about updated room config.
	 */
	async sendRoomConfigUpdatedSignal(roomId: string, updatedRoom: MeetRoom): Promise<void> {
		this.logger.debug(`Sending room config updated signal for room '${roomId}'`);

		const payload: MeetRoomConfigUpdatedPayload = {
			roomId,
			config: updatedRoom.config,
			timestamp: Date.now()
		};
		const options: SendDataOptions = {
			topic: MeetSignalType.MEET_ROOM_CONFIG_UPDATED
		};

		await this.sendSignal(roomId, payload, options);
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
	 * Sends a signal to the frontend. A signal tells clients about a change the server has already
	 * applied, so a delivery failure is logged and never fails the operation that caused it.
	 */
	protected async sendSignal(roomId: string, rawData: MeetSignalPayload, options: SendDataOptions): Promise<void> {
		this.logger.verbose(`Notifying participants in room ${roomId}: "${options.topic}".`);

		try {
			await this.livekitService.sendData(roomId, rawData, options);
		} catch (error) {
			this.logger.warn(`Error sending signal "${options.topic}" to room '${roomId}'`, error);
		}
	}
}
