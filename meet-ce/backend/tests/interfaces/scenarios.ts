import { MeetRoom, MeetRoomMember, MeetUser } from '@openvidu-meet/typings';

export interface RoomData {
	room: MeetRoom;
	moderatorSecret: string;
	moderatorToken: string;
	speakerSecret: string;
	speakerToken: string;
	recordingId?: string;
	users?: RoomTestUsers;
}

export interface TestContext {
	rooms: RoomData[];
	getRoomByIndex(index: number): RoomData | undefined;
	getLastRoom(): RoomData | undefined;
}

/**
 * Represents a registered user with their access token for testing purposes.
 */
export interface UserData {
	user: MeetUser;
	password: string;
	accessToken: string;
}

/**
 * Represents a room member along with their authentication token for testing purposes.
 */
export interface RoomMemberData {
	member: MeetRoomMember;
	memberToken: string;
}

/**
 * Collection of basic test users with different roles for authentication and permission scenarios.
 */
export interface TestUsers {
	admin: UserData;
	user: UserData;
	roomMember: UserData;
}

/**
 * Collection of test users specific to a room scenario.
 * Includes the room owner, a regular member, and a room member.
 */
export interface RoomTestUsers {
	/** User with USER role who is the owner of the room */
	userOwner: UserData;

	/** User with USER role who is a member of the room (not owner) */
	userMember: UserData;

	/** Room member details for userMember */
	userMemberDetails: RoomMemberData;

	/** User with ROOM_MEMBER role who is a member of the room */
	roomMember: UserData;

	/** Room member details for roomMember */
	roomMemberDetails: RoomMemberData;
}
