import { Injectable, inject } from '@angular/core';
import type { ModeBootstrapResult } from './bootstrappers/bootstrapper';
import { MeetingModeBootstrapper } from './bootstrappers/meeting.bootstrapper';
import { RoomRecordingsModeBootstrapper } from './bootstrappers/room-recordings.bootstrapper';
import { SingleRecordingModeBootstrapper } from './bootstrappers/single-recording.bootstrapper';
import type { Mode, ModeInputs } from './mode';

/**
 * Selects the correct bootstrapper for the active mode and runs it. The App
 * component depends on this service rather than on the per-mode services /
 * bootstrappers directly — adding a new mode means writing a new bootstrapper
 * and adding one case here, with no changes elsewhere.
 *
 * The `invalid` branch is handled here too so the App's effect just calls
 * `run(mode, inputs)` and gets a uniform result back.
 */
@Injectable({ providedIn: 'root' })
export class ModeCoordinatorService {
	private readonly meeting = inject(MeetingModeBootstrapper);
	private readonly singleRecording = inject(SingleRecordingModeBootstrapper);
	private readonly roomRecordings = inject(RoomRecordingsModeBootstrapper);

	async run(mode: Mode, inputs: ModeInputs): Promise<ModeBootstrapResult> {
		switch (mode) {
			case 'meeting':
				return this.meeting.bootstrap(inputs);
			case 'single-recording':
				return this.singleRecording.bootstrap(inputs);
			case 'room-recordings':
				return this.roomRecordings.bootstrap(inputs);
			case 'invalid':
				return {
					kind: 'error',
					detail: {
						reason: 'invalid-config',
						message: 'Please provide a "room-url" or "recording-url" attribute to embed OpenVidu Meet.'
					}
				};
		}
	}
}
