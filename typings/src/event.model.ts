import { ParticipantRole } from './participant.js';
import { MeetRoomPreferences } from './room-preferences.js';

export enum MeetSignalType {
	MEET_ROOM_PREFERENCES_UPDATED = 'meet_room_preferences_updated',
	MEET_PARTICIPANT_ROLE_UPDATED = 'meet_participant_role_updated',
}

export interface MeetRoomPreferencesUpdatedPayload {
	roomId: string;
	preferences: MeetRoomPreferences;
	timestamp: number;
}

export interface MeetParticipantRoleUpdatedPayload {
	roomId: string;
	participantName: string;
	newRole: ParticipantRole;
	timestamp: number;
	secret: string;
}

export type MeetSignalPayload =
	| MeetRoomPreferencesUpdatedPayload
	| MeetParticipantRoleUpdatedPayload;
