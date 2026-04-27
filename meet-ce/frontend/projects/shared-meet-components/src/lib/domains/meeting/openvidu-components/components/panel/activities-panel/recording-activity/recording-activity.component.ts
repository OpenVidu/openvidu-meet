import { UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
	RecordingDeleteRequestedEvent,
	RecordingDownloadClickedEvent,
	RecordingInfo,
	RecordingPlayClickedEvent,
	RecordingStartRequestedEvent,
	RecordingState,
	RecordingStopRequestedEvent
} from '../../../../models/recording.model';
import { TranslatePipe } from '../../../../pipes/translate.pipe';
import { OpenViduComponentsConfigService } from '../../../../services/config/directive-config.service';
import { OpenViduService } from '../../../../services/openvidu/openvidu.service';
import { ParticipantService } from '../../../../services/participant/participant.service';
import { RecordingService } from '../../../../services/recording/recording.service';

/**
 * The **RecordingActivityComponent** is the component that allows showing the recording activity.
 */
@Component({
	selector: 'ov-recording-activity',
	imports: [
		MatButtonModule,
		MatDividerModule,
		MatExpansionModule,
		MatIconModule,
		MatListModule,
		MatTooltipModule,
		TranslatePipe,
		UpperCasePipe
	],
	templateUrl: './recording-activity.component.html',
	styleUrls: ['./recording-activity.component.scss', '../activities-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class RecordingActivityComponent {
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly recordingService = inject(RecordingService);
	private readonly participantService = inject(ParticipantService);
	private readonly openviduService = inject(OpenViduService);

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
	readonly recordingError = signal<any>(undefined);

	/**
	 * @internal
	 */
	readonly hasRoomTracksPublished = signal(false);

	/**
	 * @internal
	 */
	readonly mouseHovering = signal(false);

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

	private readonly recordingStatusEffect = effect(() => {
		const event = this.recordingService.recordingStatus();
		const { status, error } = event;
		this.recordingStatus.set(status);
		this.recordingError.set(error);
		this.recordingAlive.set(status === RecordingState.STARTED);
		if (status !== RecordingState.FAILED) {
			this.oldRecordingStatus.set(status);
		}
	});

	private readonly roomTracksPublishedEffect = effect(() => {
		this.participantService.localParticipantSignal();
		this.participantService.remoteParticipantsSignal();
		this.hasRoomTracksPublished.set(this.openviduService.hasRoomTracksPublished());
	});

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
		const currentStatus = this.recordingService.recordingStatus();
		if (this.oldRecordingStatus() === RecordingState.STARTING) {
			this.recordingService.setRecordingStopped();
		} else if (this.oldRecordingStatus() === RecordingState.STOPPING) {
			this.recordingService.setRecordingStarted(currentStatus.id!, currentStatus.startedAt!.getTime());
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
		const recId = this.recordingService.recordingStatus().id;
		const payload: RecordingStopRequestedEvent = {
			roomName: this.openviduService.getRoomName(),
			recordingId: recId
		};
		this.onRecordingStopRequested.emit(payload);
	}

	/**
	 * @internal
	 */
	viewAllRecordings() {
		this.onViewRecordingsClicked.emit();
	}
}
