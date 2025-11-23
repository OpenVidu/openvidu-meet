import {
	MeetParticipantRoleUpdatedPayload,
	MeetRecordingInfo,
	MeetRoom,
	MeetRoomConfigUpdatedPayload,
	MeetRoomMemberRole,
	MeetSignalPayload,
	MeetSignalType
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { SendDataOptions } from 'livekit-server-sdk';
import { OpenViduComponentsAdapterHelper } from '../helpers/ov-components-adapter.helper.js';
import { OpenViduComponentsSignalPayload } from '../models/ov-components-signal.model.js';
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
	 * Sends a signal to notify participants in a room about updated room config.
	 */
	async sendRoomConfigUpdatedSignal(roomId: string, updatedRoom: MeetRoom): Promise<void> {
		this.logger.debug(`Sending room config updated signal for room ${roomId}`);

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
			this.logger.error(`Error sending room config updated signal for room ${roomId}:`, error);
		}
	}

	/**
	 * Sends a signal to notify participants in a room about updated participant roles.
	 */
	async sendParticipantRoleUpdatedSignal(
		roomId: string,
		participantIdentity: string,
		newRole: MeetRoomMemberRole,
		secret: string
	): Promise<void> {
		this.logger.debug(
			`Sending participant role updated signal for participant '${participantIdentity}' in room '${roomId}'`
		);

		const basePayload: MeetParticipantRoleUpdatedPayload = {
			roomId,
			participantIdentity,
			newRole,
			timestamp: Date.now()
		};

		const baseOptions: SendDataOptions = {
			topic: MeetSignalType.MEET_PARTICIPANT_ROLE_UPDATED
		};

		// Send signal with secret to the participant whose role has been updated
		await this.sendSignal(
			roomId,
			{ ...basePayload, secret },
			{ ...baseOptions, destinationIdentities: [participantIdentity] }
		);

		// Broadcast the role update to all other participants without the secret
		const participants = await this.livekitService.listRoomParticipants(roomId);
		const otherParticipantIdentities = participants
			.filter((p) => p.identity !== participantIdentity)
			.map((p) => p.identity);

		await this.sendSignal(roomId, basePayload, {
			...baseOptions,
			destinationIdentities: otherParticipantIdentities
		});
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
