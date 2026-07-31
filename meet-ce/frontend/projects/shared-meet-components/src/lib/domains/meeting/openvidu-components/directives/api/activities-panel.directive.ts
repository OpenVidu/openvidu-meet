import { Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';

/**
 * The **recordingActivity** directive allows show/hide the recording activity in {@link ActivitiesPanelComponent}.
 *
 * Default: `true`
 *
 * It can be used in the parent element {@link MeetingViewComponent} specifying the name of the `activitiesPanel` component:
 *
 * @example
 * <ov-meeting-view [activitiesPanelRecordingActivity]="false"></ov-meeting-view>
 *
 * \
 * And it also can be used in the {@link ActivitiesPanelComponent}.
 * @example
 * <ov-activities-panel *ovActivitiesPanel [recordingActivity]="false"></ov-activities-panel>
 */
@Directive({
	selector: 'ov-meeting-view[activitiesPanelRecordingActivity], ov-activities-panel[recordingActivity]'
})
export class ActivitiesPanelRecordingActivityDirective implements OnDestroy {
	readonly activitiesPanelRecordingActivity = input<boolean | undefined>(undefined);
	readonly recordingActivity = input<boolean | undefined>(undefined);

	public elementRef = inject(ElementRef);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly recordingActivityEffect = effect(() => {
		this.update(this.recordingActivity() ?? this.activitiesPanelRecordingActivity() ?? true);
	});

	ngOnDestroy(): void {
		this.clear();
	}

	clear() {
		this.update(true);
	}

	update(value: boolean) {
		this.libService.updateRecordingActivityConfig({ enabled: value });
	}
}
