import { MeetRoomMemberRole } from '../database/room-member.entity.js';

/**
 * Identity of a participant in a meeting, carried by the lifecycle events and webhooks
 * (`participantJoined`, `participantLeft`).
 *
 * It has no media state (`audioActive`, `videoActive`, `screenShareActive`) on purpose: these
 * events fire before the participant publishes its tracks or once they are gone, so the values
 * would not be reliable. The webhooks that report a state change carry {@link MeetParticipantInfo}.
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
 * Live snapshot of a participant in an ongoing meeting: its identity plus its current media and
 * hand state. Served by `GET /meetings/{roomId}/participants` and carried by the webhooks that
 * report a state change (`participantRoleChanged`, `participantHandChanged`). See
 * {@link MeetParticipantPayload} for why the lifecycle webhooks do not carry it.
 */
export interface MeetParticipantInfo extends MeetParticipantPayload {
	/** Whether the participant's microphone is currently publishing (present and not muted). */
	audioActive: boolean;
	/** Whether the participant's camera is currently publishing (present and not muted). */
	videoActive: boolean;
	/** Whether the participant is currently sharing their screen. */
	screenShareActive: boolean;
	/** Whether the participant's hand is currently raised. */
	handRaised: boolean;
	/**
	 * Timestamp when the participant raised their hand (milliseconds since epoch), present while it
	 * is raised. Raised hands are queued in ascending order of this value.
	 */
	handRaiseDate?: number;
}
