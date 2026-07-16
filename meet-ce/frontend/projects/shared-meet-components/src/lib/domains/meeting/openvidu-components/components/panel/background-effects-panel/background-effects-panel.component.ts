import { Component, computed, inject, input, OnInit, output, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BackgroundCategory, BackgroundEffect, EffectType } from '../../../models/background-effect.model';
import { PanelType } from '../../../models/panel.model';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { PanelService } from '../../../services/panel/panel.service';
import { VirtualBackgroundService } from '../../../services/virtual-background/virtual-background.service';

/**
 * @internal
 */
@Component({
	selector: 'ov-background-effects-panel',
	imports: [MatButtonModule, MatIconModule, MatTooltipModule, TranslatePipe],
	templateUrl: './background-effects-panel.component.html',
	styleUrls: ['../panel.component.scss', './background-effects-panel.component.scss']
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
	noEffectAndBlurredBackground: BackgroundEffect[] = [];
	/**
	 * Background images grouped by category, in the order they are displayed in the panel.
	 * Categories with no images are filtered out.
	 */
	imageCategories: { category: BackgroundCategory; titleKey: string; images: BackgroundEffect[] }[] = [];
	private backgrounds: BackgroundEffect[] = [];

	private readonly categoryTitleKeys: Record<BackgroundCategory, string> = {
		[BackgroundCategory.PROFESSIONAL]: 'PANEL.BACKGROUND.CATEGORY_PROFESSIONAL',
		[BackgroundCategory.HOME_OFFICE]: 'PANEL.BACKGROUND.CATEGORY_HOME_OFFICE',
		[BackgroundCategory.CREATIVE]: 'PANEL.BACKGROUND.CATEGORY_CREATIVE'
	};

	/**
	 * Computed signal that reactively tracks if virtual background is supported.
	 * Updates automatically when browser support changes.
	 */
	readonly isVirtualBackgroundSupported: Signal<boolean> = computed(() =>
		this.backgroundService.isVirtualBackgroundSupported()
	);

	/**
	 * Whether background-processor support detection has finished. Until it has, the panel
	 * must not show the "not supported" message (the processors module is still loading).
	 */
	readonly isSupportDetected: Signal<boolean> = this.backgroundService.isSupportDetected;

	ngOnInit(): void {
		// Opening the panel is the on-demand trigger to lazily load the background-processors
		// module (MediaPipe) and detect support.
		void this.backgroundService.ensureBackgroundSupportReady();

		this.backgrounds = this.backgroundService.getBackgrounds();
		this.noEffectAndBlurredBackground = this.backgrounds.filter((f) => f.type === EffectType.BLUR || f.type === EffectType.NONE);

		const images = this.backgrounds.filter((f) => f.type === EffectType.IMAGE);
		this.imageCategories = (Object.keys(this.categoryTitleKeys) as BackgroundCategory[])
			.map((category) => ({
				category,
				titleKey: this.categoryTitleKeys[category],
				images: images.filter((img) => img.category === category)
			}))
			.filter((group) => group.images.length > 0);
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
