import {
	OpenViduMeetPermissions,
	ParticipantRole,
	SecurityPreferencesDTO
} from 'projects/shared-meet-components/src/public-api';

export interface ContextData {
	roomId: string;
	participantName: string;
	secret: string;
	token: string;
	participantRole: ParticipantRole;
	participantPermissions: OpenViduMeetPermissions;
	mode: ApplicationMode;
	edition: Edition;
	securityPreferences?: SecurityPreferencesDTO;
	leaveRedirectUrl: string;
	parentDomain: string;
	version: string;
	openviduLogoUrl: string;
	backgroundImageUrl: string;
}

export enum ApplicationMode {
	EMBEDDED = 'embedded',
	STANDALONE = 'standalone'
}

export enum Edition {
	CE = 'ce',
	PRO = 'pro'
}
