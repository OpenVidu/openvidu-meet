import type { MeetParticipantHandOptions, MeetParticipantReactionOptions } from '@openvidu-meet/typings';
import { MeetParticipantModerationAction, MeetReaction, MeetWaitingParticipantReason } from '@openvidu-meet/typings';
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
	handRaised: z.boolean()
});

// Nobody raises a hand but its owner, so the bulk form only lowers.
export const LowerAllHandsReqSchema: z.ZodType<MeetParticipantHandOptions> = z.object({
	handRaised: z.literal(false)
});

export const SendParticipantReactionReqSchema: z.ZodType<MeetParticipantReactionOptions> = z.object({
	reaction: z.enum(MeetReaction)
});

export const WaitingTicketSchema = z.string().min(1).max(100);

export const WaitingParticipantLeaveReqSchema = z.object({
	waitingTicket: WaitingTicketSchema,
	reason: z.literal(MeetWaitingParticipantReason.PAGE_CLOSED).optional()
});

export const BulkRejectWaitingParticipantsReqSchema = z.object({
	participantIdentities: z.preprocess(
		(arg) =>
			typeof arg === 'string'
				? Array.from(
						new Set(
							arg
								.split(',')
								.map((s) => s.trim())
								.filter((s) => s !== '')
						)
					)
				: [],
		z
			.array(z.string())
			.min(1, { message: 'At least one participantIdentity is required' })
			.max(INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS, {
				message: `participantIdentities cannot exceed ${INTERNAL_CONFIG.BULK_DELETE_MAX_ITEMS} items`
			})
	)
});
