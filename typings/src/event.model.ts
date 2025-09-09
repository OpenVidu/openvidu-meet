import { ParticipantRole } from './participant.js';
import { MeetRoomConfig } from './room-config.js';

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
    newRole: ParticipantRole;
    secret?: string;
    timestamp: number;
}

export type MeetSignalPayload = MeetRoomConfigUpdatedPayload | MeetParticipantRoleUpdatedPayload;
