import { Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';

/**
 * The **displayParticipantName** directive allows show/hide the participants name in stream component.
 *
 * Default: `true`
 *
 * It can be used in the parent element {@link MeetingViewComponent} specifying the name of the `stream` component:
 *
 * @example
 * <ov-meeting-view [streamDisplayParticipantName]="false"></ov-meeting-view>
 *
 * \
 * And it also can be used in the {@link StreamComponent}.
 * @example
 * <ov-stream [displayParticipantName]="false"></ov-stream>
 */
@Directive({
	selector: 'ov-meeting-view[streamDisplayParticipantName], ov-stream[displayParticipantName]'
})
export class StreamDisplayParticipantNameDirective implements OnDestroy {
	readonly streamDisplayParticipantName = input<boolean | undefined>(undefined);
	readonly displayParticipantName = input<boolean | undefined>(undefined);

	public elementRef = inject(ElementRef);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly displayParticipantNameEffect = effect(() => {
		this.update(this.displayParticipantName() ?? this.streamDisplayParticipantName() ?? true);
	});

	ngOnDestroy(): void {
		this.clear();
	}

	update(value: boolean) {
		this.libService.updateStreamConfig({ displayParticipantName: value });
	}

	clear() {
		this.update(true);
	}
}

/**
 * The **displayAudioDetection** directive allows show/hide the participants audio detection in stream component.
 *
 * Default: `true`
 *
 * It can be used in the parent element {@link MeetingViewComponent} specifying the name of the `stream` component:
 *
 * @example
 * <ov-meeting-view [streamDisplayAudioDetection]="false"></ov-meeting-view>
 *
 * \
 * And it also can be used in the {@link StreamComponent}.
 * @example
 * <ov-stream [displayAudioDetection]="false"></ov-stream>
 */
@Directive({
	selector: 'ov-meeting-view[streamDisplayAudioDetection], ov-stream[displayAudioDetection]'
})
export class StreamDisplayAudioDetectionDirective implements OnDestroy {
	readonly streamDisplayAudioDetection = input<boolean | undefined>(undefined);
	readonly displayAudioDetection = input<boolean | undefined>(undefined);

	public elementRef = inject(ElementRef);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly displayAudioDetectionEffect = effect(() => {
		this.update(this.displayAudioDetection() ?? this.streamDisplayAudioDetection() ?? true);
	});

	ngOnDestroy(): void {
		this.clear();
	}

	update(value: boolean) {
		this.libService.updateStreamConfig({ displayAudioDetection: value });
	}

	clear() {
		this.update(true);
	}
}

/**
 * The **videoControls** directive allows show/hide the participants video controls in stream component.
 *
 * Default: `true`
 *
 * It can be used in the parent element {@link MeetingViewComponent} specifying the name of the `stream` component:
 *
 * @example
 * <ov-meeting-view [streamVideoControls]="false"></ov-meeting-view>
 *
 * \
 * And it also can be used in the {@link StreamComponent}.
 * @example
 * <ov-stream [videoControls]="false"></ov-stream>
 */
@Directive({
	selector: 'ov-meeting-view[streamVideoControls], ov-stream[videoControls]'
})
export class StreamVideoControlsDirective implements OnDestroy {
	readonly streamVideoControls = input<boolean | undefined>(undefined);
	readonly videoControls = input<boolean | undefined>(undefined);

	public elementRef = inject(ElementRef);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly videoControlsEffect = effect(() => {
		this.update(this.videoControls() ?? this.streamVideoControls() ?? true);
	});

	ngOnDestroy(): void {
		this.clear();
	}

	update(value: boolean) {
		this.libService.updateStreamConfig({ videoControls: value });
	}

	clear() {
		this.update(true);
	}
}
