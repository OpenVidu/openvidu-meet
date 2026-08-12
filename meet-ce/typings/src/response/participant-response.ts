import { MeetRoomMemberRole } from '../database/room-member.entity.js';

/**
 * Identity snapshot of a participant in a meeting: the shape participant-level lifecycle surfaces
 * (front events and webhooks such as `participantJoined`/`participantLeft`) carry.
 *
 * It deliberately excludes live media state: lifecycle events fire on connect/disconnect, when
 * tracks are not published yet (or are already torn down), so a media flag there would read as
 * "joined muted" for every participant. Live media state belongs to {@link MeetParticipantInfo}.
 */
export interface MeetParticipantPayload {
	/** Unique identity of the participant within the meeting. */
	participantIdentity: string;
	/** Display name of the participant. */
	participantName: string;
	/**
	 * Application-defined identifier echoed from the `participant-external-id` embed attribute /
	 * `participantExternalId` join option, so the embedding application can correlate the
	 * participant with one of its own users. Absent when the application did not provide one.
	 */
	externalId?: string;
	/**
	 * Opaque application-defined payload echoed from the `participant-metadata` embed attribute /
	 * `participantMetadata` join option. Never interpreted by OpenVidu Meet. Absent when the
	 * application did not provide one.
	 */
	metadata?: string;
	/** Effective role of the participant, including on-the-fly promotions and demotions. */
	role: MeetRoomMemberRole;
	/** Timestamp when the participant joined the meeting (milliseconds since epoch). */
	joinDate: number;
}

/**
 * Live snapshot of a participant in an ongoing meeting: {@link MeetParticipantPayload} extended
 * with the current media state. This is the shape live-introspection surfaces serve
 * (`GET /meetings/{roomId}/participants`), where LiveKit reports the participant's actual tracks —
 * unlike lifecycle events, whose timing makes these flags meaningless.
 */
export interface MeetParticipantInfo extends MeetParticipantPayload {
	/** Whether the participant's microphone is currently publishing (present and not muted). */
	audioEnabled: boolean;
	/** Whether the participant's camera is currently publishing (present and not muted). */
	videoEnabled: boolean;
	/** Whether the participant is currently sharing their screen. */
	screenSharing: boolean;
}
