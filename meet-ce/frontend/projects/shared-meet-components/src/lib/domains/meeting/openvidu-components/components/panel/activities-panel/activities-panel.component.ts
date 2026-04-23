import { ChangeDetectionStrategy, Component, effect, inject, OnInit, output, signal } from '@angular/core';
import { PanelType } from '../../../models/panel.model';
import {
	RecordingDeleteRequestedEvent,
	RecordingDownloadClickedEvent,
	RecordingPlayClickedEvent,
	RecordingStartRequestedEvent,
	RecordingStopRequestedEvent
} from '../../../models/recording.model';
import { OpenViduComponentsConfigService } from '../../../services/config/directive-config.service';
import { PanelService } from '../../../services/panel/panel.service';

/**
 * The **ActivitiesPanelComponent** is the component that allows showing the activities panel.
 * This panel shows the recording and broadcasting activities.
 */
@Component({
	selector: 'ov-activities-panel',
	templateUrl: './activities-panel.component.html',
	styleUrls: ['../panel.component.scss', './activities-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false
})
export class ActivitiesPanelComponent implements OnInit {
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
	 * Provides event notifications that fire when view recording button has been clicked.
	 * This event is triggered when the user wants to view a specific recording in an external page.
	 * It provides the recording ID as event data.
	 */
	onViewRecordingClicked = output<string>();


	/**
	 * @internal
	 */
	private readonly libService = inject(OpenViduComponentsConfigService);

	/**
	 * @internal
	 */
	readonly expandedPanel = signal('');
	/**
	 * @internal
	 */
	readonly showRecordingActivity = this.libService.recordingActivitySignal;

	/**
	 * @internal
	 */
	private readonly panelService = inject(PanelService);
	private readonly panelTogglingEffect = effect(() => {
		const ev = this.panelService.panelOpened();
		if (ev.panelType === PanelType.ACTIVITIES && !!ev.subOptionType) {
			this.expandedPanel.set(ev.subOptionType);
		}
	});

	/**
	 * @internal
	 */
	ngOnInit(): void {
	}

	/**
	 * @internal
	 */
	close() {
		this.panelService.togglePanel(PanelType.ACTIVITIES);
	}

}
