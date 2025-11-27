import { Injectable, signal, computed, effect } from '@angular/core';
import { LayoutService, LoggerService, ViewportService } from 'openvidu-components-angular';
import { MeetLayoutMode } from '../models/layout.model';
import { MeetStorageService } from './storage.service';

@Injectable({
	providedIn: 'root'
})
export class MeetLayoutService extends LayoutService {
	private readonly DEFAULT_SMART_MOSAIC_SPEAKERS = 4;
	private readonly DEFAULT_LAYOUT_MODE = MeetLayoutMode.MOSAIC;

	/** Minimum number of remote speakers that can be displayed when Smart Mosaic layout is enabled */
	readonly MIN_REMOTE_SPEAKERS = 1;
	/** Maximum number of remote speakers that can be displayed when Smart Mosaic layout is enabled */
	readonly MAX_REMOTE_SPEAKERS_LIMIT = 6;

	private readonly _layoutMode = signal<MeetLayoutMode>(MeetLayoutMode.MOSAIC);
	readonly layoutMode = this._layoutMode.asReadonly();
	private readonly _maxRemoteSpeakers = signal<number>(this.DEFAULT_SMART_MOSAIC_SPEAKERS);
	readonly maxRemoteSpeakers = this._maxRemoteSpeakers.asReadonly();

	/**
	 * Computed signal that checks if Smart Mosaic layout is enabled
	 * This is automatically recomputed when layoutMode changes
	 */
	readonly isSmartMosaicEnabled = computed(() => this._layoutMode() === MeetLayoutMode.SMART_MOSAIC);

	constructor(
		protected loggerService: LoggerService,
		protected viewPortService: ViewportService,
		private storageService: MeetStorageService
	) {
		super(loggerService, viewPortService);
		this.log = this.loggerService.get('MeetLayoutService');

		this.initializeLayoutMode();
		this.initializeMaxRemoteSpeakers();

		// Effect to persist layout mode changes to storage
		effect(() => {
			const mode = this._layoutMode();
			this.storageService.setLayoutMode(mode);
			this.log.d(`Layout mode persisted to storage: ${mode}`);
		});

		// Effect to persist max remote speakers changes to storage
		effect(() => {
			const count = this._maxRemoteSpeakers();
			this.storageService.setMaxRemoteSpeakers(count);
			this.log.d(`Max remote speakers persisted to storage: ${count}`);
		});
	}

	/**
	 * Initializes the layout mode for the application.
	 * Retrieves the layout mode from storage or defaults to MOSAIC.
	 */
	private initializeLayoutMode(): void {
		const layoutMode = this.storageService.getLayoutMode();
		if (layoutMode && Object.values(MeetLayoutMode).includes(layoutMode)) {
			this._layoutMode.set(layoutMode);
		} else {
			this._layoutMode.set(this.DEFAULT_LAYOUT_MODE);
		}
		this.log.d(`Layout mode initialized: ${this._layoutMode()}`);
	}

	/**
	 * Initializes the max remote speakers count from storage.
	 */
	private initializeMaxRemoteSpeakers(): void {
		const count = this.storageService.getMaxRemoteSpeakers();
		if (count && count >= this.MIN_REMOTE_SPEAKERS && count <= this.MAX_REMOTE_SPEAKERS_LIMIT) {
			this._maxRemoteSpeakers.set(count);
		} else {
			this._maxRemoteSpeakers.set(this.DEFAULT_SMART_MOSAIC_SPEAKERS);
		}
		this.log.d(`Max remote speakers initialized: ${this._maxRemoteSpeakers()}`);
	}

	/**
	 * Checks if the current layout mode is set to display the last speakers.
	 * @deprecated Use isSmartMosaicEnabled computed signal instead
	 * @returns {boolean} `true` if the layout mode is set to `SMART_MOSAIC`, otherwise `false`.
	 */
	isLastSpeakersLayoutEnabled(): boolean {
		return this._layoutMode() === MeetLayoutMode.SMART_MOSAIC;
	}

	/**
	 * Sets the layout mode and triggers layout update.
	 * This method validates the mode and only updates if it's different.
	 *
	 * @param layoutMode - The new layout mode to set
	 */
	setLayoutMode(layoutMode: MeetLayoutMode): void {
		const currentMode = this._layoutMode();
		const isValidMode = Object.values(MeetLayoutMode).includes(layoutMode);

		if (!isValidMode) {
			this.log.w(`Invalid layout mode: ${layoutMode}`);
			return;
		}

		if (currentMode === layoutMode) {
			this.log.d(`Layout mode already set to: ${layoutMode}`);
			return;
		}

		this.log.d(`Layout mode updated from ${currentMode} to ${layoutMode}`);
		this._layoutMode.set(layoutMode);
		this.update();
	}

	/**
	 * Sets the maximum number of remote speakers to display in Smart Mosaic mode.
	 * Validates the count is between the default minimum and the default maximum.
	 *
	 * @param count - Number of remote participants to display (default minimum to default maximum)
	 */
	setMaxRemoteSpeakers(count: number): void {
		if (count < this.MIN_REMOTE_SPEAKERS || count > this.MAX_REMOTE_SPEAKERS_LIMIT) {
			this.log.w(
				`Invalid max remote speakers count: ${count}. Must be between ${this.MIN_REMOTE_SPEAKERS} and ${this.MAX_REMOTE_SPEAKERS_LIMIT}`
			);
			return;
		}

		const currentCount = this._maxRemoteSpeakers();
		if (currentCount === count) {
			this.log.d(`Max remote speakers already set to: ${count}`);
			return;
		}

		this.log.d(`Max remote speakers updated from ${currentCount} to ${count}`);
		this._maxRemoteSpeakers.set(count);

		// Trigger layout update if in Smart Mosaic mode
		if (this.isSmartMosaicEnabled()) {
			this.update();
		}
	}

	/**
	 * Gets the current layout mode.
	 * @deprecated Use layoutMode signal directly instead
	 * @returns {MeetLayoutMode} The current layout mode
	 */
	getLayoutMode(): MeetLayoutMode {
		return this._layoutMode();
	}

	/**
	 * Gets the current max remote speakers count.
	 * @returns {number} The current max remote speakers count
	 */
	getMaxRemoteSpeakers(): number {
		return this._maxRemoteSpeakers();
	}
}
