import type { MeetParticipantHandOptions, MeetParticipantReactionOptions } from '@openvidu-meet/typings';
import { MeetParticipantModerationAction, MeetReaction } from '@openvidu-meet/typings';
import { z } from 'zod';

/** A field that only takes the boolean `false`; a missing one keeps the global `Required`. */
const onlyFalse = (field: string) =>
	z.literal(false, {
		error: (issue) => (issue.input === undefined ? undefined : `${field} can only be the boolean false`)
	});

export const UpdateParticipantRoleReqSchema = z.object({
	action: z.enum(MeetParticipantModerationAction)
});

// Moderation is one-way: a moderator turns a remote device off, never on, so `false` is the only
// accepted value and an empty body has nothing to do.
export const MuteParticipantMediaReqSchema = z
	.object({
		audioActive: onlyFalse('audioActive').optional(),
		videoActive: onlyFalse('videoActive').optional(),
		screenShareActive: onlyFalse('screenShareActive').optional()
	})
	.refine((media) => Object.values(media).some((active) => active === false), {
		message: 'At least one of audioActive, videoActive or screenShareActive must be set to false'
	});

export const UpdateParticipantHandReqSchema: z.ZodType<MeetParticipantHandOptions> = z.object({
	raised: z.boolean()
});

// Nobody raises a hand but its owner, so the bulk form only lowers.
export const LowerAllHandsReqSchema: z.ZodType<MeetParticipantHandOptions> = z.object({
	raised: onlyFalse('raised')
});

export const SendParticipantReactionReqSchema: z.ZodType<MeetParticipantReactionOptions> = z.object({
	reaction: z.enum(MeetReaction)
});
