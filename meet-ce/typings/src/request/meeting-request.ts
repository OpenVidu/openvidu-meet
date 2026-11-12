import { MeetReaction } from '../reaction.js';

/**
 * Which of a participant's devices a moderator turns off, as carried by
 * `PUT /meetings/{roomId}/participants/{participantIdentity}/media`, its bulk twin
 * `PUT /meetings/{roomId}/participants/media` and the `participantMute`/`participantMuteAll`
 * embedding commands.
 *
 * Only `false` is accepted: moderation is one-way, nobody turns a remote device **on**. At least one
 * device must be named; an empty object is rejected. The affected participant may turn the device
 * back on afterwards — this mutes, it does not revoke their publishing permissions.
 */
export interface MeetParticipantMuteOptions {
	/** Set to `false` to mute the participant's microphone. */
	audioActive?: false;
	/** Set to `false` to turn off the participant's camera. */
	videoActive?: false;
	/** Set to `false` to stop the participant's screen share. */
	screenShareActive?: false;
}

/**
 * Whether a participant's hand is raised, as carried by
 * `PUT /meetings/{roomId}/participants/{participantIdentity}/hand` and its bulk twin
 * `PUT /meetings/{roomId}/participants/hand`.
 *
 * A participant raises and lowers their own hand freely. Lowering another participant's hand
 * requires the `participantHandLower` permission, and nobody raises a hand but its owner, so a
 * foreign target and the bulk twin accept `false` only.
 */
export interface MeetParticipantHandOptions {
	/** `true` raises the hand, `false` lowers it. */
	raised: boolean;
}

/**
 * The reaction a participant sends, as carried by the internal
 * `POST /meetings/{roomId}/reactions`, which the meeting and the `participantReactionSend`
 * embedding command call on the participant's behalf.
 */
export interface MeetParticipantReactionOptions {
	/** One of the reactions in {@link MeetReaction}. */
	reaction: MeetReaction;
}

/**
 * Payload of the `participantWaitingAdmit` and `participantWaitingReject` embedded commands, and body of the
 * operations of the same names next to the `roomId` of the meeting: the waiting participants to decide on, one or
 * several.
 */
export interface MeetParticipantWaitingDecisionOptions {
	/**
	 * Identities of the waiting participants to decide on, 1 to 100 distinct ones. Omitted, everyone
	 * waiting: `participantWaitingAdmit` admits the first in line up to the free places, and
	 * `participantWaitingReject` rejects everyone waiting when it runs. An empty list is refused. A decision on
	 * named participants applies to all of them or to none.
	 */
	participantIdentities?: string[];
}
