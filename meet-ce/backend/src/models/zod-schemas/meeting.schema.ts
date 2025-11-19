import { MeetRoomMemberRole } from '@openvidu-meet/typings';
import { z } from 'zod';

export const UpdateParticipantRequestSchema = z.object({
	role: z.nativeEnum(MeetRoomMemberRole)
});
