import { Injectable, inject } from '@angular/core';
import type { ModeBootstrapResult, ModeBootstrapper } from './bootstrappers/bootstrapper';
import { MeetingModeBootstrapper } from './bootstrappers/meeting.bootstrapper';
import { RoomRecordingsModeBootstrapper } from './bootstrappers/room-recordings.bootstrapper';
import { SingleRecordingModeBootstrapper } from './bootstrappers/single-recording.bootstrapper';
import type { Mode, ModeInputs } from './mode';

@Injectable({ providedIn: 'root' })
export class ModeCoordinatorService {
	private readonly registry = new Map<Mode, ModeBootstrapper>([
		['meeting', inject(MeetingModeBootstrapper)],
		['single-recording', inject(SingleRecordingModeBootstrapper)],
		['room-recordings', inject(RoomRecordingsModeBootstrapper)]
	]);

	async run(mode: Mode, inputs: ModeInputs): Promise<ModeBootstrapResult> {
		const bootstrapper = this.registry.get(mode);

		if (!bootstrapper) {
			return {
				kind: 'error',
				detail: {
					reason: 'invalid-config',
					message: 'Please provide a "room-url" or "recording-url" attribute to embed OpenVidu Meet.'
				}
			};
		}

		return bootstrapper.bootstrap(inputs);
	}
}
