/**
 * Defines Meet-specific permissions for a room member.
 */
export interface MeetPermissions {
    canRecord: boolean; // Can start/stop recording the meeting.
    canRetrieveRecordings: boolean; // Can list and play recordings.
    canDeleteRecordings: boolean; // Can delete recordings.
    canChat: boolean; // Can send chat messages in the meeting.
    canChangeVirtualBackground: boolean; // Can change the virtual background.
}
