import type { NavigationErrorReason } from '@openvidu-meet/shared-components';

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
