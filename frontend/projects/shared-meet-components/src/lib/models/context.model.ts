import {
	OpenViduMeetPermissions,
	ParticipantRole,
	RecordingPermissions,
	SecurityPreferencesDTO
} from 'projects/shared-meet-components/src/public-api';

export interface ContextData {
	mode: ApplicationMode;
	edition: Edition;
	version: string;
	parentDomain: string;
	securityPreferences?: SecurityPreferencesDTO;
	openviduLogoUrl: string;
	backgroundImageUrl: string;
	roomId: string;
	secret: string;
	participantName: string;
	participantToken: string;
	participantRole: ParticipantRole;
	participantPermissions: OpenViduMeetPermissions;
	recordingPermissions: RecordingPermissions;
	leaveRedirectUrl: string;
}

export enum ApplicationMode {
	EMBEDDED = 'embedded',
	STANDALONE = 'standalone'
}

export enum Edition {
	CE = 'ce',
	PRO = 'pro'
}
