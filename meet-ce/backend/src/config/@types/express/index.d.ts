import { ParticipantRole, User } from '@openvidu-meet/typings';
import { ClaimGrants } from 'livekit-server-sdk';

// Override the Express Request type to include a session object with user and token properties
// This will allow controllers to access the user and token information from the request object in a type-safe manner
declare module 'express' {
	interface Request {
		session?: {
			user?: User;
			tokenClaims?: ClaimGrants;
			participantRole?: ParticipantRole;
		};
	}
}
