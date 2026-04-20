import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, effect, inject, input, OnInit, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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

/**
 * The **RecordingActivityComponent** is the component that allows showing the recording activity.
 */
@Component({
	selector: 'ov-recording-activity',
	templateUrl: './recording-activity.component.html',
	styleUrls: ['./recording-activity.component.scss', '../activities-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false
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
	recordingStatus: RecordingState = RecordingState.STOPPED;
	/**
	 * @internal
	 */
	oldRecordingStatus: RecordingState = RecordingState.STOPPED;
	/**
	 * @internal
	 */
	isPanelOpened: boolean = false;

	/**
	 * @internal
	 */
	recStatusEnum = RecordingState;

	/**
	 * @internal
	 */
	recordingAlive: boolean = false;
	/**
	 * @internal
	 */
	recordingList: RecordingInfo[] = [];

	/**
	 * @internal
	 */
	recordingError: any;

	/**
	 * @internal
	 */
	hasRoomTracksPublished: boolean = false;

	/**
	 * @internal
	 */
	mouseHovering: boolean = false;

	/**
	 * @internal
	 */
	isReadOnlyMode: boolean = false;

	/**
	 * @internal
	 */
	viewButtonText: string = 'PANEL.RECORDING.VIEW';

	/**
	 * @internal
	 */
	showStartStopRecordingButton: boolean = true;

	/**
	 * @internal
	 */
	showViewRecordingsButton: boolean = false;

	/**
	 * @internal
	 */
	showRecordingList: boolean = true; // Controls visibility of the recording list in the panel

	/**
	 * @internal
	 */
	showControls: { play?: boolean; download?: boolean; delete?: boolean; externalView?: boolean } = {
		play: true,
		download: true,
		delete: true,
		externalView: false
	};

	private log: ILogger = {
		d: () => {},
		v: () => {},
		w: () => {},
		e: () => {}
	};
	private readonly destroyRef = inject(DestroyRef);

	/**
	 * @internal
	 */
	private readonly recordingService = inject(RecordingService);
	private readonly participantService = inject(ParticipantService);
	private readonly actionService = inject(ActionService);
	private readonly openviduService = inject(OpenViduService);
	private readonly cd = inject(ChangeDetectorRef);
	private readonly loggerSrv = inject(LoggerService);
	private readonly libService = inject(OpenViduComponentsConfigService);

	constructor() {
		this.log = this.loggerSrv.get('RecordingActivityComponent');
	}

	/**
	 * @internal
	 */
	ngOnInit(): void {
		this.subscribeToRecordingStatus();
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
		this.isPanelOpened = value;
	}

	/**
	 * @internal
	 */
	resetStatus() {
		if (this.oldRecordingStatus === RecordingState.STARTING) {
			this.recordingService.setRecordingStopped();
		} else if (this.oldRecordingStatus === RecordingState.STOPPING) {
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
		const currentRecording = this.recordingList.find((rec) => rec.status === RecordingState.STARTED);
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

	private subscribeToConfigChanges() {
		this.libService.recordingActivityReadOnly$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((readOnly: boolean) => {
			this.isReadOnlyMode = readOnly;
			this.cd.markForCheck();
		});

		this.libService.recordingActivityShowControls$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((controls: { play?: boolean; download?: boolean; delete?: boolean; externalView?: boolean }) => {
				this.showControls = controls;
				this.cd.markForCheck();
			});

		this.libService.recordingActivityStartStopRecordingButton$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((show: boolean) => {
			this.showStartStopRecordingButton = show;
			this.cd.markForCheck();
		});

		this.libService.recordingActivityViewRecordingsButton$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((show: boolean) => {
			this.showViewRecordingsButton = show;
			this.cd.markForCheck();
		});

		this.libService.recordingActivityShowRecordingsList$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((show: boolean) => {
			this.showRecordingList = show;
			this.cd.markForCheck();
		});
	}

	private subscribeToRecordingStatus() {
		effect(() => {
			const event = this.recordingService.recordingState();
			const { status, recordingList, error } = event;
			this.recordingStatus = status;
			this.recordingList = recordingList;
			this.recordingError = error;
			this.recordingAlive = this.recordingStatus === RecordingState.STARTED;
			if (this.recordingStatus !== RecordingState.FAILED) {
				this.oldRecordingStatus = this.recordingStatus;
			}
			this.cd.markForCheck();
		});
	}

	private subscribeToTracksChanges() {
		this.hasRoomTracksPublished = this.openviduService.hasRoomTracksPublished();

		this.participantService.localParticipant$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			const newValue = this.openviduService.hasRoomTracksPublished();
			if (this.hasRoomTracksPublished !== newValue) {
				this.hasRoomTracksPublished = newValue;
				this.cd.markForCheck();
			}
		});

		this.participantService.remoteParticipants$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			const newValue = this.openviduService.hasRoomTracksPublished();
			if (this.hasRoomTracksPublished !== newValue) {
				this.hasRoomTracksPublished = newValue;
				this.cd.markForCheck();
			}
		});
	}
}
