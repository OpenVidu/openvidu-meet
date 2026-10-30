import type {
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomField,
	MeetRoomMemberTokenMetadata,
	MeetUser,
	ProjectedMeetRoom
} from '@openvidu-meet/typings';

/**
 * The fields the room member token validator reads from the room it validates the token against.
 */
export const REQUEST_ROOM_FIELDS = ['roomId', 'rolesUpdatedAt', 'config'] as const satisfies readonly MeetRoomField[];

/**
 * The room a room member token was validated against, as read once by the validator for the rest of its request.
 */
export type RequestRoomSnapshot = ProjectedMeetRoom<typeof REQUEST_ROOM_FIELDS>;

/**
 * Context information stored per HTTP request.
 */
export interface RequestContext {
	/** Correlation id assigned once per HTTP request, emitted on every log line for traceability. */
	requestId?: string;
	/** Scheme and host the request was addressed to (e.g. `https://meet.example.com`), the base of every URL handed back to the caller. */
	origin?: string;
	user?: MeetUser;
	roomMember?: MeetRoomMemberTokenMetadata & { participantIdentity?: string };
	room?: RequestRoomSnapshot;
}

/**
 * Options for room deletion operations.
 */
export interface MeetRoomDeletionOptions {
	/** Policy for handling rooms with active meetings */
	withMeeting?: MeetRoomDeletionPolicyWithMeeting;
	/** Policy for handling rooms with recordings */
	withRecordings?: MeetRoomDeletionPolicyWithRecordings;
	/** Array of base fields to include in the response (for HTTP field filtering) */
	fields?: MeetRoomField[];
}
