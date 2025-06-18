/**
 * Defines OpenVidu-specific permissions for a participant.
 */
export interface OpenViduMeetPermissions {
    canPublishScreen: boolean; // Can publish screen sharing.

    // Permissions for recording
    canRecord: boolean; // Can start/stop recording the room.

    // Permissions for chat
    canChat: boolean; // Can send chat messages in the room.

    canChangeVirtualBackground: boolean; // Can change the virtual background.
}

export interface RecordingPermissions {
    canRetrieveRecordings: boolean; // Can list and play recordings.
    canDeleteRecordings: boolean; // Can delete recordings.
}
