import { Directive, ElementRef, OnDestroy, effect, inject, input } from '@angular/core';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';

/**
 * The **muteButton** directive allows show/hide the muted button in participant panel item component.
 *
 * Default: `true`
 *
 * It can be used in the parent element {@link MeetingViewComponent} specifying the name of the `participantPanelItem` component:
 *
 * @example
 * <ov-meeting-view [participantPanelItemMuteButton]="false"></ov-meeting-view>
 *
 * \
 * And it also can be used in the {@link ParticipantPanelItemComponent}.
 * @example
 * <ov-participant-panel-item [muteButton]="false"></ov-participant-panel-item>
 */
@Directive({
	selector: 'ov-meeting-view[participantPanelItemMuteButton], ov-participant-panel-item[muteButton]'
})
export class ParticipantPanelItemMuteButtonDirective implements OnDestroy {
	readonly participantPanelItemMuteButton = input<boolean | undefined>(undefined);
	readonly muteButton = input<boolean | undefined>(undefined);

	public elementRef = inject(ElementRef);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly muteButtonEffect = effect(() => {
		this.update(this.muteButton() ?? this.participantPanelItemMuteButton() ?? true);
	});

	ngOnDestroy(): void {
		this.clear();
	}

	clear() {
		this.update(true);
	}

	update(value: boolean) {
		this.libService.updateStreamConfig({ participantItemMuteButton: value });
	}
}
