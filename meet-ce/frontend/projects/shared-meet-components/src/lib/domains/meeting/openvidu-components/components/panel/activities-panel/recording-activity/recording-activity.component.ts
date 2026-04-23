import { ChangeDetectionStrategy, ChangeDetectorRef, Component, effect, inject, input, OnInit, output, signal } from '@angular/core';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ILogger } from '../../../../models/logger.model';
import {
	RecordingDeleteRequestedEvent,
	RecordingDownloadClickedEvent,
	RecordingInfo,
	RecordingPlayClickedEvent,
	RecordingStartRequestedEvent,
	RecordingState,
	RecordingStopRequestedEvent
} from '../../../../models/recording.model';
import { ActionService } from '../../../../services/action/action.service';
import { OpenViduComponentsConfigService } from '../../../../services/config/directive-config.service';
import { LoggerService } from '../../../../services/logger/logger.service';
import { OpenViduService } from '../../../../services/openvidu/openvidu.service';
import { ParticipantService } from '../../../../services/participant/participant.service';
import { RecordingService } from '../../../../services/recording/recording.service';
import { TranslatePipe } from '../../../../pipes/translate.pipe';

/**
 * The **RecordingActivityComponent** is the component that allows showing the recording activity.
 */
@Component({
	selector: 'ov-recording-activity',
	imports: [MatButtonModule, MatDividerModule, MatExpansionModule, MatIconModule, MatListModule, MatTooltipModule, TranslatePipe, UpperCasePipe, DatePipe],
	templateUrl: './recording-activity.component.html',
	styleUrls: ['./recording-activity.component.scss', '../activities-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})

// TODO: Allow to add more than one recording type
// TODO: Allow to choose the layout of the recording
export class RecordingActivityComponent implements OnInit {
	/**
	 * @internal
	 */
	expanded = input(false);

	/**
	 * This event is fired when the user clicks on the start recording button.
	 * It provides the {@link RecordingStartRequestedEvent} payload as event data.
	 */
	onRecordingStartRequested = output<RecordingStartRequestedEvent>();

	/**
	 * Provides event notifications that fire when stop recording button has been clicked.
	 * It provides the {@link RecordingStopRequestedEvent} payload as event data.
	 */
	onRecordingStopRequested = output<RecordingStopRequestedEvent>();

	/**
	 * Provides event notifications that fire when delete recording button has been clicked.
	 * It provides the {@link RecordingDeleteRequestedEvent} payload as event data.
	 */
	onRecordingDeleteRequested = output<RecordingDeleteRequestedEvent>();

	/**
	 * Provides event notifications that fire when download recording button has been clicked.
	 * It provides the {@link RecordingDownloadClickedEvent} payload as event data.
	 */
	onRecordingDownloadClicked = output<RecordingDownloadClickedEvent>();

	/**
	 * Provides event notifications that fire when play recording button has been clicked.
	 * It provides the {@link RecordingPlayClickedEvent} payload as event data.
	 */
	onRecordingPlayClicked = output<RecordingPlayClickedEvent>();

	/**
	 * @internal
	 * Provides event notifications that fire when view recordings button has been clicked.
	 * This event is triggered when the user wants to view all recordings in an external page.
	 */
	onViewRecordingsClicked = output<void>();

	/**
	 * @internal
	 * This event is fired when the user clicks on the view recording button.
	 * It provides the recording ID as event data.
	 */
	onViewRecordingClicked = output<string>();

	/**
	 * @internal
	 */
	readonly recordingStatus = signal(RecordingState.STOPPED);
	/**
	 * @internal
	 */
	readonly oldRecordingStatus = signal(RecordingState.STOPPED);
	/**
	 * @internal
	 */
	readonly isPanelOpened = signal(false);

	/**
	 * @internal
	 */
	recStatusEnum = RecordingState;

	/**
	 * @internal
	 */
	readonly recordingAlive = signal(false);
	/**
	 * @internal
	 */
	readonly recordingList = signal<RecordingInfo[]>([]);

	/**
	 * @internal
	 */
	readonly recordingError = signal<any>(undefined);

	/**
	 * @internal
	 */
	readonly hasRoomTracksPublished = signal(false);

	/**
	 * @internal
	 */
	readonly mouseHovering = signal(false);
	private readonly libService = inject(OpenViduComponentsConfigService);

	/**
	 * @internal
	 */
	readonly isReadOnlyMode = this.libService.recordingActivityReadOnlySignal;

	/**
	 * @internal
	 */
	readonly viewButtonText = signal('PANEL.RECORDING.VIEW');

	/**
	 * @internal
	 */
	readonly showStartStopRecordingButton = this.libService.recordingActivityStartStopRecordingButtonSignal;

	/**
	 * @internal
	 */
	readonly showViewRecordingsButton = this.libService.recordingActivityViewRecordingsButtonSignal;

	/**
	 * @internal
	 */
	readonly showRecordingList = this.libService.recordingActivityShowRecordingsListSignal; // Controls visibility of the recording list in the panel

	/**
	 * @internal
	 */
	readonly showControls = this.libService.recordingActivityShowControlsSignal;

	private log: ILogger = {
		d: () => {},
		v: () => {},
		w: () => {},
		e: () => {}
	};

	/**
	 * @internal
	 */
	private readonly recordingService = inject(RecordingService);
	private readonly participantService = inject(ParticipantService);
	private readonly actionService = inject(ActionService);
	private readonly openviduService = inject(OpenViduService);
	private readonly cd = inject(ChangeDetectorRef);
	private readonly loggerSrv = inject(LoggerService);
	private readonly recordingStatusEffect = effect(() => {
		const event = this.recordingService.recordingState();
		const { status, recordingList, error } = event;
		this.recordingStatus.set(status);
		this.recordingList.set(recordingList);
		this.recordingError.set(error);
		this.recordingAlive.set(status === RecordingState.STARTED);
		if (status !== RecordingState.FAILED) {
			this.oldRecordingStatus.set(status);
		}
		this.cd.markForCheck();
	});
	private readonly roomTracksPublishedEffect = effect(() => {
		this.participantService.localParticipantSignal();
		this.participantService.remoteParticipantsSignal();
		this.hasRoomTracksPublished.set(this.openviduService.hasRoomTracksPublished());
	});

	constructor() {
		this.log = this.loggerSrv.get('RecordingActivityComponent');
	}

	/**
	 * @internal
	 */
	ngOnInit(): void {
		this.subscribeToTracksChanges();
		this.subscribeToConfigChanges();
	}

	/**
	 * @internal
	 */
	trackByRecordingId(index: number, recording: RecordingInfo): string | undefined {
		return recording.id;
	}

	/**
	 * @internal
	 */
	setPanelOpened(value: boolean) {
		this.isPanelOpened.set(value);
	}

	/**
	 * @internal
	 */
	resetStatus() {
		if (this.oldRecordingStatus() === RecordingState.STARTING) {
			this.recordingService.setRecordingStopped();
		} else if (this.oldRecordingStatus() === RecordingState.STOPPING) {
			this.recordingService.setRecordingStarted();
		} else {
			this.recordingService.setRecordingStopped();
		}
	}

	/**
	 * @internal
	 */
	startRecording() {
		const payload: RecordingStartRequestedEvent = {
			roomName: this.openviduService.getRoomName()
		};
		this.onRecordingStartRequested.emit(payload);
	}

	/**
	 * @internal
	 */
	stopRecording() {
		const currentRecording = this.recordingList().find((rec) => rec.status === RecordingState.STARTED);
		const payload: RecordingStopRequestedEvent = {
			roomName: this.openviduService.getRoomName(),
			recordingId: currentRecording?.id
		};
		this.onRecordingStopRequested.emit(payload);
	}

	/**
	 * @internal
	 */

	deleteRecording(recording: RecordingInfo) {
		const succsessCallback = async () => {
			if (!recording.id) {
				throw new Error('Error deleting recording. Recording id is undefined');
			}
			const payload: RecordingDeleteRequestedEvent = {
				roomName: recording.roomName,
				recordingId: recording.id
			};
			this.onRecordingDeleteRequested.emit(payload);
		};
		this.actionService.openDeleteRecordingDialog(succsessCallback.bind(this));
	}

	/**
	 * @internal
	 */
	download(recording: RecordingInfo) {
		if (!recording.filename) {
			this.log.e('Error downloading recording. Recording filename is undefined');
			return;
		}
		const payload: RecordingDownloadClickedEvent = {
			roomName: this.openviduService.getRoomName(),
			recordingId: recording.filename
		};
		this.onRecordingDownloadClicked.emit(payload);
		this.recordingService.downloadRecording(recording);
	}

	/**
	 * @internal
	 */
	play(recording: RecordingInfo) {
		if (!recording.filename) {
			this.log.e('Error playing recording. Recording filename is undefined');
			return;
		}
		const payload: RecordingPlayClickedEvent = {
			roomName: this.openviduService.getRoomName(),
			recordingId: recording.id
		};
		this.onRecordingPlayClicked.emit(payload);
		this.recordingService.playRecording(recording);
	}

	/**
	 * @internal
	 */
	viewRecording(recording: RecordingInfo) {
		// This method can be overridden or emit a custom event for navigation
		// For now, it uses the same behavior as play, but can be customized
		if (!recording.filename) {
			this.log.e('Error viewing recording. Recording filename is undefined');
			return;
		}
		const payload: RecordingPlayClickedEvent = {
			roomName: this.openviduService.getRoomName(),
			recordingId: recording.id
		};
		this.onRecordingPlayClicked.emit(payload);
		// You can customize this to navigate to a different page instead
		this.recordingService.playRecording(recording);
	}

	/**
	 * @internal
	 */
	viewAllRecordings() {
		this.onViewRecordingsClicked.emit();
	}

	/**
	 * @internal
	 * Format duration in seconds to a readable format (e.g., "2m 30s")
	 */
	formatDuration(seconds: number): string {
		if (!seconds || seconds < 0) return '0s';

		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const remainingSeconds = Math.floor(seconds % 60);

		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		} else if (minutes > 0) {
			return `${minutes}m ${remainingSeconds}s`;
		} else {
			return `${remainingSeconds}s`;
		}
	}

	/**
	 * @internal
	 * Format file size in bytes to a readable format (e.g., "2.5 MB")
	 */
	formatFileSize(bytes: number): string {
		if (!bytes || bytes < 0) return '0 B';

		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		const size = bytes / Math.pow(1024, i);

		return `${size.toFixed(1)} ${sizes[i]}`;
	}

	private subscribeToConfigChanges() {}

 private subscribeToTracksChanges() {}
}
