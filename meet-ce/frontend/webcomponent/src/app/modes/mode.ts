/**
 * Virtual route dispatch for the OpenVidu Meet Web Component.
 *
 * The SPA serves three URL shapes via Angular Router (`/room/:id`,
 * `/room/:id/recordings`, `/recording/:id`). The Web Component has no router,
 * so the same dispatch is recovered from custom-element attributes by
 * {@link resolveMode}.
 */

/** Mutually-exclusive operating modes supported by `<openvidu-meet>`. */
export type Mode = 'meeting' | 'room-recordings' | 'single-recording' | 'invalid';

/** Snapshot of the Web Component inputs that influence mode resolution + bootstrap. */
export interface ModeInputs {
	roomUrl: string;
	recordingUrl: string;
	participantName: string;
	e2eeKey: string;
	leaveRedirectUrl: string;
	showOnlyRecordings: boolean;
	showRecording: string;
}

/**
 * Pure mapping from inputs to mode. Documented as a table to make the
 * precedence rules obvious at the call site:
 *
 * | Inputs                                          | Mode               |
 * | ----------------------------------------------- | ------------------ |
 * | `recording-url` or `show-recording` present     | `single-recording` |
 * | `room-url` + `show-only-recordings`             | `room-recordings`  |
 * | `room-url` only                                 | `meeting`          |
 * | none of the above                               | `invalid`          |
 */
export function resolveMode(inputs: ModeInputs): Mode {
	if (inputs.recordingUrl || inputs.showRecording) return 'single-recording';
	if (inputs.roomUrl && inputs.showOnlyRecordings) return 'room-recordings';
	if (inputs.roomUrl) return 'meeting';
	return 'invalid';
}
