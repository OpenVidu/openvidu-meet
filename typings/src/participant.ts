import { LiveKitPermissions } from './permissions/livekit-permissions.js';
import { OpenViduMeetPermissions } from './permissions/openvidu-permissions.js';

/**
 * Options for a participant to join a room.
 */
export interface ParticipantOptions {
	/**
	 * The unique identifier for the room.
	 */
	roomId: string;

	/**
	 * The name of the participant.
	 */
	participantName: string;

	/**
	 * A secret key for room access.
	 */
	secret: string;
}

/**
 * Represents the permissions for an individual participant.
 */
export interface ParticipantPermissions {
	livekit: LiveKitPermissions;
	openvidu: OpenViduMeetPermissions;
}

/**
 * Represents the role of a participant in a room.
 */
export const enum ParticipantRole {
	MODERATOR = 'moderator',
	PUBLISHER = 'publisher',
}
