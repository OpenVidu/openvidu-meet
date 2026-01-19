import { Injectable } from '@angular/core';
import { LoggerService, StorageService } from 'openvidu-components-angular';
import { MeetLayoutMode } from '../../domains/meeting/models/layout.model';
import { MeetStorageKeys, STORAGE_PREFIX } from '../models/storage.model';

@Injectable({
	providedIn: 'root'
})
export class MeetStorageService extends StorageService {
	constructor(loggerSrv: LoggerService) {
		super(loggerSrv);
		this.PREFIX_KEY = STORAGE_PREFIX;
	}

	/**
	 * Sets the layout mode in the storage.
	 *
	 * @param layoutMode - The layout mode to be set.
	 */
	setLayoutMode(layoutMode: MeetLayoutMode): void {
		this.set(MeetStorageKeys.LAYOUT_MODE, layoutMode);
	}

	/**
	 * Retrieves the current layout mode from storage.
	 *
	 * @returns {MeetLayoutMode | null} The layout mode stored in the storage, or null if not found.
	 */
	getLayoutMode(): MeetLayoutMode | null {
		return this.get(MeetStorageKeys.LAYOUT_MODE) || null;
	}

	/**
	 * Sets the maximum number of remote speakers to display in Smart Mosaic mode.
	 *
	 * @param count - The maximum number of remote speakers (1-20).
	 */
	setMaxRemoteSpeakers(count: number): void {
		this.set(MeetStorageKeys.MAX_REMOTE_SPEAKERS, count.toString());
	}

	/**
	 * Retrieves the maximum number of remote speakers from storage.
	 *
	 * @returns {number | null} The max remote speakers count, or null if not found.
	 */
	getMaxRemoteSpeakers(): number | null {
		const value = this.get(MeetStorageKeys.MAX_REMOTE_SPEAKERS);
		return value ? parseInt(value, 10) : null;
	}
}
