import { inject, Service, signal } from '@angular/core';
import { RecordingState, RecordingStateInfo } from '../../models/recording.model';
import { ActionService } from '../action/action.service';
import { MeetingUiConfigService } from '../config/meeting-ui-config.service';
import { LoggerService } from '../../../../../shared/services/logger.service';

@Service()
export class RecordingService {
	private readonly actionService = inject(ActionService);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly log = inject(LoggerService).get('RecordingService');

	private recordingTimeInterval: ReturnType<typeof setInterval> | undefined = undefined;
	private recordingStartTimestamp: number | null = null;

	/**
	 * Recording state signal which emits the recording state in every update.
	 */
	readonly recordingStatus = signal<RecordingStateInfo>({
		status: RecordingState.STOPPED,
		elapsed: new Date(0, 0, 0, 0, 0, 0)
	});
	/**
	 * Initializes the recording status with the given parameters and the timer to calculate the elapsed time.
	 * @internal
	 */
	setRecordingStarted(id: string, startDate: number) {
		// Determine the actual start timestamp of the recording
		this.recordingStartTimestamp = startDate;

		// Calculate the elapsed time based on the actual start timestamp
		const elapsed = new Date(0, 0, 0, 0, 0, 0);

		if (this.recordingStartTimestamp) {
			const elapsedSeconds = Math.floor((Date.now() - this.recordingStartTimestamp) / 1000);
			elapsed.setSeconds(Math.max(0, elapsedSeconds));
		}

		this.updateStatus({
			id,
			status: RecordingState.STARTED,
			elapsed
		});

		// Start the timer after updating the initial state
		this.startRecordingTimer();
	}

	/**
	 * Stops the recording timer and updates the recording status to **stopped**.
	 * @internal
	 */
	setRecordingStopped() {
		this.stopRecordingTimer();

		this.updateStatus({
			status: RecordingState.STOPPED,
			elapsed: new Date(0, 0, 0, 0, 0, 0),
			error: undefined
		});

		this.recordingStartTimestamp = null;
	}

	/**
	 * Puts a recording that failed to stop back into **started**, keeping the instant it actually
	 * began. The caller cannot supply that instant: what it can reach is the elapsed time, which is
	 * an offset from zero, not a timestamp.
	 */
	restoreRecordingStarted() {
		const { id } = this.recordingStatus();

		if (!id) return;

		this.setRecordingStarted(id, this.recordingStartTimestamp ?? Date.now());
	}

	/**
	 * Set the {@link RecordingState} to **starting**.
	 * The `started` stastus will be updated automatically when the recording is actually started.
	 */
	setRecordingStarting(id: string) {
		const { elapsed } = this.recordingStatus();
		this.updateStatus({
			id,
			status: RecordingState.STARTING,
			elapsed
		});
	}

	/**
	 * @internal
	 * @param error
	 */
	setRecordingFailed(error: string) {
		this.stopRecordingTimer();
		const { elapsed } = this.recordingStatus();
		const statusInfo: RecordingStateInfo = {
			status: RecordingState.FAILED,
			elapsed,
			error
		};
		this.updateStatus(statusInfo);
	}

	/**
	 * Set the {@link RecordingState} to **stopping**.
	 * The `stopped` stastus will be updated automatically when the recording is actually stopped.
	 */
	setRecordingStopping() {
		this.updateStatus({
			...this.recordingStatus(),
			status: RecordingState.STOPPING
		});
	}

	/**
	 * Updates the recording status.
	 * @param status {@link RecordingState}
	 */
	private updateStatus(statusInfo: RecordingStateInfo) {
		this.recordingStatus.set(statusInfo);
	}

	private startRecordingTimer() {
		// Don't override the timestamp if it's already set correctly
		if (this.recordingStartTimestamp === null) {
			this.recordingStartTimestamp = Date.now();
		}

		if (this.recordingTimeInterval) {
			clearInterval(this.recordingTimeInterval);
		}

		this.recordingTimeInterval = setInterval(() => {
			if (!this.recordingStartTimestamp) return;

			// Calculate elapsed time based on the actual recording start timestamp
			const elapsedSeconds = Math.floor((Date.now() - this.recordingStartTimestamp) / 1000);
			const elapsed = new Date(0, 0, 0, 0, 0, 0);
			elapsed.setSeconds(Math.max(0, elapsedSeconds)); // Ensure non-negative

			const currentStatus = this.recordingStatus();
			const { status, id } = currentStatus;
			this.updateStatus({
				id,
				status,
				elapsed
			});
		}, 1000);
	}

	private stopRecordingTimer() {
		if (this.recordingTimeInterval) {
			clearInterval(this.recordingTimeInterval);
		}

		const { status, error, id } = this.recordingStatus();
		const statusInfo: RecordingStateInfo = {
			id,
			status,
			elapsed: new Date(0, 0, 0, 0, 0, 0), // Reset elapsed time when stopped
			error
		};
		this.updateStatus(statusInfo);
	}
}
