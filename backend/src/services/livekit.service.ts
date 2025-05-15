import { inject, injectable } from 'inversify';
import {
	CreateOptions,
	DataPacket_Kind,
	EgressClient,
	EgressInfo,
	EgressStatus,
	EncodedFileOutput,
	ListEgressOptions,
	ParticipantInfo,
	Room,
	RoomCompositeOptions,
	RoomServiceClient,
	SendDataOptions,
	StreamOutput
} from 'livekit-server-sdk';
import { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL_PRIVATE } from '../environment.js';
import { RecordingHelper } from '../helpers/index.js';
import {
	errorLivekitNotAvailable,
	errorParticipantNotFound,
	errorRoomNotFound,
	internalError,
	OpenViduMeetError
} from '../models/error.model.js';
import { LoggerService } from './index.js';

@injectable()
export class LiveKitService {
	private egressClient: EgressClient;
	private roomClient: RoomServiceClient;

	constructor(@inject(LoggerService) protected logger: LoggerService) {
		const livekitUrlHostname = LIVEKIT_URL_PRIVATE.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
		this.egressClient = new EgressClient(livekitUrlHostname, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
		this.roomClient = new RoomServiceClient(livekitUrlHostname, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
	}

	async createRoom(options: CreateOptions): Promise<Room> {
		try {
			return await this.roomClient.createRoom(options);
		} catch (error) {
			this.logger.error('Error creating LiveKit room:', error);
			throw internalError('creating LiveKit room');
		}
	}

	/**
	 * Checks if a room with the specified name exists in LiveKit.
	 *
	 * @param roomName - The name of the room to check
	 * @returns A Promise that resolves to true if the room exists, false otherwise
	 * @throws Will rethrow service availability or other unexpected errors
	 */
	async roomExists(roomName: string): Promise<boolean> {
		try {
			await this.getRoom(roomName);
			return true;
		} catch (error) {
			if (error instanceof OpenViduMeetError && error.statusCode === 404) {
				return false;
			}

			// Rethrow other errors as they indicate we couldn't determine if the room exists
			this.logger.error(`Error checking if room ${roomName} exists:`, error);
			throw error;
		}
	}

	/**
	 * Checks if a LiveKit room has at least one participant.
	 *
	 * @param roomName - The name of the room to check
	 * @returns A promise that resolves to true if the room has at least one participant,
	 *          or false if the room has no participants or if an error occurs
	 */
	async roomHasParticipants(roomName: string): Promise<boolean> {
		try {
			const participants = await this.roomClient.listParticipants(roomName);
			return participants.length > 0;
		} catch (error) {
			return false;
		}
	}

	async getRoom(roomName: string): Promise<Room> {
		let rooms: Room[] = [];

		try {
			rooms = await this.roomClient.listRooms([roomName]);
		} catch (error) {
			this.logger.error(`Error getting room: ${error}`);
			throw internalError(`getting LiveKit room '${roomName}'`);
		}

		if (rooms.length === 0) {
			throw errorRoomNotFound(roomName);
		}

		return rooms[0];
	}

	/**
	 * Retrieves the metadata associated with a LiveKit room.
	 *
	 * @param roomName - The name of the room to get metadata from
	 * @returns The room's metadata as a string if it exists, or undefined if the room has no metadata or an error occurs
	 */
	async getRoomMetadata(roomName: string): Promise<string | undefined> {
		try {
			const room = await this.getRoom(roomName);

			if (room.metadata) {
				return room.metadata;
			}

			return undefined;
		} catch (error) {
			return undefined;
		}
	}

	async listRooms(): Promise<Room[]> {
		try {
			return await this.roomClient.listRooms();
		} catch (error) {
			this.logger.error(`Error getting LiveKit rooms: ${error}`);
			throw internalError('getting LiveKit rooms');
		}
	}

	async deleteRoom(roomName: string): Promise<void> {
		try {
			try {
				await this.getRoom(roomName);
			} catch (error) {
				this.logger.warn(`Livekit Room ${roomName} not found. Skipping deletion.`);
				return Promise.resolve();
			}

			await this.roomClient.deleteRoom(roomName);
		} catch (error) {
			this.logger.error(`Error deleting LiveKit room: ${error}`);
			throw internalError(`deleting LiveKit room '${roomName}'`);
		}
	}

	/**
	 * Retrieves information about a specific participant in a LiveKit room.
	 *
	 * @param roomName - The name of the room where the participant is located
	 * @param participantName - The name of the participant to retrieve
	 * @returns A Promise that resolves to the participant's information
	 * @throws An internal error if the participant cannot be found or another error occurs
	 */
	async getParticipant(roomName: string, participantName: string): Promise<ParticipantInfo> {
		try {
			return await this.roomClient.getParticipant(roomName, participantName);
		} catch (error) {
			this.logger.warn(`Participant ${participantName} not found in room ${roomName}: ${error}`);
			throw errorParticipantNotFound(participantName, roomName);
		}
	}

	async deleteParticipant(participantName: string, roomName: string): Promise<void> {
		const participantExists = await this.participantExists(roomName, participantName);

		if (!participantExists) {
			throw errorParticipantNotFound(participantName, roomName);
		}

		await this.roomClient.removeParticipant(roomName, participantName);
	}

	async sendData(roomName: string, rawData: Record<string, any>, options: SendDataOptions): Promise<void> {
		try {
			const data: Uint8Array = new TextEncoder().encode(JSON.stringify(rawData));
			await this.roomClient.sendData(roomName, data, DataPacket_Kind.RELIABLE, options);
		} catch (error) {
			this.logger.error(`Error sending data: ${error}`);
			throw internalError(`sending data to LiveKit room '${roomName}'`);
		}
	}

	async startRoomComposite(
		roomName: string,
		output: EncodedFileOutput | StreamOutput,
		options: RoomCompositeOptions
	): Promise<EgressInfo> {
		try {
			return await this.egressClient.startRoomCompositeEgress(roomName, output, options);
		} catch (error: any) {
			this.logger.error('Error starting Room Composite Egress:', error);
			throw internalError(`starting Room Composite Egress for room '${roomName}'`);
		}
	}

	async stopEgress(egressId: string): Promise<EgressInfo> {
		try {
			this.logger.info(`Stopping ${egressId} egress`);
			return await this.egressClient.stopEgress(egressId);
		} catch (error: any) {
			this.logger.error(`Error stopping egress: ${JSON.stringify(error)}`);
			throw internalError(`stopping egress '${egressId}'`);
		}
	}

	/**
	 * Retrieves a list of egress information based on the provided options.
	 *
	 * @param {ListEgressOptions} options - The options to filter the egress list.
	 * @returns {Promise<EgressInfo[]>} A promise that resolves to an array of EgressInfo objects.
	 * @throws Will throw an error if there is an issue retrieving the egress information.
	 */
	async getEgress(roomName?: string, egressId?: string, active?: boolean): Promise<EgressInfo[]> {
		try {
			const options: ListEgressOptions = {
				roomName,
				egressId,
				active
			};
			return await this.egressClient.listEgress(options);
		} catch (error: any) {
			if (error.message.includes('404')) {
				return [];
			}

			this.logger.error(`Error getting egress: ${JSON.stringify(error)}`);
			throw internalError(`getting egress '${egressId}'`);
		}
	}

	/**
	 * Retrieves a list of active egress information based on the provided egress ID.
	 *
	 * @param egressId - The unique identifier of the egress to retrieve.
	 * @returns A promise that resolves to an array of `EgressInfo` objects representing the active egress.
	 * @throws Will throw an error if there is an issue retrieving the egress information.
	 */
	async getActiveEgress(roomName?: string, egressId?: string): Promise<EgressInfo[]> {
		const egress = await this.getEgress(roomName, egressId, true);

		// In some cases, the egress list may contain egress that their status is ENDINDG
		// which means that the egress is still active but it is in the process of stopping.
		// We need to filter those out.
		return egress.filter((e) => e.status === EgressStatus.EGRESS_ACTIVE);
	}

	/**
	 * Retrieves all recording egress sessions for a specific room or all rooms.
	 *
	 * @param {string} [roomName] - Optional room name to filter recordings by room
	 * @returns {Promise<EgressInfo[]>} A promise that resolves to an array of recording EgressInfo objects
	 * @throws Will throw an error if there is an issue retrieving the egress information
	 */
	async getRecordingsEgress(roomName?: string): Promise<EgressInfo[]> {
		const egressArray = await this.getEgress(roomName);

		if (egressArray.length === 0) {
			return [];
		}

		// Filter the egress array to include only recording egress
		return egressArray.filter((egress) => RecordingHelper.isRecordingEgress(egress));
	}

	/**
	 * Retrieves all active recording egress sessions for a specific room or all rooms.
	 *
	 * @param {string} [roomName] - Optional room name to filter recordings by room
	 * @returns {Promise<EgressInfo[]>} A promise that resolves to an array of active recording EgressInfo objects
	 * @throws Will throw an error if there is an issue retrieving the egress information
	 */
	async getActiveRecordingsEgress(roomName?: string): Promise<EgressInfo[]> {
		// Get all recording egress
		const recordingEgress = await this.getRecordingsEgress(roomName);

		if (recordingEgress.length === 0) {
			return [];
		}

		// Filter the recording egress array to include only active egress
		return recordingEgress.filter((egress) => egress.status === EgressStatus.EGRESS_ACTIVE);
	}

	/**
	 * Retrieves all in-progress recording egress sessions for a specific room or all rooms.
	 *
	 * This method checks it is in any "in-progress" state, including EGRESS_STARTING, EGRESS_ACTIVE, and EGRESS_ENDING.
	 *
	 * @param {string} [roomName] - Optional room name to filter recordings by room
	 * @returns {Promise<EgressInfo[]>} A promise that resolves to an array of in-progress recording EgressInfo objects
	 * @throws Will throw an error if there is an issue retrieving the egress information
	 */
	async getInProgressRecordingsEgress(roomName?: string): Promise<EgressInfo[]> {
		try {
			const egressArray = await this.getEgress(roomName);
			return egressArray.filter((egress) => {
				if (!RecordingHelper.isRecordingEgress(egress)) {
					return false;
				}

				// Check if recording is in any "in-progress" state
				return [EgressStatus.EGRESS_STARTING, EgressStatus.EGRESS_ACTIVE, EgressStatus.EGRESS_ENDING].includes(
					egress.status
				);
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`Error getting in-progress recordings: ${errorMessage}`);
			throw internalError(`getting in-progress egress for room '${roomName}'`);
		}
	}

	isEgressParticipant(participant: ParticipantInfo): boolean {
		// TODO: Remove deprecated warning by using ParticipantInfo_Kind: participant.kind === ParticipantInfo_Kind.EGRESS;
		return participant.identity.startsWith('EG_') && participant.permission?.recorder === true;
	}

	private async participantExists(roomName: string, participantName: string): Promise<boolean> {
		try {
			const participants: ParticipantInfo[] = await this.roomClient.listParticipants(roomName);
			return participants.some((participant) => participant.identity === participantName);
		} catch (error: any) {
			this.logger.error(error);

			if (error?.cause?.code === 'ECONNREFUSED') {
				throw errorLivekitNotAvailable();
			}

			return false;
		}
	}
}
