import { MeetRoomMemberPermissions } from '@openvidu-meet/typings';

export interface PermissionItem {
	key: keyof MeetRoomMemberPermissions;
	/** i18n key — resolve with the `translate` pipe at render. */
	label: string;
	/** i18n key — resolve with the `translate` pipe at render. */
	description: string;
	icon: string;
}

export interface PermissionGroup {
	/** i18n key — resolve with the `translate` pipe at render. */
	label: string;
	icon: string;
	permissions: PermissionItem[];
}

// Labels/descriptions are translation KEYS (resolved at render via the `translate` pipe), not literal
// text — so the permissions UI follows the active language.
export const PERMISSION_GROUPS: PermissionGroup[] = [
	{
		label: 'ROOM_MEMBERS.PERMISSIONS.GROUPS.MEETING',
		icon: 'groups',
		permissions: [
			{
				key: 'meetingJoin',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.meetingJoin.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.meetingJoin.DESCRIPTION',
				icon: 'login'
			},
			{
				key: 'meetingRead',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.meetingRead.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.meetingRead.DESCRIPTION',
				icon: 'monitoring'
			},
			{
				key: 'meetingEnd',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.meetingEnd.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.meetingEnd.DESCRIPTION',
				icon: 'meeting_room'
			},
			{
				key: 'participantPromote',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.participantPromote.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.participantPromote.DESCRIPTION',
				icon: 'manage_accounts'
			},
			{
				key: 'participantKick',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.participantKick.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.participantKick.DESCRIPTION',
				icon: 'person_remove'
			},
			{
				key: 'roomShareAccessLinks',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.roomShareAccessLinks.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.roomShareAccessLinks.DESCRIPTION',
				icon: 'link'
			}
		]
	},
	{
		label: 'ROOM_MEMBERS.PERMISSIONS.GROUPS.MEDIA',
		icon: 'perm_media',
		permissions: [
			{
				key: 'mediaPublishVideo',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.mediaPublishVideo.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.mediaPublishVideo.DESCRIPTION',
				icon: 'videocam'
			},
			{
				key: 'mediaPublishAudio',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.mediaPublishAudio.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.mediaPublishAudio.DESCRIPTION',
				icon: 'mic'
			},
			{
				key: 'mediaShareScreen',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.mediaShareScreen.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.mediaShareScreen.DESCRIPTION',
				icon: 'screen_share'
			},
			{
				key: 'mediaChangeVirtualBackground',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.mediaChangeVirtualBackground.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.mediaChangeVirtualBackground.DESCRIPTION',
				icon: 'background_replace'
			}
		]
	},
	{
		label: 'ROOM_MEMBERS.PERMISSIONS.GROUPS.RECORDINGS',
		icon: 'video_library',
		permissions: [
			{
				key: 'recordingControl',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.recordingControl.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.recordingControl.DESCRIPTION',
				icon: 'fiber_manual_record'
			},
			{
				key: 'recordingList',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.recordingList.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.recordingList.DESCRIPTION',
				icon: 'video_library'
			},
			{
				key: 'recordingPlay',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.recordingPlay.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.recordingPlay.DESCRIPTION',
				icon: 'play_circle'
			},
			{
				key: 'recordingDownload',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.recordingDownload.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.recordingDownload.DESCRIPTION',
				icon: 'download'
			},
			{
				key: 'recordingDelete',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.recordingDelete.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.recordingDelete.DESCRIPTION',
				icon: 'delete'
			}
		]
	},
	{
		label: 'ROOM_MEMBERS.PERMISSIONS.GROUPS.CHAT',
		icon: 'chat',
		permissions: [
			{
				key: 'chatRead',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.chatRead.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.chatRead.DESCRIPTION',
				icon: 'visibility'
			},
			{
				key: 'chatWrite',
				label: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.chatWrite.LABEL',
				description: 'ROOM_MEMBERS.PERMISSIONS.ITEMS.chatWrite.DESCRIPTION',
				icon: 'edit'
			}
		]
	}
];
