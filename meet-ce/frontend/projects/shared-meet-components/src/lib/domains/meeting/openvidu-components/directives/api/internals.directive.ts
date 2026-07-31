// * Internal directives *

import { Directive, ElementRef, OnDestroy, OnInit, effect, inject, input } from '@angular/core';
import { AssetsService } from '../../../../../shared/services/assets.service';
import { ParticipantModel } from '../../models/participant.model';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';

/**
 * Load default OpenVidu logo if custom one is not exist
 * @internal
 */
@Directive({
	selector: 'img[ovLogo]'
})
export class FallbackLogoDirective implements OnInit {
	private readonly assets = inject(AssetsService);
	// Default OpenVidu logo served as a static asset (resolves in SPA & WC modes).
	readonly assetsLogo = this.assets.logo;
	readonly ovLogo = input<string>('');
	public elementRef = inject(ElementRef);

	ngOnInit() {
		this.loadImage(this.ovLogo() || this.assetsLogo);
	}

	private loadImage(url: string) {
		const element = this.elementRef.nativeElement as HTMLImageElement;
		const tempImage = new Image();

		const handleImageErrorOrLoad = (url: string) => {
			if (tempImage.width <= 1 && tempImage.height <= 1) {
				// Custom logo failed to load: fall back to the default OpenVidu asset.
				if (url === this.ovLogo()) {
					this.loadImage(this.assetsLogo);
				}
			} else {
				element.src = url;
			}
		};

		tempImage.onload = () => {
			handleImageErrorOrLoad(url);
		};

		tempImage.onerror = () => {
			handleImageErrorOrLoad(url);
		};

		tempImage.src = url;
	}
}

/**
 * @internal
 */
@Directive({
	selector: 'ov-smart-layout[ovRemoteParticipants]'
})
export class LayoutRemoteParticipantsDirective implements OnDestroy {
	readonly ovRemoteParticipants = input<ParticipantModel[] | undefined>(undefined);

	public elementRef = inject(ElementRef);
	private readonly directiveService = inject(MeetingUiConfigService);
	private readonly ovRemoteParticipantsEffect = effect(() => {
		this.update(this.ovRemoteParticipants());
	});

	ngOnDestroy(): void {
		this.clear();
	}

	update(value: ParticipantModel[] | undefined) {
		this.directiveService.setLayoutRemoteParticipants(value);
	}

	clear() {
		this.update(undefined);
	}
}

/**
 * @internal
 */
@Directive({
	selector: 'ov-meeting-view[brandingLogo], ov-toolbar[brandingLogo]'
})
export class ToolbarBrandingLogoDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly brandingLogo = input<string>('');

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly brandingLogoEffect = effect(() => {
		this.update(this.brandingLogo());
	});

	ngOnDestroy(): void {
		this.clear();
	}

	private clear() {
		this.update('');
	}

	private update(value: string) {
		this.libService.updateToolbarConfig({ brandingLogo: value });
	}
}

/**
 * @internal
 * The **viewRecordingsButton** directive allows show/hide the view recordings toolbar button.
 *
 * Default: `false`
 *
 * It can be used in the parent element {@link MeetingViewComponent} specifying the name of the `toolbar` component:
 *
 * @example
 * <ov-meeting-view [toolbarViewRecordingsButton]="true"></ov-meeting-view>
 *
 * \
 * And it also can be used in the {@link ToolbarComponent}.
 * @example
 * <ov-toolbar [viewRecordingsButton]="true"></ov-toolbar>
 *
 * When the button is clicked, it will fire the `onViewRecordingsClicked` event.
 */
@Directive({
	selector: 'ov-meeting-view[toolbarViewRecordingsButton], ov-toolbar[viewRecordingsButton]'
})
export class ToolbarViewRecordingsButtonDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly toolbarViewRecordingsButton = input<boolean | undefined>(undefined);
	/**
	 * @ignore
	 */
	readonly viewRecordingsButton = input<boolean | undefined>(undefined);

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly viewRecordingsButtonEffect = effect(() => {
		this.update(this.viewRecordingsButton() ?? this.toolbarViewRecordingsButton() ?? false);
	});

	ngOnDestroy(): void {
		this.clear();
	}

	private clear() {
		this.update(true);
	}

	private update(value: boolean) {
		this.libService.updateToolbarConfig({ viewRecordings: value });
	}
}

/**
 * @internal
 *
 * The **recordingActivityStartStopRecordingButton** directive allows to show or hide the start/stop recording buttons in recording activity.
 *
 * Default: `true`
 *
 * It is only available for {@link MeetingViewComponent}.
 *
 * @example
 * <ov-meeting-view [recordingActivityStartStopRecordingButton]="false"></ov-meeting-view>
 */
@Directive({
	selector: 'ov-meeting-view[recordingActivityStartStopRecordingButton]'
})
export class StartStopRecordingButtonsDirective implements OnDestroy {
	/**
	 * @ignore
	 */
	readonly recordingActivityStartStopRecordingButton = input<boolean | undefined>(undefined);

	/**
	 * @ignore
	 */
	public elementRef = inject(ElementRef);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly startStopButtonEffect = effect(() => {
		this.update(this.recordingActivityStartStopRecordingButton() ?? true);
	});

	ngOnDestroy(): void {
		this.clear();
	}

	private clear() {
		this.update(true);
	}

	private update(value: boolean) {
		this.libService.updateRecordingActivityConfig({ startStopButton: value });
	}
}

/**
 * @internal
 * The **recordingActivityViewRecordingsButton** directive allows to show/hide the view recordings button in the recording activity panel.
 *
 * Default: `false`
 *
 * Can be used in {@link MeetingViewComponent}.
 *
 * @example
 * <ov-meeting-view [recordingActivityViewRecordingsButton]="true"></ov-meeting-view>
 */
@Directive({
	selector: 'ov-meeting-view[recordingActivityViewRecordingsButton]'
})
export class RecordingActivityViewRecordingsButtonDirective implements OnDestroy {
	readonly recordingActivityViewRecordingsButton = input<boolean | undefined>(undefined);

	public elementRef = inject(ElementRef);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly viewRecordingsButtonEffect = effect(() => {
		this.update(this.recordingActivityViewRecordingsButton() ?? false);
	});

	ngOnDestroy(): void {
		this.clear();
	}

	private clear() {
		this.update(false);
	}

	private update(value: boolean) {
		this.libService.updateRecordingActivityConfig({ viewRecordingsButton: value });
	}
}


/**
 * @internal
 * The **toolbarRoomName** directive allows to display a specific room name in the toolbar.
 * If the room name is not set, it will display the room ID instead.
 *
 * Can be used in {@link ToolbarComponent}.
 *
 * @example
 * <ov-meeting-view [toolbarRoomName]="roomName"></ov-meeting-view>
 */
@Directive({
	selector: 'ov-meeting-view[toolbarRoomName], ov-toolbar[roomName]'
})
export class ToolbarRoomNameDirective implements OnDestroy {
	readonly toolbarRoomName = input<string | undefined>(undefined);
	readonly roomName = input<string | undefined>(undefined);

	public elementRef = inject(ElementRef);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly roomNameEffect = effect(() => {
		this.updateRoomName(this.roomName() ?? this.toolbarRoomName());
	});

	ngOnDestroy(): void {
		this.clear();
	}

	private clear() {
		this.updateRoomName(undefined);
	}

	private updateRoomName(value: string | undefined) {
		this.libService.updateToolbarConfig({ roomName: value || '' });
	}
}

/**
 * @internal
 *
 * The **showThemeSelector** directive allows to enable or disable the theme selector control.
 * When disabled, users won't be able to change the UI theme.
 *
 * Default: `false`
 *
 * Usage:
 * <ov-meeting-view [showThemeSelector]="false"></ov-meeting-view>
 */
@Directive({
	selector: 'ov-meeting-view[showThemeSelector]'
})
export class ShowThemeSelectorDirective implements OnDestroy {
	readonly showThemeSelector = input<boolean | undefined>(undefined);

	public elementRef = inject(ElementRef);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly showThemeSelectorEffect = effect(() => {
		this.update(this.showThemeSelector() ?? false);
	});

	ngOnDestroy(): void {
		this.clear();
	}

	private clear() {
		this.update(true);
	}

	private update(value: boolean) {
		this.libService.updateGeneralConfig({ showThemeSelector: value });
	}
}

/**
 * @internal
 *
 * The **e2eeKey** directive allows to configure end-to-end encryption for the videoconference.
 * When provided, the room will be configured with E2EE using an external key provider.
 *
 * Default: `undefined`
 *
 * Usage:
 * <ov-meeting-view [e2eeKey]="yourEncryptionKey"></ov-meeting-view>
 */
@Directive({
	selector: 'ov-meeting-view[e2eeKey]'
})
export class E2EEKeyDirective implements OnDestroy {
	readonly e2eeKey = input<string | undefined>(undefined);

	public elementRef = inject(ElementRef);
	private readonly libService = inject(MeetingUiConfigService);
	private readonly e2eeKeyEffect = effect(() => {
		this.update(this.e2eeKey());
	});

	ngOnDestroy(): void {
		this.clear();
	}

	private clear() {
		this.update(undefined);
	}

	private update(value: string | undefined) {
		// Only update if value is valid (not undefined, not null, not empty string)
		const validValue = value && value.trim() !== '' ? value.trim() : undefined;
		this.libService.updateGeneralConfig({ e2eeKey: validValue });
	}
}
