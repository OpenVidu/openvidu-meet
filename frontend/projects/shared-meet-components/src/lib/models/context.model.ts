import { OpenViduMeetPermissions, ParticipantRole, RecordingPermissions, SecurityPreferences } from '../typings/ce';

export interface ContextData {
	mode: ApplicationMode;
	edition: Edition;
	version: string;
	parentDomain: string;
	securityPreferences?: SecurityPreferences;
	openviduLogoUrl: string;
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
