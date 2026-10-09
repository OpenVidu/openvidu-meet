import type { MeetParticipantHandOptions } from '@openvidu-meet/typings';
import { MeetParticipantModerationAction } from '@openvidu-meet/typings';
import { z } from 'zod';

export const UpdateParticipantRoleReqSchema = z.object({
	action: z.enum(MeetParticipantModerationAction)
});

// Moderation is one-way: a moderator turns a remote device off, never on, so `false` is the only
// accepted value and an empty body has nothing to do.
export const MuteParticipantMediaReqSchema = z
	.object({
		audioActive: z.literal(false).optional(),
		videoActive: z.literal(false).optional(),
		screenShareActive: z.literal(false).optional()
	})
	.refine((media) => Object.values(media).some((active) => active === false), {
		message: 'At least one of audioActive, videoActive or screenShareActive must be set to false'
	});

export const UpdateParticipantHandReqSchema: z.ZodType<MeetParticipantHandOptions> = z.object({
	raised: z.boolean()
});

// Nobody raises a hand but its owner, so the bulk form only lowers.
export const LowerAllHandsReqSchema: z.ZodType<MeetParticipantHandOptions> = z.object({
	raised: z.literal(false)
});
