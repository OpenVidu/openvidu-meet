import { TrackSource } from '@livekit/protocol';
import type { MeetParticipantInfo, MeetParticipantPayload, MeetRoomMemberTokenMetadata } from '@openvidu-meet/typings';
import { MeetRoomMemberRole, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import type { ParticipantInfo } from 'livekit-server-sdk';
import { RoomMemberTokenMetadataSchema } from '../models/zod-schemas/room-member.schema.js';

export class MeetParticipantHelper {
	private constructor() {
		// Prevent instantiation of this utility class
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
}
