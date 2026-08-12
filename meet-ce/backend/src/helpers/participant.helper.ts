import { DisconnectReason, TrackSource } from '@livekit/protocol';
import type {
	MeetParticipantDeparturePayload,
	MeetParticipantInfo,
	MeetParticipantJoinedPayload,
	MeetParticipantLeftPayload,
	MeetParticipantPayload,
	MeetRoomMemberTokenMetadata
} from '@openvidu-meet/typings';
import { LeftEventReason, MeetRoomMemberRole, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import type { ParticipantInfo, Room } from 'livekit-server-sdk';
import { container } from '../config/dependency-injector.config.js';
import { RoomMemberTokenMetadataSchema } from '../models/zod-schemas/room-member.schema.js';
import { RoomService } from '../services/room.service.js';
import { MeetRoomHelper } from './room.helper.js';

export class MeetParticipantHelper {
	private constructor() {
		// Prevent instantiation of this utility class
	}

	/**
	 * Builds the payload of the `participantJoined` webhook from a LiveKit participant_joined event.
	 *
	 * @param room - The LiveKit room the participant joined.
	 * @param participant - The LiveKit participant that joined.
	 */
	static async toParticipantJoinedPayload(
		room: Room,
		participant: ParticipantInfo
	): Promise<MeetParticipantJoinedPayload> {
		const { roomId, roomName } = await MeetParticipantHelper.resolveRoomIdentity(room);

		return {
			roomId,
			roomName,
			participant: MeetParticipantHelper.toParticipantPayload(participant)
		};
	}

	/**
	 * Builds the payload of the `participantLeft` webhook from a LiveKit participant_left event.
	 *
	 * @param room - The LiveKit room the participant left.
	 * @param participant - The LiveKit participant that left.
	 * @param leaveDate - Timestamp in milliseconds since epoch when the departure was observed.
	 */
	static async toParticipantLeftPayload(
		room: Room,
		participant: ParticipantInfo,
		leaveDate: number
	): Promise<MeetParticipantLeftPayload> {
		const { roomId, roomName } = await MeetParticipantHelper.resolveRoomIdentity(room);

		return {
			roomId,
			roomName,
			participant: MeetParticipantHelper.toDepartedParticipantPayload(participant, leaveDate)
		};
	}

	/**
	 * Converts a LiveKit participant into the payload the `participantLeft` webhook carries: the
	 * join-time form extended with how and when the participant left.
	 *
	 * @param participant - The LiveKit participant to convert.
	 * @param leaveDate - Timestamp in milliseconds since epoch when the departure was observed.
	 */
	static toDepartedParticipantPayload(
		participant: ParticipantInfo,
		leaveDate: number
	): MeetParticipantDeparturePayload {
		const participantPayload = MeetParticipantHelper.toParticipantPayload(participant);

		return {
			...participantPayload,
			leaveDate,
			durationSeconds: MeetParticipantHelper.extractDuration(participantPayload.joinDate, leaveDate),
			leaveReason: MeetParticipantHelper.extractLeftReason(participant.disconnectReason)
		};
	}

	/**
	 * Converts a LiveKit participant into the {@link MeetParticipantPayload} identity shape that
	 * participant-level lifecycle surfaces (front events and webhooks) carry.
	 *
	 * The identity/correlation fields come from the Meet token metadata the participant joined
	 * with. Live media state is deliberately not part of this shape: lifecycle events fire before
	 * tracks are published (or after they are torn down) — see {@link toParticipantInfo}.
	 *
	 * @param participant - The LiveKit participant to convert.
	 */
	static toParticipantPayload(participant: ParticipantInfo): MeetParticipantPayload {
		const meetingMetadata = MeetParticipantHelper.parseMeetingMetadata(participant);

		return {
			participantIdentity: participant.identity,
			participantName: participant.name,
			externalId: meetingMetadata?.externalId,
			metadata: meetingMetadata?.metadata,
			role: MeetParticipantHelper.extractRole(participant),
			joinDate: MeetParticipantHelper.extractJoinDate(participant)
		};
	}

	/**
	 * Converts a LiveKit participant into the live {@link MeetParticipantInfo} snapshot that
	 * live-introspection surfaces serve: the lifecycle payload extended with the media state read
	 * from the participant's currently published tracks.
	 *
	 * @param participant - The LiveKit participant to convert.
	 */
	static toParticipantInfo(participant: ParticipantInfo): MeetParticipantInfo {
		return {
			...MeetParticipantHelper.toParticipantPayload(participant),
			...MeetParticipantHelper.extractMediaState(participant)
		};
	}

	/**
	 * Extracts the effective role of a participant from the room member badge carried in its token
	 * metadata.
	 *
	 * Falls back to `SPEAKER` when the metadata is absent or cannot be parsed (a participant that
	 * did not join through Meet), mirroring the `OTHER` badge.
	 *
	 * @param participant - The LiveKit participant to inspect.
	 */
	static extractRole(participant: ParticipantInfo): MeetRoomMemberRole {
		const badge = MeetParticipantHelper.parseMeetingMetadata(participant)?.badge;

		if (!badge || badge === MeetRoomMemberUIBadge.OTHER) {
			return MeetRoomMemberRole.SPEAKER;
		}

		return MeetRoomMemberRole.MODERATOR;
	}

	/**
	 * Extracts the join timestamp of a participant in milliseconds since epoch.
	 *
	 * LiveKit exposes it both in milliseconds and in seconds; the former is preferred and the latter
	 * used as a fallback. Returns 0 when neither is set.
	 *
	 * @param participant - The LiveKit participant to inspect.
	 */
	static extractJoinDate(participant: ParticipantInfo): number {
		const joinedAtMs = Number(participant.joinedAtMs ?? 0);

		if (joinedAtMs > 0) return joinedAtMs;

		return Number(participant.joinedAt ?? 0) * 1000;
	}

	/**
	 * Computes how long a participant stayed in the meeting, in seconds.
	 *
	 * Returns 0 when LiveKit reported no join timestamp, so a missing value is not published as a
	 * stay lasting since the epoch.
	 *
	 * @param joinDate - Join timestamp in milliseconds since epoch, as returned by {@link extractJoinDate}.
	 * @param leaveDate - Leave timestamp in milliseconds since epoch.
	 */
	static extractDuration(joinDate: number, leaveDate: number): number {
		if (joinDate <= 0) return 0;

		return Math.max(0, Math.round((leaveDate - joinDate) / 1000));
	}

	/**
	 * Maps the LiveKit disconnect reason of a participant_left event to the public reason the
	 * `participantLeft` webhook carries.
	 *
	 * The backend cannot tell apart a meeting ended by the departing participant from one ended by
	 * somebody else, so both map to `MEETING_ENDED`; that nuance is only available client-side.
	 *
	 * @param reason - The LiveKit disconnect reason.
	 */
	static extractLeftReason(reason: DisconnectReason): LeftEventReason {
		switch (reason) {
			case DisconnectReason.CLIENT_INITIATED:
				return LeftEventReason.VOLUNTARY_LEAVE;
			case DisconnectReason.SIGNAL_CLOSE:
			case DisconnectReason.STATE_MISMATCH:
			case DisconnectReason.CONNECTION_TIMEOUT:
			case DisconnectReason.MEDIA_FAILURE:
				return LeftEventReason.NETWORK_DISCONNECT;
			case DisconnectReason.SERVER_SHUTDOWN:
				return LeftEventReason.SERVER_SHUTDOWN;
			case DisconnectReason.PARTICIPANT_REMOVED:
				return LeftEventReason.PARTICIPANT_KICKED;
			case DisconnectReason.ROOM_DELETED:
			case DisconnectReason.ROOM_CLOSED:
				return LeftEventReason.MEETING_ENDED;
			case DisconnectReason.DUPLICATE_IDENTITY:
				return LeftEventReason.DUPLICATE_IDENTITY;
			default:
				return LeftEventReason.UNKNOWN;
		}
	}

	/**
	 * Extracts the current media state of a participant from its published tracks: a device counts
	 * as enabled when a track from it is published and not muted, while a screen share counts as
	 * active as soon as its track is published.
	 *
	 * @param participant - The LiveKit participant to inspect.
	 */
	static extractMediaState(
		participant: ParticipantInfo
	): Pick<MeetParticipantInfo, 'audioEnabled' | 'videoEnabled' | 'screenSharing'> {
		let audioEnabled = false;
		let videoEnabled = false;
		let screenSharing = false;

		for (const track of participant.tracks) {
			switch (track.source) {
				case TrackSource.MICROPHONE:
					audioEnabled ||= !track.muted;
					break;
				case TrackSource.CAMERA:
					videoEnabled ||= !track.muted;
					break;
				case TrackSource.SCREEN_SHARE:
				case TrackSource.SCREEN_SHARE_AUDIO:
					screenSharing = true;
					break;
			}
		}

		return { audioEnabled, videoEnabled, screenSharing };
	}

	/**
	 * Parses the Meet token metadata a participant carries, or `undefined` for a participant that
	 * did not join through Meet (absent, unparseable or foreign metadata).
	 *
	 * Uses the same schema the token layer validates with, so both surfaces cannot drift.
	 *
	 * @param participant - The LiveKit participant to inspect.
	 */
	private static parseMeetingMetadata(participant: ParticipantInfo): MeetRoomMemberTokenMetadata | undefined {
		if (!participant.metadata) {
			return undefined;
		}

		try {
			const parsed: unknown = JSON.parse(participant.metadata);
			const { success, data } = RoomMemberTokenMetadataSchema.safeParse(parsed);
			return success ? data : undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * Resolves the Meet room identity a participant webhook payload carries.
	 *
	 * A LiveKit room is named after the Meet room id, and Meet writes the room options into its
	 * metadata on creation, so both fields are already at hand and the common path costs no database
	 * round trip — participants join and leave far more often than rooms and recordings start and
	 * stop. The database is consulted only when that metadata is missing or unparseable.
	 *
	 * @param room - The LiveKit room carried by the webhook event.
	 */
	private static async resolveRoomIdentity(room: Room): Promise<{ roomId: string; roomName: string }> {
		const roomName = MeetRoomHelper.extractRoomOptionsFromMetadata(room.metadata)?.roomName;

		if (roomName) {
			return { roomId: room.name, roomName };
		}

		const roomService = container.get(RoomService);
		const meetRoom = await roomService.getMeetRoom(room.name, ['roomId', 'roomName']);
		return { roomId: meetRoom.roomId, roomName: meetRoom.roomName };
	}
}
