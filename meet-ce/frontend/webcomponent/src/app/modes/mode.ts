import { type WcNavigationRequest, WebComponentNavigationType } from '@openvidu-meet/shared-components';
import type { WebComponentPropertyValues } from '@openvidu-meet/typings';

export type Mode = 'meeting' | 'room-recordings' | 'single-recording' | 'login' | 'change-password' | 'invalid';

/**
 * The view each navigation request maps to. Exhaustive over
 * {@link WebComponentNavigationType}, so adding a request type is a compile
 * error until its mode is declared here.
 */
const MODE_BY_REQUEST_TYPE: Record<WebComponentNavigationType, Mode> = {
	[WebComponentNavigationType.VIEW_RECORDINGS]: 'room-recordings',
	[WebComponentNavigationType.LOGIN]: 'login',
	[WebComponentNavigationType.CHANGE_PASSWORD]: 'change-password'
};

/**
 * The view an active navigation request overrides the shell to, or `null` when
 * there is no request (the rendered view then comes from {@link modeFromAttributes}).
 */
export function modeFromRequest(request: WcNavigationRequest | null): Mode | null {
	return request ? MODE_BY_REQUEST_TYPE[request.type] : null;
}

/**
 * The primary view derived from the public webcomponent attributes — the one the
 * shell bootstraps and falls back to when no navigation request is active.
 */
export function modeFromAttributes(inputs: Required<WebComponentPropertyValues>): Mode {
	const { roomUrl, recordingUrl, showRecording, showOnlyRecordings } = inputs;

	if (recordingUrl || showRecording) return 'single-recording';

	if (roomUrl) return showOnlyRecordings ? 'room-recordings' : 'meeting';

	return 'invalid';
}
