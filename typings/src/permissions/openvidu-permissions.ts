/**
 * Defines OpenVidu-specific permissions for a participant.
 */
export interface OpenViduMeetPermissions {
    canRecord: boolean; // Can start/stop recording the room.
    canChat: boolean; // Can send chat messages in the room.
    canChangeVirtualBackground: boolean; // Can change the virtual background.
}

export interface RecordingPermissions {
    canRetrieveRecordings: boolean; // Can list and play recordings.
    canDeleteRecordings: boolean; // Can delete recordings.
}
