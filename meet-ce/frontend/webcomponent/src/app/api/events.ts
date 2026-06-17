import type { NavigationErrorReason } from '@openvidu-meet/shared-components';

export interface OpenViduMeetJoinedDetail {
	roomId: string;
	participantIdentity: string;
}

export interface OpenViduMeetLeftDetail {
	roomId: string;
	participantIdentity: string;
	reason: string;
}

/** Emitted after the post-meeting/post-recording UI completes; host can safely unmount the element. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface OpenViduMeetClosedDetail {}

export type OpenViduMeetErrorReason =
	| 'invalid-config'
	| 'invalid-room-url'
	| 'invalid-recording-id'
	| 'access-denied'
	| 'auth-required'
	| 'unknown';

export interface OpenViduMeetErrorDetail {
	reason: OpenViduMeetErrorReason;
	message: string;
	/** When reason='access-denied', the underlying use-case reason. */
	accessReason?: NavigationErrorReason;
}
