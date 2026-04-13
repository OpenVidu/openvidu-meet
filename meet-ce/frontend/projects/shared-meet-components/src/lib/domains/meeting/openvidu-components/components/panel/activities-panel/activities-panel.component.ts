import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BroadcastingStartRequestedEvent, BroadcastingStopRequestedEvent } from '../../../models/broadcasting.model';
import { PanelStatusInfo, PanelType } from '../../../models/panel.model';
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
	 * Provides event notifications that fire when start broadcasting button is clicked.
	 * It provides the {@link BroadcastingStartRequestedEvent} payload as event data.
	 */
	onBroadcastingStartRequested = output<BroadcastingStartRequestedEvent>();

	/**
	 * Provides event notifications that fire when stop broadcasting button is clicked.
	 * It provides the {@link BroadcastingStopRequestedEvent} payload as event data.
	 */
	onBroadcastingStopRequested = output<BroadcastingStopRequestedEvent>();

	/**
	 * @internal
	 */
	expandedPanel: string = '';
	/**
	 * @internal
	 */
	showRecordingActivity: boolean = true;
	/**
	 * @internal
	 */
	showBroadcastingActivity: boolean = true;
	private readonly destroyRef = inject(DestroyRef);

	/**
	 * @internal
	 */
	private readonly panelService = inject(PanelService);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly cd = inject(ChangeDetectorRef);

	/**
	 * @internal
	 */
	ngOnInit(): void {
		this.subscribeToPanelToggling();
		this.subscribeToActivitiesPanelDirective();
	}

	/**
	 * @internal
	 */
	close() {
		this.panelService.togglePanel(PanelType.ACTIVITIES);
	}

	private subscribeToPanelToggling() {
		this.panelService.panelStatusObs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((ev: PanelStatusInfo) => {
			if (ev.panelType === PanelType.ACTIVITIES && !!ev.subOptionType) {
				this.expandedPanel = ev.subOptionType;
			}
		});
	}

	private subscribeToActivitiesPanelDirective() {
		this.libService.recordingActivity$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value: boolean) => {
			this.showRecordingActivity = value;
			this.cd.markForCheck();
		});

		this.libService.broadcastingActivity$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value: boolean) => {
			this.showBroadcastingActivity = value;
			this.cd.markForCheck();
		});
	}
}
