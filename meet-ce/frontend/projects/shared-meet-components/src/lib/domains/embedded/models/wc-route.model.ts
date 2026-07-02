import { LeftEventReason } from '@openvidu-meet/typings';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';

/**
 * The set of views the webcomponent can render. Each name maps one-to-one to a
 * template `@case` in the WC shell and (for the guarded routes) to an entry service.
 *
 * This is the WC analog of the SPA's route paths: the WC has no Angular Router, so
 * {@link WcRouterService} drives view selection from a single current {@link WcRoute}.
 */
export enum WcRouteName {
	MEETING = 'meeting',
	SINGLE_RECORDING = 'single-recording',
	ROOM_RECORDINGS = 'room-recordings',
	LOGIN = 'login',
	CHANGE_PASSWORD = 'change-password',
	DISCONNECTED = 'disconnected',
	ERROR = 'error',
	INVALID = 'invalid'
}

/** Meeting room view (`/room/:room-id`). Params mirror {@link MeetingEntryParams}. */
export interface MeetingRoute {
	name: WcRouteName.MEETING;
	params: {
		roomId: string;
		secret?: string;
		e2eeKey?: string;
		participantName?: string;
		leaveRedirectUrl?: string;
	};
}

/** Single-recording view (`/recording/:recording-id`). Params mirror {@link RecordingEntryParams}. */
export interface SingleRecordingRoute {
	name: WcRouteName.SINGLE_RECORDING;
	params: { recordingId: string; recordingSecret?: string; roomSecret?: string };
}

/** Room-recordings list view (`/room/:room-id/recordings`). Params mirror {@link RoomRecordingsEntryParams}. */
export interface RoomRecordingsRoute {
	name: WcRouteName.ROOM_RECORDINGS;
	params: { roomId: string; secret?: string };
}

/** Login view. `redirectTo` is the SPA-style path to resume after a successful login. */
export interface LoginRoute {
	name: WcRouteName.LOGIN;
	params: { redirectTo?: string };
}

/** Mandatory password-change view. `redirectTo` is the path to resume afterwards. */
export interface ChangePasswordRoute {
	name: WcRouteName.CHANGE_PASSWORD;
	params: { redirectTo?: string };
}

/** Post-meeting "you left" view (`/disconnected`). */
export interface DisconnectedRoute {
	name: WcRouteName.DISCONNECTED;
	params: { reason: LeftEventReason };
}

/** Error view (`/error`). */
export interface ErrorRoute {
	name: WcRouteName.ERROR;
	params: { reason: NavigationErrorReason };
}

/** No usable configuration (no `room-url`/`recording-url`). */
export interface InvalidRoute {
	name: WcRouteName.INVALID;
	params: { message: string };
}

/** Any view the WC shell can render, with its typed params. */
export type WcRoute =
	| MeetingRoute
	| SingleRecordingRoute
	| RoomRecordingsRoute
	| LoginRoute
	| ChangePasswordRoute
	| DisconnectedRoute
	| ErrorRoute
	| InvalidRoute;

/** Lifecycle of the route currently being entered. */
export type WcRouteStatus = 'running' | 'ready' | 'error';
