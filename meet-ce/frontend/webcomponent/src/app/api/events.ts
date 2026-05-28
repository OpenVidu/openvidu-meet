/**
 * Event detail interfaces — public API of the `<openvidu-meet>` custom element.
 *
 * Mirrors the shapes defined in `contracts/openvidu-meet.contract.js` and
 * generated into `src/webcomponents-types/openvidu-meet.d.ts`. Kept here as
 * concrete TypeScript types so internal modules (App, bootstrappers) can
 * import them without crossing into the auto-generated declarations file.
 */

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

/**
 * Fired after the WC's post-meeting/post-recording UI has finished and the
 * host can safely unmount the element (or perform the `leave-redirect-url`
 * redirect). Payload is intentionally empty.
 */
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
