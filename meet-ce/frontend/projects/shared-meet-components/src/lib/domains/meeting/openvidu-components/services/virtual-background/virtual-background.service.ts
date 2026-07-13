import { computed, inject, Injectable, Signal, signal } from '@angular/core';
import type { SwitchBackgroundProcessorOptions } from '@livekit/track-processors';
import { AssetsService } from '../../../../../shared/services/assets.service';
import { BackgroundCategory, BackgroundEffect, EffectType } from '../../models/background-effect.model';
import { LocalTrackService } from '../local-track/local-track.service';
import { StorageService } from '../storage/storage.service';
import { VideoTrackProcessorService } from '../track-processor/video-track-processor.service';
import { LoggerService } from '../../../../../shared/services/logger.service';

function categoryPrefix(category: BackgroundCategory): string {
	return category.toLowerCase().replace('_', '-');
}
/**
 * @internal
 */
@Injectable({
	providedIn: 'root'
})
export class VirtualBackgroundService {
	private readonly localTrackService = inject(LocalTrackService);
	private readonly videoTrackProcessorService = inject(VideoTrackProcessorService);
	private readonly storageService = inject(StorageService);
	private readonly log = inject(LoggerService).get('VirtualBackgroundService');
	private readonly assets = inject(AssetsService);
	private readonly backgroundIdSelectedWritable = signal<string>('');
	readonly backgroundIdSelected = this.backgroundIdSelectedWritable.asReadonly();

	private buildBackgroundPath(path: string): string {
		return this.assets.background(path);
	}

	/**
	 * Background images available per category. Each id maps directly to the asset files:
	 *   src/assets/backgrounds/<category>/<id>.webp            (full image)
	 *   src/assets/backgrounds/<category>/thumbnails/<id>.webp (thumbnail)
	 * The order here is the order shown within each category.
	 *
	 * To add an image: drop the two files and add its id here.
	 * To remove one: delete the two files and remove its id here.
	 */
	private readonly imageBackgrounds: Record<BackgroundCategory, string[]> = {
		[BackgroundCategory.PROFESSIONAL]: ['professional-1', 'professional-2', 'professional-3', 'professional-4'],
		[BackgroundCategory.HOME_OFFICE]: ['home-office-1', 'home-office-2', 'home-office-3', 'home-office-4'],
		[BackgroundCategory.CREATIVE]: [
			'creative-1',
			'creative-2',
			'creative-3',
			'creative-4',
			'creative-5',
			'creative-6',
			'creative-7'
		]
	};

	private createImageBackground(id: string, category: BackgroundCategory): BackgroundEffect {
		const prefix = categoryPrefix(category);
		const fileName = `${id}.webp`;

		return {
			id,
			type: EffectType.IMAGE,
			thumbnail: this.buildBackgroundPath(`${prefix}/thumbnails/${fileName}`),
			src: this.buildBackgroundPath(`${prefix}/${fileName}`),
			category
		};
	}

	private createImageBackgrounds(): BackgroundEffect[] {
		return Object.entries(this.imageBackgrounds).flatMap(([category, ids]) =>
			ids.map((id) => this.createImageBackground(id, category as BackgroundCategory))
		);
	}

	backgrounds: BackgroundEffect[] = [
		{ id: 'no_effect', type: EffectType.NONE, thumbnail: 'block' },
		{ id: 'soft_blur', type: EffectType.BLUR, thumbnail: 'blur_on' },
		{ id: 'hard_blur', type: EffectType.BLUR, thumbnail: 'blur_on' },
		...this.createImageBackgrounds()
	];

	private SOFT_BLUR_INTENSITY = 20;
	private HARD_BLUR_INTENSITY = 60;

	getBackgrounds(): BackgroundEffect[] {
		return this.backgrounds;
	}

	/**
	 * Computed signal that checks if virtual background is supported (requires GPU).
	 * Reactively tracks the support status from LocalTrackService.
	 */
	readonly isVirtualBackgroundSupported: Signal<boolean> = computed(() =>
		this.videoTrackProcessorService.isBackgroundProcessorSupported()
	);

	/**
	 * Whether background-processor support detection has completed. Lets the UI distinguish
	 * "still detecting" (module loading) from "detected as unsupported".
	 */
	readonly isSupportDetected: Signal<boolean> = this.videoTrackProcessorService.isSupportDetected;

	/**
	 * Triggers the lazy load of the background-processors module and support detection.
	 * Call this when the user opens the background-effects UI so support state is ready.
	 */
	async ensureBackgroundSupportReady(): Promise<void> {
		await this.videoTrackProcessorService.ensureReady();
	}

	isBackgroundApplied(): boolean {
		const bgSelected = this.backgroundIdSelected();
		return !!bgSelected && bgSelected !== 'no_effect';
	}

	async applyBackgroundFromStorage() {
		const bgId = this.storageService.getBackground();
		if (!!bgId) {
			const background = this.backgrounds.find((bg) => bg.id === bgId);
			if (background) {
				await this.applyBackground(background);
			}
		}
	}

	/**
	 * Applies a background effect to the local video track.
	 * Works both in prejoin (using LocalTrackService's processor) and in-room states.
	 * The background processor is centralized in LocalTrackService for consistency.
	 */
	async applyBackground(bg: BackgroundEffect) {
		// Ensure the (lazily-loaded) processors module is ready and support has been detected
		// before checking support — this is the on-demand trigger for restoring a saved
		// background on join and for the first effect the user applies.
		await this.videoTrackProcessorService.ensureReady();

		// Check if virtual background is supported before proceeding
		if (!this.isVirtualBackgroundSupported()) {
			this.log.w('Virtual background not supported (GPU disabled). Skipping background application.');
			return;
		}

		// If the background is already applied, do nothing
		if (this.backgroundIsAlreadyApplied(bg.id)) return;

		try {
			const options = this.getBackgroundOptions(bg);
			const videoTrack = await this.localTrackService.getCurrentVideoTrack();
			await this.videoTrackProcessorService.switchBackgroundMode(options, videoTrack);

			this.storageService.setBackground(bg.id);
			this.backgroundIdSelectedWritable.set(bg.id);
			this.log.d('Background applied:', options);
		} catch (error) {
			this.log.e('Error applying background effect:', error);
		}
	}

	async removeBackground() {
		if (this.isBackgroundApplied()) {
			this.backgroundIdSelectedWritable.set('no_effect');
			try {
				const videoTrack = await this.localTrackService.getCurrentVideoTrack();
				await this.videoTrackProcessorService.switchBackgroundMode({ mode: 'disabled' }, videoTrack);
			} catch (e) {
				this.log.w('Error disabling processor:', e);
			}
			this.storageService.removeBackground();
		}
	}

	private getBackgroundOptions(bg: BackgroundEffect): SwitchBackgroundProcessorOptions {
		if (bg.type === EffectType.NONE) {
			return { mode: 'disabled' };
		} else if (bg.type === EffectType.IMAGE && bg.src) {
			return { mode: 'virtual-background', imagePath: bg.src };
		} else if (bg.type === EffectType.BLUR) {
			return {
				mode: 'background-blur',
				blurRadius: bg.id === 'soft_blur' ? this.SOFT_BLUR_INTENSITY : this.HARD_BLUR_INTENSITY
			};
		}
		return { mode: 'disabled' };
	}

	private backgroundIsAlreadyApplied(backgroundId: string): boolean {
		return backgroundId === this.backgroundIdSelected();
	}
}
