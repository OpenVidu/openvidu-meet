import { computed, inject, Injectable, Signal, signal } from '@angular/core';
import { SwitchBackgroundProcessorOptions } from '@livekit/track-processors';
import { RuntimeConfigService } from '../../../../../shared/services/runtime-config.service';
import { BackgroundEffect, EffectType } from '../../models/background-effect.model';
import { LoggerService } from '../logger/logger.service';
import { OpenViduService } from '../openvidu/openvidu.service';
import { StorageService } from '../storage/storage.service';
import { VideoTrackProcessorService } from '../track-processor/video-track-processor.service';
/**
 * @internal
 */
@Injectable({
	providedIn: 'root'
})
export class VirtualBackgroundService {
	private readonly openviduService = inject(OpenViduService);
	private readonly videoTrackProcessorService = inject(VideoTrackProcessorService);
	private readonly storageService = inject(StorageService);
	private readonly log = inject(LoggerService).get('VirtualBackgroundService');
	private readonly runtimeConfigService = inject(RuntimeConfigService);
	private readonly backgroundIdSelectedWritable = signal<string>('');
	readonly backgroundIdSelected = this.backgroundIdSelectedWritable.asReadonly();

	private readonly backgroundsBasePath = '/assets/backgrounds';

	private buildBackgroundPath(path: string): string {
		return this.runtimeConfigService.resolvePath(`${this.backgroundsBasePath}/${path}`);
	}

	private createImageBackground(id: number): BackgroundEffect {
		const fileName = `bg-${id}.webp`;

		return {
			id: id.toString(),
			type: EffectType.IMAGE,
			thumbnail: this.buildBackgroundPath(`thumbnails/${fileName}`),
			src: this.buildBackgroundPath(fileName)
		};
	}

	backgrounds: BackgroundEffect[] = [
		{ id: 'no_effect', type: EffectType.NONE, thumbnail: 'block' },
		{ id: 'soft_blur', type: EffectType.BLUR, thumbnail: 'blur_on' },
		{ id: 'hard_blur', type: EffectType.BLUR, thumbnail: 'blur_on' },
		...Array.from({ length: 19 }, (_, index) => this.createImageBackground(index + 1))
	];

	private SOFT_BLUR_INTENSITY = 20;
	private HARD_BLUR_INTENSITY = 60;

	getBackgrounds(): BackgroundEffect[] {
		return this.backgrounds;
	}

	/**
	 * Computed signal that checks if virtual background is supported (requires GPU).
	 * Reactively tracks the support status from OpenViduService.
	 */
	readonly isVirtualBackgroundSupported: Signal<boolean> = computed(() =>
		this.videoTrackProcessorService.isBackgroundProcessorSupported()
	);

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
	 * Works both in prejoin (using OpenViduService's processor) and in-room states.
	 * The background processor is centralized in OpenViduService for consistency.
	 */
	async applyBackground(bg: BackgroundEffect) {
		// Check if virtual background is supported before proceeding
		if (!this.isVirtualBackgroundSupported()) {
			this.log.w('Virtual background not supported (GPU disabled). Skipping background application.');
			return;
		}

		// If the background is already applied, do nothing
		if (this.backgroundIsAlreadyApplied(bg.id)) return;

		try {
			const options = this.getBackgroundOptions(bg);
			const videoTrack = await this.openviduService.getCurrentVideoTrack();
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
				const videoTrack = await this.openviduService.getCurrentVideoTrack();
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
