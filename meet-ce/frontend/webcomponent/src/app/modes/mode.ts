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

export function resolveMode(inputs: ModeInputs): Mode {
	if (inputs.recordingUrl || inputs.showRecording) return 'single-recording';

	if (inputs.roomUrl && inputs.showOnlyRecordings) return 'room-recordings';

	if (inputs.roomUrl) return 'meeting';

	return 'invalid';
}
