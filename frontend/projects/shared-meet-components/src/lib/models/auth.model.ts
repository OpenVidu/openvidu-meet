import { OpenViduMeetPermissions, ParticipantRole } from 'shared-meet-components';

export interface TokenGenerationResult {
	token: string; // The generated participant token
	role: ParticipantRole; // Role of the participant (e.g., 'moderator', 'publisher')
	permissions: OpenViduMeetPermissions; // List of permissions granted to the participant
}
