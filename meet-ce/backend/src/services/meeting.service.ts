import type { MeetMeetingInfo, MeetParticipantInfo } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { ParticipantInfo, Room } from 'livekit-server-sdk';
import { MeetParticipantHelper } from '../helpers/participant.helper.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { errorNoActiveMeeting, errorParticipantNotFound, OpenViduMeetError } from '../models/error.model.js';
import { LiveKitService } from './livekit.service.js';
import { RoomService } from './room.service.js';

/**
 * Exposes the live state of the meeting running in a room: the introspection surface of the
 * `meeting`/`participant` modules (`GET /meetings/{roomId}` and its participants sub-resource).
 *
 * A meeting exists exactly as long as its LiveKit room does, so every method translates the room's
 * absence into a meeting-scoped 404.
 */
@injectable()
export class MeetingService {
	constructor(
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(RoomService) protected roomService: RoomService
	) {}

	/**
	 * Returns the live info of the meeting currently running in a room.
	 *
	 * @param roomId - The ID of the room
	 * @throws A 404 error when the room has no active meeting
	 */
	async getMeetingInfo(roomId: string): Promise<MeetMeetingInfo> {
		// The room's own `numParticipants`/`activeRecording` counters are not used on purpose:
		// the former counts non-hidden participants (not Meet's kind-STANDARD filter, so it could
		// diverge from the /participants listing) and the latter flips for ANY egress on the room,
		// not just Meet recordings.
		const [room, [participants, activeRecordings]] = await this.withActiveMeetingRoom(
			roomId,
			Promise.all([
				this.getStandardParticipants(roomId),
				this.livekitService.getInProgressRecordingsEgress(roomId)
			])
		);

		return {
			roomId,
			roomName: await this.resolveRoomName(room),
			startDate: Number(room.creationTime) * 1000,
			participantCount: participants.length,
			recordingActive: activeRecordings.length > 0
		};
	}

	/**
	 * Lists the participants currently in the meeting of a room, as live API-facing snapshots.
	 *
	 * @param roomId - The ID of the room
	 * @throws A 404 error when the room has no active meeting
	 */
	async getParticipants(roomId: string): Promise<MeetParticipantInfo[]> {
		const [, participants] = await this.withActiveMeetingRoom(roomId, this.getStandardParticipants(roomId));
		return participants.map((participant) => MeetParticipantHelper.toParticipantInfo(participant));
	}

	/**
	 * Returns the live snapshot of one participant in the meeting of a room.
	 *
	 * @param roomId - The ID of the room
	 * @param participantIdentity - The identity of the participant
	 * @throws A 404 error when the participant is not in the meeting (or no meeting is active)
	 */
	async getParticipant(roomId: string, participantIdentity: string): Promise<MeetParticipantInfo> {
		const participant = await this.livekitService.getParticipant(roomId, participantIdentity);

		// Hide LiveKit's internal participants (egress, agents) from the API surface.
		if (!this.livekitService.isStandardParticipant(participant)) {
			throw errorParticipantNotFound(participantIdentity, roomId);
		}

		return MeetParticipantHelper.toParticipantInfo(participant);
	}

	/**
	 * Runs a LiveKit read concurrently with the active-meeting room lookup instead of behind it.
	 * The room lookup stays the error authority: when the room is gone, its meeting-scoped 404
	 * wins over whatever error the sibling read produces for a vanished room.
	 */
	protected async withActiveMeetingRoom<T>(roomId: string, read: Promise<T>): Promise<[Room, T]> {
		const [roomResult, readResult] = await Promise.allSettled([this.getActiveMeetingRoom(roomId), read]);

		if (roomResult.status === 'rejected') {
			throw roomResult.reason;
		}

		if (readResult.status === 'rejected') {
			throw readResult.reason;
		}

		return [roomResult.value, readResult.value];
	}

	/**
	 * The LiveKit room backing the active meeting, translating its absence into the meeting-scoped
	 * 404 (the room-scoped one is the route middleware's job).
	 */
	protected async getActiveMeetingRoom(roomId: string): Promise<Room> {
		try {
			return await this.livekitService.getRoom(roomId);
		} catch (error) {
			if (error instanceof OpenViduMeetError && error.statusCode === 404) {
				throw errorNoActiveMeeting(roomId);
			}

			throw error;
		}
	}

	protected async getStandardParticipants(roomId: string): Promise<ParticipantInfo[]> {
		const participants = await this.livekitService.listRoomParticipants(roomId);
		return participants.filter((participant) => this.livekitService.isStandardParticipant(participant));
	}

	/**
	 * Room name straight off the LiveKit room metadata Meet stamps at creation, with the database as
	 * fallback — the same trade-off the participant webhooks make (the metadata is already at hand,
	 * the database is a round trip).
	 */
	protected async resolveRoomName(room: Room): Promise<string> {
		const roomName = MeetRoomHelper.extractRoomOptionsFromMetadata(room.metadata)?.roomName;

		if (roomName) {
			return roomName;
		}

		const meetRoom = await this.roomService.getMeetRoom(room.name, ['roomName']);
		return meetRoom.roomName;
	}
}
