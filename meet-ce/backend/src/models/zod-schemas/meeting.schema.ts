import { MeetParticipantModerationAction } from '@openvidu-meet/typings';
import { z } from 'zod';

export const UpdateParticipantRoleReqSchema = z.object({
	action: z.nativeEnum(MeetParticipantModerationAction)
});
