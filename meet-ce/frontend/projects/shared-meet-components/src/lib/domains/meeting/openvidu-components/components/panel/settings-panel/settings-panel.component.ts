import {
	ChangeDetectionStrategy,
	Component,
	contentChild,
	DestroyRef,
	effect,
	inject,
	OnInit,
	output,
	TemplateRef
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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

	/**
	 * @internal
	 * ContentChild for custom elements in general section
	 */
	readonly externalGeneralAdditionalElements = contentChild.required(SettingsPanelGeneralAdditionalElementsDirective);

	settingsOptions: typeof PanelSettingsOptions = PanelSettingsOptions;
	selectedOption: PanelSettingsOptions = PanelSettingsOptions.GENERAL;
	showCameraButton: boolean = true;
	showMicrophoneButton: boolean = true;
	showThemeSelector: boolean = false;
	isMobile: boolean = false;
	private readonly destroyRef = inject(DestroyRef);

	/**
	 * @internal
	 * Gets the template for additional elements in general section
	 */
	get generalAdditionalElementsTemplate(): TemplateRef<any> | undefined {
		return this.externalGeneralAdditionalElements()?.template;
	}

	private readonly panelService = inject(PanelService);
	private readonly platformService = inject(PlatformService);
	private readonly libService = inject(OpenViduComponentsConfigService);
	public readonly viewportService = inject(ViewportService);
	private readonly panelTogglingEffect = effect(() => {
		const ev = this.panelService.panelOpened();
		if (ev.panelType === PanelType.SETTINGS && !!ev.subOptionType) {
			this.selectedOption = ev.subOptionType as PanelSettingsOptions;
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
		this.subscribeToDirectives();
	}

	close() {
		this.panelService.togglePanel(PanelType.SETTINGS);
	}
	onSelectionChanged(option: PanelSettingsOptions) {
		this.selectedOption = option;
	}

	private subscribeToDirectives() {
		this.libService.cameraButton$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((value: boolean) => (this.showCameraButton = value));
		this.libService.microphoneButton$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((value: boolean) => (this.showMicrophoneButton = value));
		this.libService.showThemeSelector$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((value: boolean) => (this.showThemeSelector = value));
	}

}
