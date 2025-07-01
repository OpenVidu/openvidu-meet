import { OpenViduMeetPermissions, ParticipantRole } from '../typings/ce';

export interface ParticipantTokenInfo {
	token: string; // The generated participant token
	role: ParticipantRole; // Role of the participant (e.g., 'moderator', 'publisher')
	permissions: OpenViduMeetPermissions; // List of permissions granted to the participant
}
