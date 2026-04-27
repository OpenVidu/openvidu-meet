import type {
	MeetParticipantPermissionsUpdatedPayload,
	MeetParticipantRoleUpdatedPayload,
	MeetRecordingInfo,
	MeetRoom,
	MeetRoomConfigUpdatedPayload,
	MeetRoomMemberUIBadge,
	MeetSignalPayload
} from '@openvidu-meet/typings';
import { MeetSignalType } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { SendDataOptions } from 'livekit-server-sdk';
import { OpenViduComponentsAdapterHelper } from '../helpers/ov-components-adapter.helper.js';
import type { OpenViduComponentsSignalPayload } from '../models/ov-components-signal.model.js';
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
	 * Sends a meeting status signal to OpenVidu Components.
	 *
	 * This method checks if recording is started in the room and sends a signal
	 * with the room status to OpenVidu Components. If recording is not started,
	 * it skips sending the signal.
	 */
	async sendMeetingStatusSignalToOpenViduComponents(
		roomId: string,
		participantSid: string,
		recordingInfo: MeetRecordingInfo[]
	) {
		this.logger.debug(`Sending room status signal for room ${roomId} to OpenVidu Components.`);

		try {
			// Construct the payload and signal options
			const status = OpenViduComponentsAdapterHelper.generateMeetingStatusSignal(recordingInfo, participantSid);

			if (!status) return;

			await this.sendSignal(roomId, status.payload, status.options);
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
