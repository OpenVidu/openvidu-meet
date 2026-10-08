import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, linkedSignal, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LanguageService } from '../../../../../../shared/services/i18n/language.service';
import { CustomDevice } from '../../../models/device.model';
import { LangOption } from '../../../models/lang.model';
import { PanelSettingsOptions, PanelType } from '../../../models/panel.model';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { MeetingUiConfigService } from '../../../services/config/meeting-ui-config.service';
import { PanelService } from '../../../services/panel/panel.service';
import { ParticipantService } from '../../../services/participant/participant.service';
import { TemplateRegistryService } from '../../../services/template/template-registry.service';
import { ParticipantAvatarComponent } from '../../participant-avatar/participant-avatar.component';
import { AudioDevicesComponent } from '../../settings/audio-devices/audio-devices.component';
import { LangSelectorComponent } from '../../settings/lang-selector/lang-selector.component';
import { ThemeSelectorComponent } from '../../settings/theme-selector/theme-selector.component';
import { VideoDevicesComponent } from '../../settings/video-devices/video-devices.component';

interface SettingsTab {
	option: PanelSettingsOptions;
	icon: string;
	labelKey: string;
}

/**
 * @internal
 */
@Component({
	selector: 'ov-settings-panel',
	imports: [
		MatButtonModule,
		MatIconModule,
		MatTooltipModule,
		NgTemplateOutlet,
		TranslatePipe,
		ParticipantAvatarComponent,
		LangSelectorComponent,
		ThemeSelectorComponent,
		VideoDevicesComponent,
		AudioDevicesComponent
	],
	templateUrl: './settings-panel.component.html',
	styleUrls: ['../panel.component.scss', './settings-panel.component.scss']
})
export class SettingsPanelComponent {
	onVideoEnabledChanged = output<boolean>();
	onVideoDeviceChanged = output<CustomDevice>();
	onAudioEnabledChanged = output<boolean>();
	onAudioDeviceChanged = output<CustomDevice>();
	onLangChanged = output<LangOption>();

	private readonly panelService = inject(PanelService);
	private readonly libService = inject(MeetingUiConfigService);

	readonly settingsOptions = PanelSettingsOptions;
	readonly showCameraControls = this.libService.showCameraControlsSignal;
	readonly showMicrophoneControls = this.libService.showMicrophoneControlsSignal;
	readonly showThemeSelector = this.libService.showThemeSelectorSignal;
	readonly langSelectorVisible = inject(LanguageService).selectorVisible;
	readonly layoutTemplate = inject(TemplateRegistryService).settingsPanelLayout;
	readonly localParticipant = inject(ParticipantService).localParticipant;

	readonly tabs = computed<SettingsTab[]>(() => {
		const tabs: SettingsTab[] = [];

		if (this.showCameraControls() || this.showMicrophoneControls()) {
			tabs.push({
				option: PanelSettingsOptions.AUDIO_VIDEO,
				icon: 'videocam',
				labelKey: 'PANEL.SETTINGS.AUDIO_VIDEO'
			});
		}

		if (this.layoutTemplate()) {
			tabs.push({ option: PanelSettingsOptions.LAYOUT, icon: 'browse', labelKey: 'PANEL.SETTINGS.LAYOUT' });
		}

		tabs.push({
			option: PanelSettingsOptions.GENERAL,
			icon: 'manage_accounts',
			labelKey: 'PANEL.SETTINGS.GENERAL'
		});
		return tabs;
	});

	private readonly requestedOption = linkedSignal(() => {
		const panel = this.panelService.panelOpened();
		return panel.panelType === PanelType.SETTINGS ? panel.subOptionType : undefined;
	});

	readonly selectedOption = computed(() => {
		const tabs = this.tabs();
		return tabs.find((tab) => tab.option === this.requestedOption())?.option ?? tabs[0].option;
	});

	select(option: PanelSettingsOptions) {
		this.requestedOption.set(option);
	}

	close() {
		this.panelService.togglePanel(PanelType.SETTINGS);
	}
}
