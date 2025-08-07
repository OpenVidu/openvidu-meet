import { MeetRoom, MeetRecordingInfo, ParticipantRole } from '@typings-ce';
import { inject, injectable } from 'inversify';
import { SendDataOptions } from 'livekit-server-sdk';
import { OpenViduComponentsAdapterHelper, OpenViduComponentsSignalPayload } from '../helpers/index.js';
import { LiveKitService, LoggerService } from './index.js';
import {
	MeetParticipantRoleUpdatedPayload,
	MeetRoomPreferencesUpdatedPayload,
	MeetSignalPayload,
	MeetSignalType
} from '../typings/ce/event.model.js';

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
	 * Sends a recording signal to OpenVidu Components within a specified room.
	 *
	 * This method constructs a signal with the appropriate topic and payload,
	 * and sends it to the OpenVidu Components in the given room. The payload
	 * is adapted to match the expected format for OpenVidu Components.
	 */
	async sendRecordingSignalToOpenViduComponents(roomId: string, recordingInfo: MeetRecordingInfo) {
		this.logger.debug(`Sending recording signal to OpenVidu Components for room '${roomId}'`);
		const { payload, options } = OpenViduComponentsAdapterHelper.generateRecordingSignal(recordingInfo);

		try {
			await this.sendSignal(roomId, payload, options);
		} catch (error) {
			this.logger.debug(`Error sending recording signal to OpenVidu Components for room '${roomId}': ${error}`);
		}
	}

	/**
	 * Sends a room status signal to OpenVidu Components.
	 *
	 * This method checks if recording is started in the room and sends a signal
	 * with the room status to OpenVidu Components. If recording is not started,
	 * it skips sending the signal.
	 */
	async sendRoomStatusSignalToOpenViduComponents(
		roomId: string,
		participantSid: string,
		recordingInfo: MeetRecordingInfo[]
	) {
		this.logger.debug(`Sending room status signal for room ${roomId} to OpenVidu Components.`);

		try {
			// Construct the payload and signal options
			const { payload, options } = OpenViduComponentsAdapterHelper.generateRoomStatusSignal(
				recordingInfo,
				participantSid
			);

			await this.sendSignal(roomId, payload, options);
		} catch (error) {
			this.logger.debug(`Error sending room status signal for room ${roomId}:`, error);
		}
	}

	/**
	 * Sends a signal to notify participants in a room about updated room preferences.
	 */
	async sendRoomPreferencesUpdatedSignal(roomId: string, updatedRoom: MeetRoom): Promise<void> {
		this.logger.debug(`Sending room preferences updated signal for room ${roomId}`);

		try {
			const payload: MeetRoomPreferencesUpdatedPayload = {
				roomId,
				preferences: updatedRoom.preferences!,
				timestamp: Date.now()
			};

			const options: SendDataOptions = {
				topic: MeetSignalType.MEET_ROOM_PREFERENCES_UPDATED
			};

			await this.sendSignal(roomId, payload, options);
		} catch (error) {
			this.logger.error(`Error sending room preferences updated signal for room ${roomId}:`, error);
		}
	}

	async sendParticipantRoleUpdatedSignal(
		roomId: string,
		participantName: string,
		newRole: ParticipantRole,
		secret: string
	): Promise<void> {
		this.logger.debug(
			`Sending participant role updated signal for participant ${participantName} in room ${roomId}`
		);
		const payload: MeetParticipantRoleUpdatedPayload = {
			participantName,
			roomId,
			newRole,
			secret,
			timestamp: Date.now()
		};

		const options: SendDataOptions = {
			topic: MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED
		};

		await this.sendSignal(roomId, payload, options);
	}

	/**
	 * Generic method to send signals to the frontend
	 */

	protected async sendSignal(
		roomId: string,
		rawData: MeetSignalPayload | OpenViduComponentsSignalPayload,
		options: SendDataOptions
	): Promise<void> {
		this.logger.verbose(`Notifying participants in room ${roomId}: "${options.topic}".`);
		await this.livekitService.sendData(roomId, rawData, options);
	}
}
