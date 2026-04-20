import { inject, Injectable, signal } from '@angular/core';
import { ILogger } from '../../models/logger.model';
import { RecordingInfo, RecordingState, RecordingStateInfo } from '../../models/recording.model';
import { ActionService } from '../action/action.service';
import { OpenViduComponentsConfigService } from '../config/directive-config.service';
import { LoggerService } from '../logger/logger.service';

@Injectable({
	providedIn: 'root'
})
export class RecordingService {
	private readonly actionService = inject(ActionService);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly loggerService = inject(LoggerService);

	private recordingTimeInterval: ReturnType<typeof setInterval> | undefined = undefined;
	private recordingStartTimestamp: number | null = null;

	/**
	 * Recording state signal which emits the recording state in every update.
	 */
	readonly recordingState = signal<RecordingStateInfo>({
		status: RecordingState.STOPPED,
		recordingList: [] as RecordingInfo[],
		startedAt: new Date(0, 0, 0, 0, 0, 0)
	});
	private log: ILogger = {
		d: () => {},
		v: () => {},
		w: () => {},
		e: () => {}
	};

	/**
	 * @internal
	 */
	constructor() {
		this.log = this.loggerService.get('RecordingService');
	}

	/**
	 * Initializes the recording status with the given parameters and the timer to calculate the elapsed time.
	 * @internal
	 */
	setRecordingStarted(recordingInfo?: RecordingInfo, startTimestamp?: number) {
		// Determine the actual start timestamp of the recording
		// Priority: startTimestamp parameter > recordingInfo.startedAt > current time
		this.recordingStartTimestamp = startTimestamp || recordingInfo?.startedAt || Date.now();

		const { recordingList } = this.recordingState();
		let updatedRecordingList = [...recordingList];

		if (recordingInfo) {
			const existingIndex = updatedRecordingList.findIndex((recording) => recording.id === recordingInfo.id);
			if (existingIndex !== -1) {
				// Replace existing recording info
				updatedRecordingList[existingIndex] = recordingInfo;
			} else {
				// Add new recording info
				updatedRecordingList = [recordingInfo, ...updatedRecordingList];
			}
		}

		// Calculate the elapsed time based on the actual start timestamp
		const recordingElapsedTime = new Date(0, 0, 0, 0, 0, 0);
		if (this.recordingStartTimestamp) {
			const elapsedSeconds = Math.floor((Date.now() - this.recordingStartTimestamp) / 1000);
			recordingElapsedTime.setSeconds(Math.max(0, elapsedSeconds)); // Ensure non-negative
		}

		this.updateStatus({
			status: RecordingState.STARTED,
			recordingList: updatedRecordingList,
			startedAt: recordingElapsedTime
		});

		// Start the timer after updating the initial state
		this.startRecordingTimer();
	}

	/**
	 * Stops the recording timer and updates the recording status to **stopped**.
	 * @internal
	 */
	setRecordingStopped(recordingInfo?: RecordingInfo) {
		this.stopRecordingTimer();
		const { recordingList } = this.recordingState();
		let updatedRecordingList = [...recordingList];

		// Update the recording list with the new recording info
		if (recordingInfo) {
			const existingIndex = updatedRecordingList.findIndex((recording) => recording.id === recordingInfo.id);
			if (existingIndex !== -1) {
				updatedRecordingList[existingIndex] = recordingInfo;
			} else {
				updatedRecordingList = [recordingInfo, ...updatedRecordingList];
			}
		}

		this.updateStatus({
			status: RecordingState.STOPPED,
			recordingList: updatedRecordingList,
			startedAt: new Date(0, 0, 0, 0, 0, 0)
		});

		this.recordingStartTimestamp = null;
	}

	/**
	 * Set the {@link RecordingState} to **starting**.
	 * The `started` stastus will be updated automatically when the recording is actually started.
	 */
	setRecordingStarting() {
		const { recordingList, startedAt } = this.recordingState();
		this.updateStatus({
			status: RecordingState.STARTING,
			recordingList,
			startedAt
		});
	}

	/**
	 * @internal
	 * @param error
	 */
	setRecordingFailed(error: string) {
		this.stopRecordingTimer();
		const { startedAt, recordingList } = this.recordingState();
		const statusInfo: RecordingStateInfo = {
			status: RecordingState.FAILED,
			recordingList,
			startedAt,
			error
		};
		this.updateStatus(statusInfo);
	}

	/**
	 * Set the {@link RecordingState} to **stopping**.
	 * The `stopped` stastus will be updated automatically when the recording is actually stopped.
	 */
	setRecordingStopping() {
		const { startedAt, recordingList } = this.recordingState();

		this.updateStatus({
			status: RecordingState.STOPPING,
			recordingList,
			startedAt
		});
	}

	/**
	 * @internal
	 * Play the recording blob received as parameter. This parameter must be obtained from backend using the OpenVidu REST API
	 */
	playRecording(recording: RecordingInfo) {
		// Only COMPOSED recording is supported. The extension will allways be 'mp4'.
		this.log.d('Playing recording', recording);
		const queryParamForAvoidCache = `?t=${new Date().getTime()}`;
		const baseUrl = this.libService.getRecordingStreamBaseUrl();
		let streamRecordingUrl = '';
		if (baseUrl === 'call/api/recordings/') {
			// Keep the compatibility with the old version
			streamRecordingUrl = `${baseUrl}${recording.id}/stream${queryParamForAvoidCache}`;
		} else {
			streamRecordingUrl = `${baseUrl}${recording.id}/media${queryParamForAvoidCache}`;
		}
		this.actionService.openRecordingPlayerDialog(streamRecordingUrl);
	}

	/**
	 * @internal
	 * Download the the recording file received .
	 * @param recording
	 */
	downloadRecording(recording: RecordingInfo) {
		// Only COMPOSED recording is supported. The extension will allways be 'mp4'.
		const queryParamForAvoidCache = `?t=${new Date().getTime()}`;
		const link = document.createElement('a');
		const baseUrl = this.libService.getRecordingStreamBaseUrl();
		if (baseUrl === 'call/api/recordings/') {
			// Keep the compatibility with the old version
			link.href = `${baseUrl}${recording.id}/stream${queryParamForAvoidCache}`;
		} else {
			link.href = `${baseUrl}${recording.id}/media${queryParamForAvoidCache}`;
		}
		link.download = recording.filename || 'openvidu-recording.mp4';
		link.dispatchEvent(
			new MouseEvent('click', {
				bubbles: true,
				cancelable: true,
				view: window
			})
		);
		// For Firefox it is necessary to delay revoking the ObjectURL
		setTimeout(() => link.remove(), 100);
	}

	/**
	 * Deletes a recording from the recording list.
	 *
	 * @param recording - The recording to be deleted.
	 * @internal
	 */
	deleteRecording(recording: RecordingInfo) {
		const { recordingList, status, startedAt } = this.recordingState();
		const updatedList = recordingList.filter((item) => item.id !== recording.id);

		if (updatedList.length !== recordingList.length) {
			this.updateStatus({
				status,
				recordingList: updatedList,
				startedAt
			});
			return true;
		}
		return false;
	}

	/**
	 *
	 * @param recordings
	 * @internal
	 */
	setRecordingList(recordings: RecordingInfo[]) {
		const { status, startedAt, error } = this.recordingState();
		this.updateStatus({
			status,
			recordingList: recordings,
			startedAt,
			error
		});
	}

	/**
	 * Updates the recording status.
	 * @param status {@link RecordingState}
	 */
	private updateStatus(statusInfo: RecordingStateInfo) {
		const { status, recordingList, error, startedAt } = statusInfo;
		this.recordingState.set({
			status,
			recordingList,
			startedAt,
			error
		});
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
			const startedAt = new Date(0, 0, 0, 0, 0, 0);
			startedAt.setSeconds(Math.max(0, elapsedSeconds)); // Ensure non-negative

			const { recordingList, status } = this.recordingState();
			this.updateStatus({
				status,
				recordingList,
				startedAt
			});
		}, 1000);
	}

	private stopRecordingTimer() {
		if (this.recordingTimeInterval) {
			clearInterval(this.recordingTimeInterval);
		}
		const { recordingList, status, error } = this.recordingState();
		const statusInfo: RecordingStateInfo = {
			status,
			recordingList,
			startedAt: new Date(0, 0, 0, 0, 0, 0), // Reset elapsed time when stopped
			error
		};
		this.updateStatus(statusInfo);
	}
}
