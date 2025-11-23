import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { z } from 'zod';

export const UpdateParticipantRoleReqSchema = z.object({
	role: z.nativeEnum(MeetRoomMemberRole)
});
