export type Mode = 'meeting' | 'room-recordings' | 'single-recording' | 'invalid';

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
 * Maps the public webcomponent attributes to the view the shell should render.
 */
export function computeMode(inputs: ModeInputs): Mode {
	const { roomUrl, recordingUrl, showRecording, showOnlyRecordings } = inputs;

	if (recordingUrl || showRecording) return 'single-recording';

	if (roomUrl) return showOnlyRecordings ? 'room-recordings' : 'meeting';

	return 'invalid';
}
