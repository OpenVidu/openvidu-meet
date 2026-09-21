import { Service, signal } from '@angular/core';
import type { MeetingViewPhase } from '../../models/meeting-view-state.model';

/**
 * The phase of the meeting view, written by the view and read by whoever has to know it, such as
 * the embedded command bridge deciding which commands the participant can be sent right now.
 */
@Service()
export class MeetingPhaseService {
	private readonly _phase = signal<MeetingViewPhase>('loading');

	readonly phase = this._phase.asReadonly();

	set(phase: MeetingViewPhase): void {
		this._phase.set(phase);
	}
}
