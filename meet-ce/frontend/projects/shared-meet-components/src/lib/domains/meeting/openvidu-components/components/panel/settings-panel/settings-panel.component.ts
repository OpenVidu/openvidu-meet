import { ChangeDetectionStrategy, Component, ContentChild, inject, OnInit, output, TemplateRef } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { SettingsPanelGeneralAdditionalElementsDirective } from '../../../directives/template/internals.directive';
import { CustomDevice } from '../../../models/device.model';
import { LangOption } from '../../../models/lang.model';
import { PanelSettingsOptions, PanelStatusInfo, PanelType } from '../../../models/panel.model';
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
	@ContentChild(SettingsPanelGeneralAdditionalElementsDirective)
	externalGeneralAdditionalElements!: SettingsPanelGeneralAdditionalElementsDirective;

	settingsOptions: typeof PanelSettingsOptions = PanelSettingsOptions;
	selectedOption: PanelSettingsOptions = PanelSettingsOptions.GENERAL;
	showCameraButton: boolean = true;
	showMicrophoneButton: boolean = true;
	showCaptions: boolean = true;
	showThemeSelector: boolean = false;
	isMobile: boolean = false;
	private destroy$ = new Subject<void>();

	/**
	 * @internal
	 * Gets the template for additional elements in general section
	 */
	get generalAdditionalElementsTemplate(): TemplateRef<any> | undefined {
		return this.externalGeneralAdditionalElements?.template;
	}

	private panelService = inject(PanelService);
	private platformService = inject(PlatformService);
	private libService = inject(OpenViduComponentsConfigService);
	public viewportService = inject(ViewportService);

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
		this.subscribeToPanelToggling();
		this.subscribeToDirectives();
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	close() {
		this.panelService.togglePanel(PanelType.SETTINGS);
	}
	onSelectionChanged(option: PanelSettingsOptions) {
		this.selectedOption = option;
	}

	private subscribeToDirectives() {
		this.libService.cameraButton$.pipe(takeUntil(this.destroy$)).subscribe((value: boolean) => (this.showCameraButton = value));
		this.libService.microphoneButton$.pipe(takeUntil(this.destroy$)).subscribe((value: boolean) => (this.showMicrophoneButton = value));
		this.libService.captionsButton$.pipe(takeUntil(this.destroy$)).subscribe((value: boolean) => (this.showCaptions = value));
		this.libService.showThemeSelector$.pipe(takeUntil(this.destroy$)).subscribe((value: boolean) => (this.showThemeSelector = value));
	}

	private subscribeToPanelToggling() {
		this.panelService.panelStatusObs.pipe(takeUntil(this.destroy$)).subscribe((ev: PanelStatusInfo) => {
			if (ev.panelType === PanelType.SETTINGS && !!ev.subOptionType) {
				this.selectedOption = ev.subOptionType as PanelSettingsOptions;
			}
		});
	}
}
