import {
	ChangeDetectionStrategy,
	Component,
	contentChild,
	effect,
	inject,
	OnInit,
	output,
	signal,
	TemplateRef
} from '@angular/core';
import { SettingsPanelGeneralAdditionalElementsDirective } from '../../../directives/template/internals.directive';
import { CustomDevice } from '../../../models/device.model';
import { LangOption } from '../../../models/lang.model';
import { PanelSettingsOptions, PanelType } from '../../../models/panel.model';
import { OpenViduComponentsConfigService } from '../../../services/config/directive-config.service';
import { PanelService } from '../../../services/panel/panel.service';
import { PlatformService } from '../../../services/platform/platform.service';
import { ViewportService } from '../../../services/viewport/viewport.service';

/**
 * @internal
 */
@Component({
	selector: 'ov-settings-panel',
	templateUrl: './settings-panel.component.html',
	styleUrls: ['../panel.component.scss', './settings-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false
})
export class SettingsPanelComponent implements OnInit {
	onVideoEnabledChanged = output<boolean>();
	onVideoDeviceChanged = output<CustomDevice>();
	onAudioEnabledChanged = output<boolean>();
	onAudioDeviceChanged = output<CustomDevice>();
	onLangChanged = output<LangOption>();

	private readonly panelService = inject(PanelService);
	private readonly platformService = inject(PlatformService);
	private readonly libService = inject(OpenViduComponentsConfigService);
	public readonly viewportService = inject(ViewportService);

	/**
	 * @internal
	 * ContentChild for custom elements in general section
	 */
	readonly externalGeneralAdditionalElements = contentChild.required(SettingsPanelGeneralAdditionalElementsDirective);

	settingsOptions: typeof PanelSettingsOptions = PanelSettingsOptions;
	isMobile: boolean = false;

	readonly showCameraButton = this.libService.cameraButtonSignal;
	readonly showMicrophoneButton = this.libService.microphoneButtonSignal;
	readonly showThemeSelector = this.libService.showThemeSelectorSignal;
	readonly selectedOption = signal<PanelSettingsOptions>(PanelSettingsOptions.GENERAL);

	/**
	 * @internal
	 * Gets the template for additional elements in general section
	 */
	get generalAdditionalElementsTemplate(): TemplateRef<any> | undefined {
		return this.externalGeneralAdditionalElements()?.template;
	}

	private readonly panelTogglingEffect = effect(() => {
		const ev = this.panelService.panelOpened();
		if (ev.panelType === PanelType.SETTINGS && !!ev.subOptionType) {
			this.selectedOption.set(ev.subOptionType as PanelSettingsOptions);
		}
	});

	// Computed properties for responsive behavior
	get isCompactView(): boolean {
		return this.viewportService.isMobileView() || this.viewportService.isTabletDown();
	}

	get isVerticalLayout(): boolean {
		return this.viewportService.isMobileView();
	}

	get shouldHideMenuText(): boolean {
		return !this.viewportService.isMobileView() && this.viewportService.isTablet();
	}
	ngOnInit() {
		this.isMobile = this.platformService.isMobile();
	}

	close() {
		this.panelService.togglePanel(PanelType.SETTINGS);
	}
	onSelectionChanged(option: PanelSettingsOptions) {
		this.selectedOption.set(option);
	}

}
