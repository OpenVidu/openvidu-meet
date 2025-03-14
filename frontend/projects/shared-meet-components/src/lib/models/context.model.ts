import { OpenViduMeetPermissions, ParticipantRole } from 'projects/shared-meet-components/src/public-api';

export interface ContextData {
	roomName: string;
	participantName: string;
	secret: string;
	token: string;
	participantRole: ParticipantRole;
	participantPermissions: OpenViduMeetPermissions;
	mode: ApplicationMode;
	edition: Edition;
	leaveRedirectUrl: string;
	parentDomain: string;
}

export enum ApplicationMode {
	EMBEDDED = 'embedded',
	STANDALONE = 'standalone'
}

export enum Edition {
	CE = 'ce',
	PRO = 'pro'
}
