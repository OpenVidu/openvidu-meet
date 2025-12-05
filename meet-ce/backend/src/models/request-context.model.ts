import { MeetRoomMemberTokenMetadata, MeetUser } from '@openvidu-meet/typings';

/**
 * Context information stored per HTTP request.
 */
export interface RequestContext {
	user?: MeetUser;
	roomMember?: MeetRoomMemberTokenMetadata;
}
