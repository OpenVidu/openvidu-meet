import { Component, effect, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BroadcastRequestedEvent } from '../../../models/broadcast.model';
import { PanelType } from '../../../models/panel.model';
import { RecordingStartRequestedEvent, RecordingStopRequestedEvent } from '../../../models/recording.model';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { MeetingUiConfigService } from '../../../services/config/meeting-ui-config.service';
import { PanelService } from '../../../services/panel/panel.service';
import { BroadcastActivityComponent } from './broadcast-activity/broadcast-activity.component';
import { RecordingActivityComponent } from './recording-activity/recording-activity.component';

/**
 * The **ActivitiesPanelComponent** is the component that allows showing the activities panel.
 * This panel shows the recording and the live broadcast activities.
 */
@Component({
	selector: 'ov-activities-panel',
	imports: [
		MatButtonModule,
		MatExpansionModule,
		MatIconModule,
		MatTooltipModule,
		TranslatePipe,
		RecordingActivityComponent,
		BroadcastActivityComponent
	],
	templateUrl: './activities-panel.component.html',
	styleUrls: ['../panel.component.scss', './activities-panel.component.scss']
})
export class ActivitiesPanelComponent {
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
	 * @internal
	 * Provides event notifications that fire when view recordings button has been clicked.
	 * This event is triggered when the user wants to view all recordings in an external page.
	 */
	onViewRecordingsClicked = output<void>();

	/**
	 * Fired whenever the user asks something of the live broadcast: going live, stopping it, adding
	 * a destination or starting and stopping one. See {@link BroadcastRequestedEvent}.
	 */
	onBroadcastRequested = output<BroadcastRequestedEvent>();

	/**
	 * @internal
	 */
	private readonly libService = inject(MeetingUiConfigService);

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
	readonly showBroadcastActivity = this.libService.broadcastActivitySignal;

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
	close() {
		this.panelService.togglePanel(PanelType.ACTIVITIES);
	}
}
