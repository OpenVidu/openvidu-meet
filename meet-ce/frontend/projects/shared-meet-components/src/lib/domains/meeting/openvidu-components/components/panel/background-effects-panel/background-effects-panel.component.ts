import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, Signal } from '@angular/core';
import { BackgroundEffect, EffectType } from '../../../models/background-effect.model';
import { PanelType } from '../../../models/panel.model';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { AppMaterialModule } from '../../../openvidu-components-angular.material.module';
import { PanelService } from '../../../services/panel/panel.service';
import { VirtualBackgroundService } from '../../../services/virtual-background/virtual-background.service';

/**
 * @internal
 */
@Component({
	selector: 'ov-background-effects-panel',
	imports: [AppMaterialModule, TranslatePipe],
	templateUrl: './background-effects-panel.component.html',
	styleUrls: ['../panel.component.scss', './background-effects-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class BackgroundEffectsPanelComponent implements OnInit {
	mode = input<'prejoin' | 'meeting'>('meeting');
	onClose = output<void>();

	/**
	 * @internal
	 * @param panelService
	 * @param backgroundService
	 * @param cd
	 */
	private panelService = inject(PanelService);
	private backgroundService = inject(VirtualBackgroundService);

	readonly backgroundSelectedId = this.backgroundService.backgroundIdSelected;
	effectType = EffectType;
	backgroundImages: BackgroundEffect[] = [];
	noEffectAndBlurredBackground: BackgroundEffect[] = [];
	private backgrounds: BackgroundEffect[] = [];

	/**
	 * Computed signal that reactively tracks if virtual background is supported.
	 * Updates automatically when browser support changes.
	 */
	readonly isVirtualBackgroundSupported: Signal<boolean> = computed(() =>
		this.backgroundService.isVirtualBackgroundSupported()
	);

	ngOnInit(): void {
		this.backgrounds = this.backgroundService.getBackgrounds();
		this.noEffectAndBlurredBackground = this.backgrounds.filter((f) => f.type === EffectType.BLUR || f.type === EffectType.NONE);
		this.backgroundImages = this.backgrounds.filter((f) => f.type === EffectType.IMAGE);
	}

	close() {
		if (this.mode() === 'prejoin') {
			this.onClose.emit();
		} else {
			this.panelService.togglePanel(PanelType.BACKGROUND_EFFECTS);
		}
	}

	async applyBackground(effect: BackgroundEffect) {
		await this.backgroundService.applyBackground(effect);
	}
}
