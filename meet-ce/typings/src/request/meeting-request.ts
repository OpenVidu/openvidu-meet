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
