import { computed, Service, signal } from '@angular/core';
import { ElapsedClock } from '../../../../../shared/utils/elapsed-clock';
import { RecordingState, RecordingStateInfo } from '../../models/recording.model';

@Service()
export class RecordingService {
	private readonly clock = new ElapsedClock();
	private recordingStartTimestamp: number | null = null;
	private readonly state = signal<Omit<RecordingStateInfo, 'elapsed'>>({ status: RecordingState.STOPPED });

	/**
	 * Recording state signal which emits the recording state in every update.
	 */
	readonly recordingStatus = computed<RecordingStateInfo>(() => ({ ...this.state(), elapsed: this.clock.elapsed() }));

	/**
	 * Sets the recording as **started** at the given instant, from which its elapsed time counts.
	 * @internal
	 */
	setRecordingStarted(id: string, startDate: number) {
		this.recordingStartTimestamp = startDate;
		this.state.set({ id, status: RecordingState.STARTED });
		this.clock.start(startDate);
	}

	/**
	 * Stops the elapsed time and sets the recording as **stopped**.
	 * @internal
	 */
	setRecordingStopped() {
		this.clock.stop();
		this.state.set({ status: RecordingState.STOPPED, error: undefined });
		this.recordingStartTimestamp = null;
	}

	/**
	 * Puts a recording that failed to stop back into **started**, keeping the instant it actually
	 * began. The caller cannot supply that instant: what it can reach is the elapsed time, which is
	 * an offset from zero, not a timestamp.
	 */
	restoreRecordingStarted() {
		const { id } = this.state();

		if (!id) return;

		this.setRecordingStarted(id, this.recordingStartTimestamp ?? Date.now());
	}

	/**
	 * Set the {@link RecordingState} to **starting**.
	 * The `started` stastus will be updated automatically when the recording is actually started.
	 *
	 * A recording that is already running stays as it is: the start of a recording is reported by
	 * one webhook and its activation by another, and a webhook that arrives late must not walk the
	 * meeting back to a state the recording has already left.
	 */
	setRecordingStarting(id: string) {
		const { status } = this.state();

		if (status === RecordingState.STARTED || status === RecordingState.STOPPING) return;

		this.state.set({ id, status: RecordingState.STARTING });
	}

	/**
	 * @internal
	 * @param error
	 */
	setRecordingFailed(error: string) {
		this.clock.stop();
		this.state.set({ status: RecordingState.FAILED, error });
	}

	/**
	 * Set the {@link RecordingState} to **stopping**.
	 * The `stopped` stastus will be updated automatically when the recording is actually stopped.
	 */
	setRecordingStopping() {
		this.state.update((state) => ({ ...state, status: RecordingState.STOPPING }));
	}
}
