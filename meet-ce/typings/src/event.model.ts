import { MeetRoomConfig } from './room-config.js';
import { MeetRoomMemberRole } from './room-member.js';

export enum MeetSignalType {
	MEET_ROOM_CONFIG_UPDATED = 'meet_room_config_updated',
	MEET_PARTICIPANT_ROLE_UPDATED = 'meet_participant_role_updated'
}

export interface MeetRoomConfigUpdatedPayload {
	roomId: string;
	config: MeetRoomConfig;
	timestamp: number;
}

export interface MeetParticipantRoleUpdatedPayload {
	roomId: string;
	participantIdentity: string;
	newRole: MeetRoomMemberRole;
	secret?: string;
	timestamp: number;
}

export type MeetSignalPayload = MeetRoomConfigUpdatedPayload | MeetParticipantRoleUpdatedPayload;
