import type {
	MeetParticipantWaitingDecisionOptions,
	MeetParticipantHandOptions,
	MeetParticipantReactionOptions
} from '@openvidu-meet/typings';
import { MeetParticipantModerationAction, MeetReaction, MeetWaitingRoomReason } from '@openvidu-meet/typings';
import { z } from 'zod';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';

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

export const SendParticipantReactionReqSchema: z.ZodType<MeetParticipantReactionOptions> = z.object({
	reaction: z.enum(MeetReaction)
});

// Omitted means everyone waiting, so an empty list is refused instead of being read as everyone.
export const WaitingRoomDecisionReqSchema: z.ZodType<MeetParticipantWaitingDecisionOptions> = z.object({
	participantIdentities: z
		.array(z.string().min(1))
		.min(1, 'Must name at least one participant')
		.max(INTERNAL_CONFIG.WAITING_ROOM_MAX_ENTRIES)
		.refine((identities) => new Set(identities).size === identities.length, 'Must not repeat an identity')
		.optional()
});

export const WaitingRoomTicketSchema = z.string().min(1).max(100);

export const WaitingRoomLeaveReqSchema = z.object({
	waitingRoomTicket: WaitingRoomTicketSchema,
	reason: z.literal(MeetWaitingRoomReason.PAGE_CLOSED).optional()
});
