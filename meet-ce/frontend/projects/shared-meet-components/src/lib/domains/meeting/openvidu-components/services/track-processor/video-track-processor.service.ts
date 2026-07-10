import { inject, Injectable, signal, Signal } from '@angular/core';
import type {
	BackgroundProcessorWrapper,
	SwitchBackgroundProcessorOptions
} from '@livekit/track-processors';
import { RuntimeConfigService } from '../../../../../shared/services/runtime-config.service';
import { OVLocalVideoTrack } from '../livekit-adapter';
import { PlatformService } from '../platform/platform.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../shared/models/logger.model';

// Selfie-segmenter models. Landscape (256x144) is tuned for wide desktop video;
// the general/square model (256x256) segments portrait mobile capture better, so
// physical mobile devices use it (the landscape model would distort a portrait frame).
const SELFIE_SEGMENTER_LANDSCAPE = 'assets/mediapipe/selfie_segmenter_landscape.tflite';
const SELFIE_SEGMENTER_GENERAL = 'assets/mediapipe/selfie_segmenter.tflite';
// Directory holding the MediaPipe tasks-vision WASM runtime, self-hosted from the
// Meet server instead of the default jsdelivr CDN (offline-capable, no 3rd party).
const MEDIAPIPE_WASM_PATH = 'assets/mediapipe/wasm';

/** The `@livekit/track-processors` module, loaded lazily via dynamic import. */
type TrackProcessorsModule = typeof import('@livekit/track-processors');

/**
 * Manages the lifecycle of the LiveKit background video track processor.
 *
 * Responsibilities:
 * - Lazily loading `@livekit/track-processors` (which bundles the heavy MediaPipe /
 *   tasks-vision runtime) only when a background effect is actually needed
 * - Detecting background-processor support on demand
 * - Attaching the processor to video tracks and switching background modes
 *
 * `@livekit/track-processors` (and its MediaPipe dependency, ~1.3 MB) is imported with a
 * dynamic `import()` rather than statically, so it lands in its own chunk that is fetched
 * only when the user opens the background-effects panel or restores a saved background —
 * not on every meeting join, and never for participants who don't use virtual backgrounds.
 *
 * This service has no dependency on OpenViduService, keeping the processing concern
 * isolated and ready to be extended alongside a future AudioTrackProcessorService.
 *
 * @internal
 */
@Injectable({
	providedIn: 'root'
})
export class VideoTrackProcessorService {
	private backgroundProcessor?: BackgroundProcessorWrapper;

	/** Cached `@livekit/track-processors` module + its in-flight load promise. */
	private processorsModule?: TrackProcessorsModule;
	private moduleLoadPromise?: Promise<TrackProcessorsModule>;
	private supportDetectionPromise?: Promise<void>;

	private _isBackgroundProcessorSupported = signal(false);
	private _isSupportDetected = signal(false);

	/**
	 * Readonly signal indicating whether the background processor is available.
	 * False when the browser has no GPU support, initialisation failed, or support has
	 * not been detected yet (detection runs lazily — see {@link ensureReady}).
	 */
	readonly isBackgroundProcessorSupported: Signal<boolean> = this._isBackgroundProcessorSupported.asReadonly();

	/**
	 * Readonly signal indicating whether support detection has completed. Consumers use it to
	 * tell "not detected yet" apart from "detected as unsupported" (e.g. to avoid flashing a
	 * "not supported" message while the processors module is still loading).
	 */
	readonly isSupportDetected: Signal<boolean> = this._isSupportDetected.asReadonly();

	/**
	 * Stores the last applied options so the effect can be restored after a camera switch.
	 */
	private currentBackgroundOptions: SwitchBackgroundProcessorOptions | null = null;

	private log: ILogger = inject(LoggerService).get('VideoTrackProcessorService');
	private readonly runtimeConfigService = inject(RuntimeConfigService);
	private readonly platformService = inject(PlatformService);

	/**
	 * Lazily loads the `@livekit/track-processors` module, caching both the resolved module
	 * and its in-flight promise so concurrent callers share a single dynamic import.
	 */
	private async loadModule(): Promise<TrackProcessorsModule> {
		if (this.processorsModule) return this.processorsModule;
		this.moduleLoadPromise ??= import('@livekit/track-processors');
		this.processorsModule = await this.moduleLoadPromise;
		return this.processorsModule;
	}

	/**
	 * Ensures the processors module is loaded and background-processor support has been detected.
	 * Idempotent and safe to call repeatedly (concurrent calls share one detection run). This is
	 * what triggers the lazy download of the MediaPipe-backed module, so it should be called only
	 * when the user actually engages with virtual backgrounds (panel opened, effect applied).
	 */
	async ensureReady(): Promise<void> {
		if (this._isSupportDetected()) return;
		this.supportDetectionPromise ??= this.detectSupport();
		await this.supportDetectionPromise;
	}

	private async detectSupport(): Promise<void> {
		try {
			const tp = await this.loadModule();
			const supported = tp.supportsBackgroundProcessors();
			this._isBackgroundProcessorSupported.set(supported);
			if (!supported) {
				this.log.w('Background processors not supported in this browser (GPU may be disabled)');
			}
		} catch (error: any) {
			this.log.w('Failed to load background processors module:', error?.message || error);
			this._isBackgroundProcessorSupported.set(false);
		} finally {
			this._isSupportDetected.set(true);
		}
	}

	private getAssetPaths() {
		// On physical mobile devices (typically portrait capture) the general/square
		// model segments better than the landscape one. Chosen at processor init.
		const modelPath = this.platformService.isPhysicalMobileDevice()
			? SELFIE_SEGMENTER_GENERAL
			: SELFIE_SEGMENTER_LANDSCAPE;
		return {
			modelAssetPath: this.runtimeConfigService.resolveUrl(modelPath),
			tasksVisionFileSet: this.runtimeConfigService.resolveUrl(MEDIAPIPE_WASM_PATH)
		};
	}

	/** Creates the shared background processor on first use (idempotent). */
	private createProcessorIfNeeded(tp: TrackProcessorsModule): void {
		if (this.backgroundProcessor) return;
		this.backgroundProcessor = tp.BackgroundProcessor({
			mode: 'disabled',
			assetPaths: this.getAssetPaths()
		});
	}

	/**
	 * Switches the active background mode.
	 *
	 * Loads the processors module on demand, then creates and attaches the processor to the
	 * given track on first use (previously this happened eagerly at startup). Firefox / non-modern
	 * browsers keep their lazy attach/detach handling.
	 *
	 * @param options - New background mode options
	 * @param videoTrack - The local video track to attach the processor to
	 * @internal
	 */
	async switchBackgroundMode(
		options: SwitchBackgroundProcessorOptions,
		videoTrack?: OVLocalVideoTrack
	): Promise<void> {
		await this.ensureReady();

		if (!this.isBackgroundProcessorSupported()) {
			this.log.w('Background processor not supported (GPU disabled). Virtual background is disabled.');
			return;
		}

		const tp = this.processorsModule;
		if (!tp) return;

		try {
			if (!tp.supportsModernBackgroundProcessors()) {
				if (videoTrack) {
					await this.handleLazyProcessorAttachment(options.mode, videoTrack);
				}
			} else {
				// Modern browsers: create the processor on first use and attach it to the active
				// track (this used to be pre-done at startup for every meeting).
				this.createProcessorIfNeeded(tp);
				if (videoTrack && !videoTrack.getProcessor() && this.backgroundProcessor) {
					await videoTrack.setProcessor(this.backgroundProcessor);
				}
			}

			if (this.backgroundProcessor) {
				await this.backgroundProcessor.switchTo(options);
				this.currentBackgroundOptions = options;
				this.log.d('Background mode switched:', options);
			}
		} catch (error: any) {
			this.log.e('Failed to switch background mode:', error?.message || error);
			this._isBackgroundProcessorSupported.set(false);
			// Do not rethrow – gracefully degrade rather than crashing the call site.
		}
	}

	/**
	 * Re-attaches the active background processor to a freshly-created video track (e.g. after a
	 * camera switch). No-op when virtual backgrounds have never been engaged — in that case the
	 * processors module is not even loaded, so a new track incurs no processing cost.
	 *
	 * @param videoTrack - The new video track to attach the processor to
	 * @internal
	 */
	async applyToVideoTrack(videoTrack: OVLocalVideoTrack): Promise<void> {
		// If the module was never loaded, no background has ever been applied — nothing to restore.
		const tp = this.processorsModule;
		if (!tp || !this.isBackgroundProcessorSupported()) return;

		if (tp.supportsModernBackgroundProcessors()) {
			if (!this.backgroundProcessor) return;
			try {
				await videoTrack.setProcessor(this.backgroundProcessor);
				this.log.d('Background processor applied to video track');
			} catch (error: any) {
				this.log.w('Failed to apply background processor to video track:', error?.message || error);
				this._isBackgroundProcessorSupported.set(false);
			}
		} else if (this.currentBackgroundOptions && this.currentBackgroundOptions.mode !== 'disabled') {
			// Firefox: processor is not pre-allocated; create on first use and restore the effect.
			try {
				this.createProcessorIfNeeded(tp);
				if (this.backgroundProcessor) {
					await videoTrack.setProcessor(this.backgroundProcessor);
					// The transformer options are reset on init for non-modern browsers; re-apply explicitly.
					await this.backgroundProcessor.switchTo(this.currentBackgroundOptions);
					this.log.d('Background effect restored on new track (non-modern):', this.currentBackgroundOptions);
				}
			} catch (error: any) {
				this.log.w('Failed to restore background processor (non-modern):', error?.message || error);
			}
		}
	}

	/**
	 * Handles lazy processor attachment for browsers without modern processor support (Firefox).
	 * Creates and attaches the processor on-demand when an effect is first activated,
	 * and detaches it when the effect is disabled.
	 */
	private async handleLazyProcessorAttachment(
		mode: SwitchBackgroundProcessorOptions['mode'],
		videoTrack: OVLocalVideoTrack
	): Promise<void> {
		const tp = this.processorsModule;
		if (!tp) return;

		const hasProcessor = Boolean(videoTrack.getProcessor());
		const isDisabled = mode === 'disabled';

		if (!isDisabled && !hasProcessor) {
			try {
				if (!this.backgroundProcessor) {
					this.log.d('Creating background processor on-demand');
					this.createProcessorIfNeeded(tp);
				}
				this.log.d('Attaching processor on effect activation (lazy loading)');
				if (this.backgroundProcessor) {
					await videoTrack.setProcessor(this.backgroundProcessor);
				}
			} catch (error: any) {
				this.log.w('Failed to attach background processor (GPU may be disabled):', error?.message || error);
				this._isBackgroundProcessorSupported.set(false);
			}
			return;
		}

		if (isDisabled && hasProcessor) {
			this.log.d('Stopping processor on effect deactivation');
			await videoTrack.stopProcessor();
		}
	}
}
