import type {
	MeetRoom,
	MeetRoomDeletionPolicyWithMeeting,
	MeetRoomDeletionPolicyWithRecordings,
	MeetRoomField,
	MeetRoomMemberTokenMetadata,
	MeetUser
} from '@openvidu-meet/typings';

/**
 * The room a room member token was validated against, as read once by the validator for the rest of its request.
 */
export type RequestRoomSnapshot = Pick<MeetRoom, 'roomId' | 'rolesUpdatedAt' | 'config'>;

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
