import { TrackSource } from '@livekit/protocol';
import type { MeetMeetingInfo, MeetParticipantInfo, MeetParticipantMuteOptions } from '@openvidu-meet/typings';
import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { ParticipantInfo, Room } from 'livekit-server-sdk';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MeetParticipantHelper } from '../helpers/participant.helper.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import {
	errorNoActiveMeeting,
	errorParticipantCannotBeMuted,
	errorParticipantNotFound,
	OpenViduMeetError
} from '../models/error.model.js';
import { runConcurrently } from '../utils/concurrency.utils.js';
import { FrontendEventService } from './frontend-event.service.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { RequestSessionService } from './request-session.service.js';
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
		@inject(LoggerService) protected logger: LoggerService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(RequestSessionService) protected requestSessionService: RequestSessionService
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
	 * Turns off some of a participant's devices in the meeting of a room.
	 *
	 * @param roomId - The ID of the room
	 * @param participantIdentity - The identity of the participant to mute
	 * @param media - The devices to turn off
	 * @throws A 404 error when the participant is not in the meeting, or a 409 when they are a
	 * moderator: moderation does not apply to moderators
	 */
	async muteParticipant(
		roomId: string,
		participantIdentity: string,
		media: MeetParticipantMuteOptions
	): Promise<void> {
		const participant = await this.livekitService.getParticipant(roomId, participantIdentity);

		if (!this.livekitService.isStandardParticipant(participant)) {
			throw errorParticipantNotFound(participantIdentity, roomId);
		}

		if (MeetParticipantHelper.extractRole(participant) === MeetRoomMemberRole.MODERATOR) {
			throw errorParticipantCannotBeMuted(participantIdentity, roomId);
		}

		await this.muteParticipantTracks(roomId, participant, media);
		await this.frontendEventService.sendParticipantMediaMutedSignal(roomId, [participant.identity], media);
	}

	/**
	 * Turns off some of the devices of every other participant in the meeting except the moderators.
	 * The caller is left alone: muting everyone is an action on the rest of the meeting, and their own
	 * devices are theirs to control.
	 *
	 * Best-effort by nature: a participant that leaves while the mutes are in flight is reported as a
	 * warning instead of failing the whole operation for everybody else.
	 *
	 * @param roomId - The ID of the room
	 * @param media - The devices to turn off
	 * @throws A 404 error when the room has no active meeting
	 */
	async muteAllParticipants(roomId: string, media: MeetParticipantMuteOptions): Promise<void> {
		const [, participants] = await this.withActiveMeetingRoom(roomId, this.getStandardParticipants(roomId));
		const callerIdentity = this.requestSessionService.getParticipantIdentity();
		const targets = participants.filter(
			(participant) =>
				participant.identity !== callerIdentity &&
				MeetParticipantHelper.extractRole(participant) !== MeetRoomMemberRole.MODERATOR
		);
		const results = await runConcurrently(
			targets,
			(participant) => this.muteParticipantTracks(roomId, participant, media),
			{ concurrency: INTERNAL_CONFIG.CONCURRENCY_BULK_MUTE_PARTICIPANTS }
		);
		const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
		const muted = targets
			.filter((_participant, index) => results[index].status === 'fulfilled')
			.map((participant) => participant.identity);

		if (failures.length > 0) {
			this.logger.warn(
				`Failed to mute ${failures.length} participant(s) in room '${roomId}'`,
				failures[0].reason
			);
		}

		if (muted.length > 0) {
			await this.frontendEventService.sendParticipantMediaMutedSignal(roomId, muted, media);
		}
	}

	/**
	 * Mutes the published tracks of the requested sources, resolving only once every one of them is
	 * off — telling a participant a device was turned off is the caller's next step, and a device
	 * still publishing must not be reported as muted. A source with no matching track is already in
	 * the requested state, so it is not a failure.
	 */
	protected async muteParticipantTracks(
		roomId: string,
		participant: ParticipantInfo,
		media: MeetParticipantMuteOptions
	): Promise<void> {
		const sources = this.mutedTrackSources(media);
		const trackSids = participant.tracks
			.filter((track) => !track.muted && sources.includes(track.source))
			.map((track) => track.sid);
		const mutes = await Promise.allSettled(
			trackSids.map((trackSid) => this.livekitService.mutePublishedTrack(roomId, participant.identity, trackSid))
		);
		const failedMute = mutes.find((mute) => mute.status === 'rejected');

		if (failedMute) {
			throw failedMute.reason;
		}
	}

	/**
	 * The LiveKit track sources a mute request covers. Screen share includes its audio track: they
	 * are one share for the participant, and LiveKit publishes them separately.
	 */
	protected mutedTrackSources(media: MeetParticipantMuteOptions): TrackSource[] {
		const sources: TrackSource[] = [];

		if (media.audioActive === false) {
			sources.push(TrackSource.MICROPHONE);
		}

		if (media.videoActive === false) {
			sources.push(TrackSource.CAMERA);
		}

		if (media.screenShareActive === false) {
			sources.push(TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO);
		}

		return sources;
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

	/**
	 * Returns the standard participants currently in the meeting of a room, filtering out LiveKit's
	 * internal participants (egress, ingress, agents) from the API surface.
	 * @param roomId
	 * @returns
	 */
	async getStandardParticipants(roomId: string): Promise<ParticipantInfo[]> {
		return this.livekitService.listStandardParticipants(roomId);
	}

	/**
	 * Counts the standard participants currently in the meeting of a room — the same population
	 * `getParticipants` lists and `maxParticipants` limits.
	 *
	 * @param roomId - The ID of the room
	 * @returns The number of standard participants; 0 if the meeting hasn't started
	 * @throws Any failure other than a not-yet-started meeting (e.g. LiveKit unreachable) — it must
	 * not be swallowed as empty, or `maxParticipants` would silently stop being enforced
	 */
	async countStandardParticipants(roomId: string): Promise<number> {
		const participants = await this.getStandardParticipants(roomId);
		return participants.length;
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
