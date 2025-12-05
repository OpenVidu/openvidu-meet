/**
 * Defines permissions for a room member.
 */
export interface MeetRoomMemberPermissions {
    canRecord: boolean; // Can start/stop recording the meeting.
    canRetrieveRecordings: boolean; // Can list and play recordings.
    canDeleteRecordings: boolean; // Can delete recordings.

    canJoinMeeting: boolean; // Can join the meeting.

    canShareAccessLinks: boolean; // Can share access links to invite others.
    canMakeModerator: boolean; // Can promote other participants to moderator role.
    canKickParticipants: boolean; // Can remove other participants from the meeting.
    canEndMeeting: boolean; // Can end the meeting for all participants.

    canPublishVideo: boolean; // Can publish video in the meeting.
    canPublishAudio: boolean; // Can publish audio in the meeting.
    canShareScreen: boolean; // Can share screen in the meeting.

    canReadChat: boolean; // Can read chat messages in the meeting.
    canWriteChat: boolean; // Can send chat messages in the meeting.

    canChangeVirtualBackground: boolean; // Can change the virtual background.
}
